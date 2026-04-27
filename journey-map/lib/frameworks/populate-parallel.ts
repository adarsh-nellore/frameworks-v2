import Anthropic from "@anthropic-ai/sdk";
import { getThemeNormalizeModel, getAnthropic } from "@/lib/anthropic";
import {
  renderUserPayload,
  toolDescription,
  toolName,
  toolSchema,
  universalSystemPrompt,
} from "./universal";
import type { FrameworkConfig } from "./universal/config";
import type { Op } from "./universal/ops";
import type { ShapeContract } from "./shape-contract";

// ──────────────────────────────────────────────────────────────────────────────
// populate-parallel — split the populate step into per-scope Haiku workers
// running concurrently. The single 16k-token Opus populate call dominated
// generation latency (60–120s); fan-out to 4–10 ~3-second Haiku calls cuts
// that to roughly 5–10s total wall-clock for the same coverage.
//
// Scope rules:
//   - clustered (cellGroups present): one worker per group.
//   - categorical: one worker per col.
//   - axed (and default): one worker per row.
//
// Workers are constrained to addCard ops within their scope only. Cross-scope
// ops (addConnector, setMapMeta, addRow/addCol/rename*, removeCard, etc.) are
// dropped server-side — those structural concerns belong to a single
// coordinator, not parallel workers.
//
// Disabled when:
//   - PARALLEL_POPULATE=off (env opt-out).
//   - The framework uses connectors (cross-scope graph reasoning required).
//   - Layout is freeform (single-coordinator absolute positioning).
//   - Fewer than 2 scopes (parallel offers no benefit).
//
// Failure handling: if one scope fails, the others still apply. If ALL fail,
// caller falls back to the legacy single-call populate.
// ──────────────────────────────────────────────────────────────────────────────

export type PopulateScope = {
  kind: "row" | "col" | "group";
  id: string;
  label: string;
  /** Cells this worker is allowed to populate — colId × rowId pairs. */
  cells: Array<{ colId: string; rowId: string }>;
};

export type PopulateScopeResult =
  | { ok: true; ops: Op[]; summary: string; scope: PopulateScope }
  | { ok: false; error: string; scope: PopulateScope };

export function parallelPopulateEnabled(): boolean {
  return process.env.PARALLEL_POPULATE !== "off";
}

/** True when the planned scopes for this config are safe to populate in
 *  parallel, and there are enough of them for parallelism to actually help. */
export function canParallelPopulate(
  config: FrameworkConfig,
  contract?: ShapeContract
): boolean {
  if (!parallelPopulateEnabled()) return false;
  if (config.connectors?.enabled) return false;
  if (config.layout === "freeform") return false;
  const scopes = planScopes(config, contract);
  return scopes.length >= 2;
}

export function planScopes(
  config: FrameworkConfig,
  contract?: ShapeContract
): PopulateScope[] {
  // Clustered: one scope per cell-group. Each group's named region is the
  // unit of thematic coherence — a single worker keeps related cards
  // pulling in the same direction.
  if (config.cellGroups && config.cellGroups.length > 0) {
    return config.cellGroups.map((g) => ({
      kind: "group",
      id: g.id,
      label: g.label,
      cells: g.cells.map((c) => ({ colId: c.colId, rowId: c.rowId })),
    }));
  }

  const variant = contract?.variant;

  // Categorical: cols are categories. Per-col workers — each col has a
  // single implicit row. Coherence within a category beats coherence across.
  if (variant === "categorical") {
    const rowId = config.seed.rows[0]?.id;
    if (!rowId) return []; // Defensive: a categorical config must have ≥1 row.
    return config.seed.cols.map((c) => ({
      kind: "col",
      id: c.id,
      label: c.label,
      cells: [{ colId: c.id, rowId }],
    }));
  }

  // Axed (default): per-row. Rows are usually the actor / lane / criterion;
  // a single worker per row gives a coherent narrative across cols.
  return config.seed.rows.map((r) => ({
    kind: "row",
    id: r.id,
    label: r.label,
    cells: config.seed.cols.map((c) => ({ colId: c.id, rowId: r.id })),
  }));
}

export async function runParallelPopulate(args: {
  config: FrameworkConfig;
  baseInstruction: string;
  contract?: ShapeContract;
  onScopeStart?: (scope: PopulateScope, total: number) => void;
  onScopeDone?: (scope: PopulateScope, opsCount: number) => void;
}): Promise<
  | { ok: true; ops: Op[]; perScopeSummaries: string[]; failedScopes: number }
  | { ok: false; error: string }
> {
  const scopes = planScopes(args.config, args.contract);
  if (scopes.length === 0) {
    return { ok: false, error: "No scopes to populate" };
  }

  // Notify the caller (before starting tasks) so progress UIs can render
  // the full set of pending workers up-front.
  if (args.onScopeStart) {
    for (const s of scopes) args.onScopeStart(s, scopes.length);
  }

  const tasks = scopes.map((scope) =>
    populateScope({
      scope,
      config: args.config,
      baseInstruction: args.baseInstruction,
      contract: args.contract,
    }).then((r) => {
      if (args.onScopeDone) args.onScopeDone(scope, r.ok ? r.ops.length : 0);
      return r;
    })
  );

  const settled = await Promise.allSettled(tasks);
  const ops: Op[] = [];
  const summaries: string[] = [];
  let okCount = 0;
  let failedCount = 0;

  for (const s of settled) {
    if (s.status === "rejected") {
      failedCount++;
      console.warn(`[populate-parallel] task rejected:`, s.reason);
      continue;
    }
    if (s.value.ok) {
      ops.push(...s.value.ops);
      if (s.value.summary) summaries.push(`${s.value.scope.label}: ${s.value.summary}`);
      okCount++;
    } else {
      failedCount++;
      console.warn(
        `[populate-parallel] scope "${s.value.scope.label}" failed: ${s.value.error}`
      );
    }
  }

  if (okCount === 0) {
    return { ok: false, error: "All parallel scopes failed" };
  }

  return {
    ok: true,
    ops,
    perScopeSummaries: summaries,
    failedScopes: failedCount,
  };
}

