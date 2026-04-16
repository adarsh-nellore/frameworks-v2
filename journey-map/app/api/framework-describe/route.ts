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
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────────────────
// /api/framework-describe
//
// Two-call pipeline:
//  1. Claude generates a FrameworkConfig from the user's description
//     (propose_framework tool → structured JSON).
//  2. Runtime validateFrameworkConfig enforces layout + semantic rules.
//  3. executeArrange (inline, no HTTP hop) is called to populate the empty
//     seed with realistic example content. Failure here is non-fatal: we
//     return the config with the empty seed + a warning so the user always
//     gets a usable framework.
//
// The client receives { config, populatedMap } and registers the config in
// the dynamic registry + localStorage. Subsequent /api/arrange calls from
// Copilot must pass customConfig for this framework since it's not in the
// static server-side registry.
// ──────────────────────────────────────────────────────────────────────────────

type DescribeReq = {
  description: string;
  /** Ids already in use on the client (static + dynamic). Used to auto-suffix on collision. */
  existingIds?: string[];
};

type DescribeRes =
  | {
      ok: true;
      config: FrameworkConfig;
      populatedMap: UniversalMap;
      populationSummary?: string;
      /** Non-fatal notes from the pipeline (e.g. "populate failed, seed left empty"). */
      warnings?: string[];
    }
  | { ok: false; error: string };

export async function POST(req: Request): Promise<Response> {
  let body: DescribeReq;
  try {
    body = (await req.json()) as DescribeReq;
  } catch {
    return respond({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const description = (body?.description ?? "").trim();
  if (description.length < 3 || description.length > 500) {
    return respond(
      { ok: false, error: "description must be between 3 and 500 characters" },
      400
    );
  }

  // ── Call 1: synthesize config ───────────────────────────────────────────────
  let configInput: unknown;
  try {
    configInput = await synthesizeConfig(description);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return respond({ ok: false, error: `Synthesis failed: ${msg}` }, 502);
  }

  const v = validateFrameworkConfig(configInput, body.existingIds ?? []);
  if (!v.ok) {
    return respond(
      { ok: false, error: `Agent produced an invalid config: ${v.reason}` },
      502
    );
  }
  const config = v.config;

  // ── Call 2: populate the seed ──────────────────────────────────────────────
  const warnings: string[] = [];
  let populatedMap = config.seed;
  let populationSummary: string | undefined;

  const populateInstruction = populateInstructionFor(config);
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
// Call 1: propose_framework tool call
// ──────────────────────────────────────────────────────────────────────────────

async function synthesizeConfig(description: string): Promise<unknown> {
  const anthropic = getAnthropic();
  const systemPrompt = buildDescribeSystemPrompt();
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
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `User description: ${description}\n\nReturn a FrameworkConfig via the propose_framework tool.`,
          },
        ],
      },
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
// Populate instruction template — tuned per layout so the agent knows how full
// the grid should get and whether to use sub-items.
// ──────────────────────────────────────────────────────────────────────────────

function populateInstructionFor(config: FrameworkConfig): string {
  const base =
    "Populate this framework with realistic example content that a user would see as a useful starting point. Keep cards specific and concrete (8–16 words each). ";
  if (config.layout === "matrix") {
    return (
      base +
      "Aim for 2–4 items in every cell — this is a dense grid where every (col, row) position should be filled."
    );
  }
  if (config.layout === "kanban") {
    return (
      base +
      "Each column should hold 3–7 cards. If the framework naturally has sub-items (e.g. checklist items under a goal, quotes under a theme), use sub-items via addCard with parentCardId for the nested detail."
    );
  }
  // grid
  return (
    base +
    "Target ~50–70% fill across (col, row) positions; leave cells empty where there is no genuine insight. Use sub-items when a card has naturally nested detail."
  );
}

function respond(body: DescribeRes, status: number): Response {
  return NextResponse.json(body, { status });
}
