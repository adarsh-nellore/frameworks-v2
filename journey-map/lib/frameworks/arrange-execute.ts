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
import type { IngestedSource } from "@/lib/ingestion";
import { buildSourceContentBlocks } from "@/lib/pipeline/source-content";

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
  /** Reasoning context — PDFs as document blocks, images as image blocks,
   *  text as raw text. Prepended to the user message when present. */
  sources?: IngestedSource[];
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
  // When the framework opts into connectors, inject an explicit override so the
  // universal prompt's "only if structuringPrompt mentions connectors" gate
  // doesn't suppress emission for AI-generated configs whose structuringPrompt
  // may not self-reference the connector primitive.
  const connectorOverride = config.connectors?.enabled
    ? `\n\n## Connectors ARE enabled for this framework\n\n` +
      `This framework's config has \`connectors.enabled = true\`. You SHOULD emit \`addConnector\` ops to wire card-to-card relationships whenever the user's instruction or the framework's intent implies a directed flow between cards (process steps, handoffs, decision branches, dependencies, causal links). Reason about which cards genuinely connect — do not auto-wire by visual adjacency.\n\n` +
      `Allowed connector kinds${config.connectors.allowedKinds && config.connectors.allowedKinds.length ? `: ${config.connectors.allowedKinds.map((k) => `\`${k}\``).join(", ")}` : " are any semantic string that fits the framework"}.\n\n` +
      `Default routing: \`${config.connectors.defaultRouting ?? "orthogonal"}\`.`
    : "";
  const systemPrompt = `${universalSystemPrompt}\n\n## This Framework\n\n${config.structuringPrompt}${connectorOverride}`;

  try {
    const anthropic = getAnthropic();
    // Two-call retry strategy:
    //   1. Extended thinking + tool_choice: "auto" — best quality, but the
    //      model can decline to emit a tool call if the user's request looks
    //      to conflict with the framework's structuringPrompt.
    //   2. If the first call returns no tool_use, fall back to forced
    //      tool_choice (type: "tool") WITHOUT thinking — Anthropic rejects
    //      forced tool_choice + thinking combined, so we drop thinking here.
    const userText = renderUserPayload(map, config, instruction, focusArg);
    const sourceBlocks = buildSourceContentBlocks(input.sources);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = sourceBlocks.length
      ? [...sourceBlocks, { type: "text", text: userText }]
      : [{ type: "text", text: userText }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const basePayload: any = {
      model: getAgentModel(),
      max_tokens: 16000,
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
      messages: [{ role: "user", content: userContent }],
    };

    async function runOnce(
      payload: typeof basePayload,
      withThinking: boolean
    ): Promise<
      | { ok: true; summary: string; ops: unknown[] }
      | { ok: false; error: string; failedAtIndex?: number; ops?: unknown[] }
    > {
      const callParams = withThinking
        ? {
            ...payload,
            thinking: { type: "enabled", budget_tokens: 8000 },
            tool_choice: { type: "auto" },
          }
        : {
            ...payload,
            tool_choice: { type: "tool", name: toolName },
          };
      let msg = await anthropic.messages.create(callParams);
      let tool = msg.content.find((c) => c.type === "tool_use");
      if (!tool || tool.type !== "tool_use") {
        // Auto tool_choice can decline; force on the fallback path.
        if (withThinking) {
          msg = await anthropic.messages.create({
            ...payload,
            tool_choice: { type: "tool", name: toolName },
          });
          tool = msg.content.find((c) => c.type === "tool_use");
        }
        if (!tool || tool.type !== "tool_use") {
          return { ok: false, error: "Agent did not return a tool call" };
        }
      }
      const body = tool.input as { summary?: string; ops?: unknown };
      if (typeof body.summary !== "string" || !Array.isArray(body.ops)) {
        return { ok: false, error: "Agent tool input missing summary or ops array" };
      }
      for (let i = 0; i < body.ops.length; i++) {
        if (!validateOpShape(body.ops[i])) {
          return {
            ok: false,
            error: `Agent emitted malformed op at index ${i}`,
            ops: body.ops,
            failedAtIndex: i,
          };
        }
      }
      const dryRun = applyOps(map, body.ops as Op[]);
      if (!dryRun.ok) {
        return {
          ok: false,
          error: `Agent op sequence failed at index ${dryRun.failedAtIndex}: ${dryRun.reason}`,
          ops: body.ops,
          failedAtIndex: dryRun.failedAtIndex,
        };
      }
      return { ok: true, summary: body.summary, ops: body.ops };
    }

    const first = await runOnce(basePayload, true);
    if (first.ok) return { ok: true, summary: first.summary, ops: first.ops as Op[] };

    // One corrective retry. Targets the most common populate failure: an
    // addConnector references a card id that doesn't exist yet because the
    // AI didn't name the card on its addCard op. Re-emit the batch with
    // slug ids supplied on referenced cards.
    const isBatchShapeOrApplyFailure =
      typeof first.failedAtIndex === "number" ||
      first.error.startsWith("Agent op sequence failed") ||
      first.error.startsWith("Agent emitted malformed op");
    if (!isBatchShapeOrApplyFailure) return first;

    const correctionText =
      userText +
      `\n\n---\n\nThe previous attempt failed. ` +
      `Reason: ${first.error}. ` +
      `The batch is applied atomically, so none of the ops landed — the map is still in its original state shown above. ` +
      `Re-emit the ENTIRE batch. If the failure was because an \`addConnector\` referenced a card id that doesn't exist yet, fix it by supplying a slug \`id\` (matching \`^[a-z][a-z0-9_-]{0,40}$\`) on the originating \`addCard\` op and using that same slug as the \`sourceCardId\` / \`targetCardId\`. Do not use the \`k\\d+\` format for your slugs.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retryContent: any[] = sourceBlocks.length
      ? [...sourceBlocks, { type: "text", text: correctionText }]
      : [{ type: "text", text: correctionText }];
    const retryPayload = {
      ...basePayload,
      messages: [{ role: "user", content: retryContent }],
    };
    console.log(
      `[arrange] retrying after ${first.failedAtIndex !== undefined ? `op #${first.failedAtIndex}` : "initial"} failure: ${first.error}`
    );
    const second = await runOnce(retryPayload, false);
    if (second.ok) return { ok: true, summary: second.summary, ops: second.ops as Op[] };
    return second;
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