async function populateScope(args: {
  scope: PopulateScope;
  config: FrameworkConfig;
  baseInstruction: string;
  contract?: ShapeContract;
}): Promise<PopulateScopeResult> {
  const { scope, config, baseInstruction } = args;

  const briefing = scopeBriefing(scope, config);
  const fullInstruction = `${baseInstruction}

## Your scope (this worker only)

${briefing}

## Hard rules for this worker

- Emit ONLY \`addCard\` ops. Drop all others (no \`addConnector\`, \`renameCol\`, \`renameRow\`, \`addRow\`, \`addCol\`, \`removeCol\`, \`removeRow\`, \`removeCard\`, \`editCard\`, \`moveCard\`, \`reparentCard\`, \`setMapMeta\`, \`setCardMeta\`).
- Every \`addCard\` must reference one of YOUR scope's cells (colId × rowId pairs listed above). Cards aimed at other cells will be dropped.
- Do NOT supply slug \`id\` values on your \`addCard\` ops. The merge step assigns ids.
- Aim for the density target stated in the briefing — not max-fill, not minimal. The cards should feel curated, not stuffed.
- Cards stay 10–22 words, specific, grounded in the subject. Use \`**bold**\` for the load-bearing phrase and \`==highlight==\` for named entities, numbers, or quotes.`;

  const userText = renderUserPayload(config.seed, config, fullInstruction);
  const systemPrompt = `${universalSystemPrompt}\n\n## This Framework\n\n${config.structuringPrompt}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callParams: any = {
    model: getThemeNormalizeModel(), // Haiku — fast + cheap, scope is small
    max_tokens: 3000,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: toolSchema,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content: userText }],
  };

  try {
    const anthropic = getAnthropic();
    const msg = (await anthropic.messages.create(
      callParams
    )) as Anthropic.Messages.Message;
    const tool = msg.content.find((c) => c.type === "tool_use");
    if (!tool || tool.type !== "tool_use") {
      return { ok: false, error: "Worker did not return a tool call", scope };
    }
    const body = tool.input as { summary?: string; ops?: unknown };
    if (!Array.isArray(body.ops)) {
      return { ok: false, error: "Worker tool input missing ops array", scope };
    }
    const filtered = filterOpsToScope(body.ops as Op[], scope);
    return {
      ok: true,
      ops: filtered,
      summary: typeof body.summary === "string" ? body.summary : "",
      scope,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown worker error",
      scope,
    };
  }
}

function scopeBriefing(scope: PopulateScope, config: FrameworkConfig): string {
  if (scope.kind === "row") {
    const row = config.seed.rows.find((r) => r.id === scope.id);
    const cols = config.seed.cols
      .map((c) => `\`${c.id}\` ("${c.label}")`)
      .join(", ");
    return [
      `You own ROW \`${scope.id}\` — label: "${row?.label ?? scope.label}".`,
      ``,
      `Cols available across this row: ${cols}.`,
      ``,
      `Density: aim for 1–3 cards in each (col, row) cell along your row. Make this row read as a coherent narrative across cols — the lane should tell one story when read left to right.`,
    ].join("\n");
  }
  if (scope.kind === "col") {
    const col = config.seed.cols.find((c) => c.id === scope.id);
    const rowId = config.seed.rows[0]?.id ?? "r1";
    return [
      `You own COL \`${scope.id}\` — label: "${col?.label ?? scope.label}".`,
      ``,
      `Use rowId \`${rowId}\` for every card.`,
      ``,
      `Density: aim for 5–8 cards in this col. Cards should feel like a coherent set within this category — varied facets of the same idea, not eight ways of saying the same thing.`,
    ].join("\n");
  }
  // group
  const cellList = scope.cells
    .map((c) => `(colId=\`${c.colId}\`, rowId=\`${c.rowId}\`)`)
    .join(", ");
  return [
    `You own CELL-GROUP "${scope.label}" — id: \`${scope.id}\`.`,
    ``,
    `Allowed cells: ${cellList}.`,
    ``,
    `Density: aim for 4–8 cards distributed naturally across your cells. Don't stuff one cell and leave others empty — the visual region should feel evenly populated.`,
  ].join("\n");
}

function filterOpsToScope(ops: Op[], scope: PopulateScope): Op[] {
  const cellSet = new Set(scope.cells.map((c) => `${c.colId}|${c.rowId}`));
  const out: Op[] = [];
  for (const op of ops) {
    if (op.op !== "addCard") continue;
    if (!cellSet.has(`${op.colId}|${op.rowId}`)) continue;
    // Strip any agent-supplied slug id; the merge step auto-assigns to avoid
    // collisions across workers.
    if ("id" in op) {
      const { id: _id, ...rest } = op;
      out.push(rest as Op);
    } else {
      out.push(op);
    }
  }
  return out;
}
