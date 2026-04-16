import { NextResponse } from "next/server";
import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import { executeArrange } from "@/lib/frameworks/arrange-execute";
import { validateFrameworkConfig } from "@/lib/frameworks/custom/validate";
import {
  proposeFrameworkToolDescription,
  proposeFrameworkToolName,
  proposeFrameworkToolSchema,
} from "@/lib/frameworks/custom/tool";
import { buildDescribeSystemPrompt } from "@/lib/frameworks/custom/prompt";
import { applyOps } from "@/lib/frameworks/universal";
import { ingestSources, IngestionError, type RawInput, type IngestedSource } from "@/lib/ingestion";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────────────────
// /api/framework-describe
//
// Two-call pipeline:
//  1. Claude generates a FrameworkConfig from the user's description.
//  2. executeArrange populates the empty seed with realistic content.
//
// Accepts both JSON (description-only, legacy) and FormData (description +
// URLs + files). When sources are present, they are fetched via the shared
// ingestion pipeline (Jina Reader for URLs, mammoth/PDF/CSV for files) and
// their text is passed in as context to BOTH Claude calls so the agent can
// pick a framework that matches the content and seed it with specifics.
// ──────────────────────────────────────────────────────────────────────────────

type DescribeRes =
  | {
      ok: true;
      config: FrameworkConfig;
      populatedMap: UniversalMap;
      populationSummary?: string;
      warnings?: string[];
    }
  | { ok: false; error: string };

// Truncate fetched content to this many chars before sending to Claude, so a
// single long article or file can't blow the context budget of our synth call.
const MAX_CONTEXT_CHARS = 24_000;

