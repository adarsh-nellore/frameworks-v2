import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import {
  applyOps,
  parseFocus,
  renderUserPayload,
  toolDescription,
  toolName,
  toolSchema,
  universalSystemPrompt,
  validateMap,
  validateOpShape,
} from "./universal";
import type { FrameworkConfig } from "./universal/config";
import type { UniversalMap } from "./universal/types";
import type { Op } from "./universal/ops";

// ──────────────────────────────────────────────────────────────────────────────
// executeArrange — pure function wrapper around the arrange Claude call.
//
// This is the single source of truth for "ask the agent to reshape a map".
// - /api/arrange/route.ts uses it to serve the Copilot's /api/arrange endpoint.
// - /api/framework-describe/route.ts uses it inline as the populate step after
//   synthesizing a new custom FrameworkConfig, avoiding an internal HTTP hop.
//
// Validation does a full pipeline: validateMap → parseFocus → Claude call →
// tool_use presence → summary+ops shape → per-op shape → dry-run applyOps.
// Any failure returns { ok: false, error } with an actionable reason. Callers
// decide whether that's a user error (400) or an agent error (502).
// ──────────────────────────────────────────────────────────────────────────────

export type ExecuteArrangeInput = {
  map: UniversalMap;
  config: FrameworkConfig;
  instruction: string;
  /** Universal selection to pass as focus (cards / col / row). */
  focus?: unknown;
};

export type ExecuteArrangeResult =
  | { ok: true; summary: string; ops: Op[] }
  | {
      ok: false;
      error: string;
      /** Present when applyOps rejected a specific op. */
      failedAtIndex?: number;
      /** Present when we have agent-emitted ops to surface. */
      ops?: unknown[];
    };

export async function executeArrange(input: ExecuteArrangeInput): Promise<ExecuteArrangeResult> {
  const { config, instruction } = input;

  // Map shape check — the caller may have passed a fresh/mutated map.
  const mapValidation = validateMap(input.map);
  if (!mapValidation.ok) {
    return { ok: false, error: `Invalid map: ${mapValidation.reason}` };
  }
  const map = mapValidation.map;

  let focusArg: unknown = undefined;
  if (input.focus !== undefined && input.focus !== null) {
    const fp = parseFocus(input.focus);
    if (!fp.ok) return { ok: false, error: fp.reason };
    focusArg = fp.focus;
  }

  // System prompt = universal grid rules + framework-specific structuring guidance.
  const systemPrompt = `${universalSystemPrompt}\n\n## This Framework\n\n${config.structuringPrompt}`;

  try {
    const anthropic = getAnthropic();
    // Two-call retry strategy:
    //   1. Extended thinking + tool_choice: "auto" — best quality, but the
    //      model can decline to emit a tool call if the user's request looks
    //      to conflict with the framework's structuringPrompt.
    //   2. If the first call returns no tool_use, fall back to forced
    //      tool_choice (type: "tool") WITHOUT thinking — Anthropic rejects
    //      forced tool_choice + thinking combined, so we drop thinking here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const basePayload: any = {
      model: getAgentModel(),
      max_tokens: 12000,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      tools: [
        {
          name: toolName,
          description: toolDescription,
          input_schema: toolSchema,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: renderUserPayload(map, config, instruction, focusArg),
            },
          ],
        },
      ],
    };

    let msg = await anthropic.messages.create({
      ...basePayload,
      thinking: { type: "enabled", budget_tokens: 6000 },
      tool_choice: { type: "auto" },
    });
    let tool = msg.content.find((c) => c.type === "tool_use");

    if (!tool || tool.type !== "tool_use") {
      // Fallback: force tool use, drop thinking (API constraint).
      msg = await anthropic.messages.create({
        ...basePayload,
        tool_choice: { type: "tool", name: toolName },
      });
      tool = msg.content.find((c) => c.type === "tool_use");
    }

    if (!tool || tool.type !== "tool_use") {
      return { ok: false, error: "Agent did not return a tool call" };
    }

    const input2 = tool.input as { summary?: string; ops?: unknown };
    if (typeof input2.summary !== "string" || !Array.isArray(input2.ops)) {
      return { ok: false, error: "Agent tool input missing summary or ops array" };
    }

    for (let i = 0; i < input2.ops.length; i++) {
      if (!validateOpShape(input2.ops[i])) {
        return {
          ok: false,
          error: `Agent emitted malformed op at index ${i}`,
          ops: input2.ops,
          failedAtIndex: i,
        };
      }
    }

    // Server-side dry run.
    const dryRun = applyOps(map, input2.ops as Op[]);
    if (!dryRun.ok) {
      return {
        ok: false,
        error: `Agent op sequence failed at index ${dryRun.failedAtIndex}: ${dryRun.reason}`,
        ops: input2.ops,
        failedAtIndex: dryRun.failedAtIndex,
      };
    }

    return { ok: true, summary: input2.summary, ops: input2.ops as Op[] };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
