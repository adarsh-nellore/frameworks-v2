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
import { buildSourceContentBlocks } from "@/lib/pipeline/source-content";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import {
  classifyIntent,
  DEFAULT_THRESHOLD as CLASSIFIER_THRESHOLD,
} from "@/lib/archetypes/classifier";
import { getArchetype, hasArchetypes } from "@/lib/archetypes";

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
      mode: "universal";
      config: FrameworkConfig;
      populatedMap: UniversalMap;
      populationSummary?: string;
      warnings?: string[];
    }
  | {
      ok: true;
      mode: "archetype";
      archetypeId: string;
      doc: unknown;
      summary: string;
      title: string;
      warnings?: string[];
    }
  | { ok: false; error: string };

// Sources are now passed as Anthropic content blocks (document/image/text) via
// buildSourceContentBlocks, which applies per-block caching and preserves
// full-fidelity PDFs and images. Long raw text is capped inside that helper.

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
  let sources: IngestedSource[] = [];
  const warnings: string[] = [];
  if (rawInputs.length > 0) {
    try {
      sources = await ingestSources(rawInputs);
    } catch (e) {
      // Non-fatal: continue without source context. Warn the user so they know
      // why their URL / file didn't inform the generated framework.
      const msg = e instanceof IngestionError ? e.message : (e as Error).message;
      warnings.push(`Could not ingest sources: ${msg}`);
    }
  }

  // ── Call 0: classifier — route intent to an archetype when confident ───────
  // If the description maps clearly to one of our bespoke archetypes (cartesian
  // plot, table, competitive matrix, journey map, process map), we bypass the
  // universal FrameworkConfig synthesis path entirely and let the archetype's
  // own pipeline produce a typed domain doc. The universal describe path only
  // runs when the classifier can't confidently route anywhere.
  if (hasArchetypes()) {
    try {
      const routing = await classifyIntent(description, CLASSIFIER_THRESHOLD);
      if (routing.kind === "archetype") {
        const archetype = getArchetype(routing.archetypeId);
        if (archetype) {
          console.log(
            `[framework-describe] classifier → archetype=${routing.archetypeId} score=${routing.score.toFixed(2)}`
          );
          try {
            const result = await archetype.pipeline({
              description,
              preamble: null,
              sources,
              emit: () => {
                /* JSON endpoint — no SSE stream. Progress events discarded. */
              },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const docAny = result.doc as any;
            const title =
              (docAny && typeof docAny === "object" && typeof docAny.title === "string" && docAny.title) ||
              archetype.label;
            return respond(
              {
                ok: true,
                mode: "archetype",
                archetypeId: archetype.id,
                doc: result.doc,
                summary: result.summary,
                title,
                ...(warnings.length > 0 ? { warnings } : {}),
              },
              200
            );
          } catch (e) {
            // Archetype pipeline failed — log, fall through to the universal
            // describe path so the user still gets *something* usable.
            const msg = e instanceof Error ? e.message : "Unknown error";
            console.error(
              `[framework-describe] archetype pipeline failed (${archetype.id}): ${msg}. Falling back to universal synthesis.`
            );
            warnings.push(`Archetype pipeline failed: ${msg}`);
          }
        }
      } else {
        const topScore = routing.scores[0]?.score;
        console.log(
          `[framework-describe] classifier → fallback (top score ${topScore?.toFixed(2) ?? "n/a"})`
        );
      }
    } catch (e) {
      // Classification itself failed (API / network) — not fatal, continue to
      // the universal path.
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(
        `[framework-describe] classifier errored: ${msg}. Falling back to universal synthesis.`
      );
    }
  }

  // ── Call 1: synthesize config ───────────────────────────────────────────────
  let configInput: unknown;
  try {
    configInput = await synthesizeConfig(description, sources);
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

  // Dev-time visibility: did the AI opt this framework into connectors?
  // Printed once per describe so we can diagnose process/flow generations that
  // come back without arrows.
  console.log(
    `[framework-describe] synthesized ${config.id} (${config.label}) — ` +
      `layout=${config.layout}  connectors.enabled=${config.connectors?.enabled === true}` +
      (config.connectors?.allowedKinds
        ? `  kinds=[${config.connectors.allowedKinds.join(", ")}]`
        : "")
  );

  // ── Call 2: populate the seed ──────────────────────────────────────────────
  let populatedMap = config.seed;
  let populationSummary: string | undefined;

  const populateInstruction = populateInstructionFor(config, sources.length > 0);
  const populateResult = await executeArrange({
    map: config.seed,
    config,
    instruction: populateInstruction,
    sources: sources.length > 0 ? sources : undefined,
  });

  if (populateResult.ok) {
    const applied = applyOps(config.seed, populateResult.ops);
    if (applied.ok) {
      populatedMap = applied.map;
      populationSummary = populateResult.summary;
      // How many addConnector ops actually landed?
      const connectorOps = populateResult.ops.filter(
        (o) => (o as { op?: string }).op === "addConnector"
      ).length;
      console.log(
        `[framework-describe] populate ok — ${populateResult.ops.length} ops (${connectorOps} addConnector)`
      );
    } else {
      warnings.push(
        `Populate ops couldn't apply cleanly (${applied.reason}); seed left empty.`
      );
      console.error(
        `[framework-describe] populate applyOps failed at index ${applied.failedAtIndex}: ${applied.reason}`
      );
    }
  } else {
    warnings.push(`Populate step failed: ${populateResult.error}. Seed left empty.`);
    console.error(`[framework-describe] populate step failed: ${populateResult.error}`);
  }

  return respond(
    {
      ok: true,
      mode: "universal",
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

async function synthesizeConfig(
  description: string,
  sources: IngestedSource[]
): Promise<unknown> {
  const anthropic = getAnthropic();
  const systemPrompt = buildDescribeSystemPrompt();
  const hasSources = sources.length > 0;
  const userText = hasSources
    ? `User description: ${description}

Use the source material attached above to inform the framework choice and structure — the populate step will fill cards from this content. Design columns/rows that match the shape of what you see. Return a FrameworkConfig via the propose_framework tool.`
    : `User description: ${description}

Return a FrameworkConfig via the propose_framework tool.`;

  const sourceBlocks = buildSourceContentBlocks(sources);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = hasSources
    ? [...sourceBlocks, { type: "text", text: userText }]
    : [{ type: "text", text: userText }];

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
    messages: [{ role: "user", content: userContent }],
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

function populateInstructionFor(config: FrameworkConfig, hasSources: boolean): string {
  const base = hasSources
    ? `Populate this framework with specific content drawn from the source material attached to this conversation. Cards should be concrete quotes, findings, or data points from the sources (8–16 words each). Do NOT invent content — stay grounded in what the sources say.

`
    : `Populate this framework with realistic example content that a user would see as a useful starting point. Keep cards specific and concrete (8–16 words each). `;

  // Connector-enabled frameworks (process maps, flowcharts, service blueprints,
  // etc.) need arrows, not just cards. The AI has to reason about the actual
  // causal/temporal structure of the work — which card genuinely leads to
  // which — not just "connect adjacent cells left-to-right."
  const connectorNudge = config.connectors?.enabled
    ? `

**This framework uses connectors — reason about them carefully.** Arrows are not decoration; they encode the actual logic of the work. Before emitting any \`addConnector\` op, think through the process:

1. **Trace the real flow.** Start from the trigger (often a \`start\` or first-phase card) and follow the work as it actually happens: "When this step finishes, what happens next, and who does it?" That next card — regardless of whether it's in the same row or phase — is the target of your connector. Don't connect by visual adjacency; connect by causality.
2. **Handoffs cross swimlanes.** If the next step is done by a different actor/system (different row), emit a \`handoff\`. If it stays in the same row, emit a \`sequence\`. A single card may hand off to multiple downstream cards in different lanes — emit one connector per real handoff.
3. **Decisions branch on conditions.** For every card with \`meta.stepKind: "decision"\`, decide the two real outcomes (approved/denied, eligible/ineligible, success/failure, in-scope/out-of-scope) and emit \`decision-yes\` + \`decision-no\` to the two distinct downstream cards. Put the actual condition in \`label\` (e.g. \`"approved"\`, \`"over $5k"\`, \`"SLA exceeded"\`) — not just "yes"/"no" if the real label carries more information.
4. **Loops and retries are real.** If rejection, denial, or missing-info routes work back to an earlier step, emit that backward connector. Don't force a linear left-to-right graph if the process genuinely cycles.
5. **Parallel branches are real.** A card may fan out to multiple concurrent next steps (e.g. "approved" triggers both "provision access" and "notify requester"). Emit one connector per branch.
6. **Coverage, not completeness.** Every non-terminal card (start/task/decision) should have at least one outgoing connector. Terminal cards (\`stepKind: "end"\`) need none. If a card has no plausible next step, mark it as \`end\`.

Set \`meta.stepKind\` on cards via the \`meta\` field on \`addCard\` (\`"start" | "task" | "decision" | "end"\`) so the UI distinguishes node types. Emit connectors AFTER all cards exist so every source and target id is valid when the connector op runs.`
    : "";

  if (config.layout === "matrix") {
    return base + "Aim for 2–4 items in every cell — this is a dense grid where every (col, row) position should be filled." + connectorNudge;
  }
  if (config.layout === "kanban") {
    return base + "Each column should hold 3–7 cards. If the framework naturally has sub-items (e.g. checklist items under a goal, quotes under a theme), use sub-items via addCard with parentCardId for the nested detail." + connectorNudge;
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
  return base + "Target ~50–70% fill across (col, row) positions; leave cells empty where there is no genuine insight. Use sub-items when a card has naturally nested detail." + connectorNudge;
}

function respond(body: DescribeRes, status: number): Response {
  return NextResponse.json(body, { status });
}