export async function POST(req: Request): Promise<Response> {
  // ── Parse (support both JSON and FormData) ─────────────────────────────────
  let description = "";
  let existingIds: string[] = [];
  let rawInputs: RawInput[] = [];

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      description = String(fd.get("description") ?? "").trim();
      const existingRaw = fd.get("existingIds");
      if (typeof existingRaw === "string" && existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed)) existingIds = parsed.filter((x): x is string => typeof x === "string");
        } catch { /* ignore */ }
      }
      for (const [key, value] of fd.entries()) {
        if (key.startsWith("file_") && value instanceof File) {
          rawInputs.push({ type: "file", file: value, name: value.name });
        } else if (key.startsWith("url_") && typeof value === "string" && value.trim()) {
          rawInputs.push({ type: "url", url: value.trim() });
        }
      }
    } else {
      const body = (await req.json()) as { description?: string; existingIds?: string[] };
      description = (body.description ?? "").trim();
      existingIds = Array.isArray(body.existingIds) ? body.existingIds : [];
    }
  } catch {
    return respond({ ok: false, error: "Invalid request body" }, 400);
  }

  if (description.length < 3 || description.length > 500) {
    return respond(
      { ok: false, error: "description must be between 3 and 500 characters" },
      400
    );
  }

  // ── Optional: fetch + extract sources ──────────────────────────────────────
  let sourceContext = "";
  const warnings: string[] = [];
  if (rawInputs.length > 0) {
    try {
      const sources = await ingestSources(rawInputs);
      sourceContext = formatSourceContext(sources, MAX_CONTEXT_CHARS);
    } catch (e) {
      // Non-fatal: continue without source context. Warn the user so they know
      // why their URL / file didn't inform the generated framework.
      const msg = e instanceof IngestionError ? e.message : (e as Error).message;
      warnings.push(`Could not ingest sources: ${msg}`);
    }
  }

  // ── Call 1: synthesize config ───────────────────────────────────────────────
  let configInput: unknown;
  try {
    configInput = await synthesizeConfig(description, sourceContext);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return respond({ ok: false, error: `Synthesis failed: ${msg}` }, 502);
  }

  const v = validateFrameworkConfig(configInput, existingIds);
  if (!v.ok) {
    return respond(
      { ok: false, error: `Agent produced an invalid config: ${v.reason}` },
      502
    );
  }
  const config = v.config;

  // ── Call 2: populate the seed ──────────────────────────────────────────────
  let populatedMap = config.seed;
  let populationSummary: string | undefined;

  const populateInstruction = populateInstructionFor(config, sourceContext);
  const populateResult = await executeArrange({
    map: config.seed,
    config,
    instruction: populateInstruction,
  });

  if (populateResult.ok) {
    const applied = applyOps(config.seed, populateResult.ops);
    if (applied.ok) {
      populatedMap = applied.map;
      populationSummary = populateResult.summary;
    } else {
      warnings.push(
        `Populate ops couldn't apply cleanly (${applied.reason}); seed left empty.`
      );
    }
  } else {
    warnings.push(`Populate step failed: ${populateResult.error}. Seed left empty.`);
  }

  return respond(
    {
      ok: true,
      config,
      populatedMap,
      ...(populationSummary ? { populationSummary } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    200
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Call 1: propose_framework tool call (Claude)
// ──────────────────────────────────────────────────────────────────────────────

async function synthesizeConfig(description: string, sourceContext: string): Promise<unknown> {
  const anthropic = getAnthropic();
  const systemPrompt = buildDescribeSystemPrompt();
  const userText = sourceContext
    ? `User description: ${description}

Source material (use this to inform the framework choice and structure — the populate step will fill cards from this content):

${sourceContext}

Return a FrameworkConfig via the propose_framework tool. Design columns/rows that match the shape of the source material.`
    : `User description: ${description}

Return a FrameworkConfig via the propose_framework tool.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createParams: any = {
    model: getAgentModel(),
    max_tokens: 4000,
    thinking: { type: "enabled", budget_tokens: 2000 },
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    tools: [
      {
        name: proposeFrameworkToolName,
        description: proposeFrameworkToolDescription,
        input_schema: proposeFrameworkToolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [
      { role: "user", content: [{ type: "text", text: userText }] },
    ],
  };

  const msg = await anthropic.messages.create(createParams);
  const tool = msg.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Agent did not return a tool call");
  }
  return tool.input;
}

// ──────────────────────────────────────────────────────────────────────────────
// Populate instruction template — tuned per layout, and enriched with source
// material when present so the agent pulls specific cards from it.
// ──────────────────────────────────────────────────────────────────────────────

function populateInstructionFor(config: FrameworkConfig, sourceContext: string): string {
  const base = sourceContext
    ? `Populate this framework with specific content drawn from the source material below. Cards should be concrete quotes, findings, or data points from the sources (8–16 words each). Do NOT invent content — stay grounded in what the sources say.

Source material:

${sourceContext}

`
    : `Populate this framework with realistic example content that a user would see as a useful starting point. Keep cards specific and concrete (8–16 words each). `;

  if (config.layout === "matrix") {
    return base + "Aim for 2–4 items in every cell — this is a dense grid where every (col, row) position should be filled.";
  }
  if (config.layout === "kanban") {
    return base + "Each column should hold 3–7 cards. If the framework naturally has sub-items (e.g. checklist items under a goal, quotes under a theme), use sub-items via addCard with parentCardId for the nested detail.";
  }
  if (config.layout === "freeform") {
    return (
      base +
      `
**This is a freeform spatial framework.** Before populating content cards, decide whether the framework's shape implies background geometry. Most named spatial frameworks do — examples:
- Double Diamond → two \`diamond\` shape cards (Discover→Define on the left, Develop→Deliver on the right)
- Venn / Ikigai → 2–3 overlapping \`circle\` shape cards
- Kano Model → 3 horizontal \`rectangle\`/\`ellipse\` band shape cards
- Business Motivation Model / SWOT-as-regions → \`rectangle\` shape cards

If the framework's identity implies a spatial shape, emit the shape cards FIRST via \`addCard\` with meta keys \`shapeKind\`, \`x\`, \`y\`, \`shapeWidth\`, \`shapeHeight\`. The card's text is the shape's label. Use a 1600×1000 board: shapes typically 400–600px wide/tall.

Then emit 2–6 content cards per shape region, setting each content card's \`meta.x\`/\`meta.y\` so it visually sits INSIDE the shape. Pick a col id for each content card based on which shape / region it belongs to (this is how AI later rearrangements track regional intent).

If the framework is a loose mind-map / brainstorm without implied geometry, skip the shape cards and place 8–15 content cards with x/y laid out in clusters by col.
      `.trim()
    );
  }
  return base + "Target ~50–70% fill across (col, row) positions; leave cells empty where there is no genuine insight. Use sub-items when a card has naturally nested detail.";
}

// Concatenate ingested sources into a single context block. PDF sources are
// skipped (they'd be binary base64 here — we don't forward them on the describe
// path; users wanting PDF-grounded content should use /api/generate with a
// framework selected).
function formatSourceContext(sources: IngestedSource[], maxChars: number): string {
  const parts: string[] = [];
  let remaining = maxChars;
  for (const s of sources) {
    if (remaining <= 0) break;
    if (s.kind === "pdf") continue;
    const text = s.text.slice(0, remaining);
    parts.push(`--- ${s.name} ---\n${text}`);
    remaining -= text.length;
  }
  return parts.join("\n\n").trim();
}

function respond(body: DescribeRes, status: number): Response {
  return NextResponse.json(body, { status });
}
