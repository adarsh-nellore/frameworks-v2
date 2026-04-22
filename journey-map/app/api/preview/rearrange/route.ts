import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAnthropic, getAgentModel } from "@/lib/anthropic";
import { postProcessExecutorOutput } from "@/lib/agents/post-process";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────────────────
// /api/preview/rearrange
//
// Live Claude call that rearranges a grid. Six named actions map to different
// prompts + temperatures so each call has its own character. The model returns
// a structured arrangement via the `arrange_grid` tool; server validates, fills
// in missing ids from input, and resolves (row,col) collisions before sending
// back to the client.
// ──────────────────────────────────────────────────────────────────────────────

type ReqBody = {
  action: ActionKey;
  cells: Array<{ id: string; row: number; col: number; text: string }>;
  edges: Array<{ id: string; fromId: string; toId: string; label?: string }>;
  clusters?: Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>;
  rows: number;
  cols: number;
  /** What kind of framework is this? Used to tell the agent which structure is
   *  load-bearing and must be preserved across rearrangements. */
  structureHint?: StructureHint;
};

type StructureHint = "process-flow" | "hierarchy" | "brainstorm-dump" | "matrix" | "timeline";

const STRUCTURE_GUIDANCE: Record<StructureHint, string> = {
  "process-flow":
    "This is a PROCESS DIAGRAM. Rows are SWIMLANES (who owns each step) — they are load-bearing and must be preserved: a cell in swimlane row R must stay in row R. Edges encode the directed flow of work — don't reverse them, don't create cycles, don't leave new cells orphaned. The column axis represents time/flow order, NOT categorical stages — do NOT generate colLabels (doing so would re-impose a rigid 'detect/triage/mitigate' stage axis that the framework deliberately avoids). If an action would fundamentally break the flow (e.g. prioritize into tiers, cluster by category), adapt minimally or return cells unchanged — don't reshape the process into a matrix.",
  hierarchy:
    "This is a HIERARCHY / TREE. Edges are parent→child and define who reports to whom. Preserve the tree structure — don't rearrange so children sit above parents. When adding new cells, connect them into the tree with new edges. Don't leave new cells floating. Actions like 'prioritize' or 'group by theme' usually don't apply — the hierarchy IS the grouping. If asked, return cells unchanged.",
  "brainstorm-dump":
    "This is a BRAINSTORM. Cells are independent items with no inherent structure. Feel free to completely reorganize — group, prioritize, cluster, rewrite section labels. This is the ideal target for context-based actions.",
  matrix:
    "This is a 2D MATRIX. Row and column positions both carry meaning — preserve both axes when reshaping. Don't collapse one axis.",
  timeline:
    "This is a TIMELINE. The column (or row) axis represents time order. Preserve temporal ordering — earlier events must remain before later ones along that axis.",
};

type ActionKey =
  | "auto-tree"
  | "compact"
  | "spread"
  | "flip"
  | "shuffle"
  | "reset"
  | "group-by-theme"
  | "prioritize"
  | "label-sections"
  | "add-related"
  | "form-clusters";

type ActionSpec = {
  instruction: string;
  temperature: number;
  /** Agent may introduce new cells with fresh ids + text. */
  allowNewCells?: boolean;
  /** Agent may introduce new edges (from-to pairs referencing any cell ids). */
  allowNewEdges?: boolean;
  /** Agent may set rowLabels / colLabels. */
  allowLabels?: boolean;
  /** Agent may set clusters (bounding-box groupings of related cells). */
  allowClusters?: boolean;
  /** Server preserves existing positions regardless of what the agent returns. */
  preservePositions?: boolean;
};

const ACTIONS: Record<ActionKey, ActionSpec> = {
  "auto-tree": {
    instruction:
      "Arrange the cells as a hierarchical tree using the edges as parent→child links. Roots (cells with no incoming edges) at row 0. Each deeper row = one more edge hop from the roots. Spread siblings horizontally so the fan-out is even; don't cram everyone into one column. Pick rows/cols to fit the tree comfortably — leave empty slots around the content so it breathes.",
    temperature: 0.4,
  },
  compact: {
    instruction:
      "Tighten the layout by removing unnecessary empty rows and columns between cells — but preserve the spatial grouping (cells that were near each other should stay near each other). Shrink rows/cols so the grid snugly fits the content.",
    temperature: 0.3,
  },
  spread: {
    instruction:
      "Give the layout visual breathing room. Insert buffer cells between every populated cell so no two cells are directly adjacent. Preserve the relative ordering and grouping. Expand rows/cols to fit the more generous spacing.",
    temperature: 0.4,
  },
  flip: {
    instruction:
      "Rotate the whole layout 90°. Horizontal flows become vertical and vice versa — a cell at (row=0, col=3) lands at (row=3, col=0). Swap rows ↔ cols in the grid dimensions. Preserve all edges (they reference cell ids, not positions).",
    temperature: 0.2,
  },
  shuffle: {
    instruction:
      "Scatter the cells randomly across the current grid. Every cell must land in a different slot than where it started. Keep rows/cols the same. Be genuinely unpredictable — this is the chaos button, not a neat reorganization.",
    temperature: 1.0,
  },
  reset: {
    instruction:
      "Forget the current positions. Produce a fresh, clean arrangement that best communicates this set of cells and their edges to a first-time reader. Use your judgment about what layout pattern fits — hierarchy, timeline, cluster, swimlanes, whatever reads most naturally. Feel free to choose different rows/cols.",
    temperature: 0.7,
  },

  // ── Context-based actions ──────────────────────────────────────────────────
  "group-by-theme": {
    instruction:
      "Read the cell text and cluster cells that share a theme. IMPORTANT: if the framework has load-bearing structural axes (swimlanes in a process, levels in a hierarchy), do NOT destroy them — instead, cluster WITHIN each row/swimlane, or group related swimlanes together. For a brainstorm with no inherent structure, freely regroup cells into themed columns and return colLabels (1–3 words per label) naming each theme. Only generate labels when you can actually name the grouping.",
    temperature: 0.55,
    allowLabels: true,
  },
  prioritize: {
    instruction:
      "Rank the cells by priority / urgency / impact. BEFORE rearranging, decide whether the framework has an inherent order (process, hierarchy, timeline). If YES: sort WITHIN the existing structure — e.g. re-order steps within each swimlane by criticality, keeping swimlane rows intact. Don't collapse the process into a priority-tier matrix. If NO (brainstorm of independent items): use columns as priority tiers ('Ship now', 'Next up', 'Later') and return colLabels. Only use tiers when cells are genuinely independent.",
    temperature: 0.5,
    allowLabels: true,
  },
  "label-sections": {
    instruction:
      "Don't move any cells. Look at how they're currently laid out and infer meaningful section labels. Return rowLabels (one per row) and colLabels (one per col) that describe what each row / column represents. If a row or col has no clear theme, use an empty string for that entry. Return every input cell at its existing (row, col).",
    temperature: 0.35,
    allowLabels: true,
    preservePositions: true,
  },
  "add-related": {
    instruction:
      "Read the existing cells AND their edges. Identify 3–5 genuine GAPS — not more-of-the-same, but: a missing perspective, a follow-up question, an exception path, a counter-argument, a related data point, an overlooked stakeholder. Diversity of TYPE matters: don't just add more process steps or more feature ideas; add a mix of question / critique / precondition / alternative. Introduce NEW cells with fresh ids prefixed 'agent-' and CONNECT each one to the existing structure via one or more newEdges — a new cell must point to or be pointed at by at least one existing cell, otherwise it floats orphaned. For a hierarchy, new cells attach as children or parents. For a process, new cells slot into the flow as alternative branches or exception paths (and must respect swimlanes). For a brainstorm, edges are preferred (e.g. pain → feature-idea that solves it). PLACEMENT: place each new cell IMMEDIATELY ADJACENT to (same row/col, or one step away from) the existing cell it most relates to, so its edge(s) span ≤ 2 cells. Expanding the grid by a single column or row is better than placing new cells far from what they connect to — long edges across 3+ cells produce unreadable crossing arrows. Prefer minimal grid growth. Keep every existing cell at its current position.",
    temperature: 0.65,
    allowNewCells: true,
    allowNewEdges: true,
  },

  // ── Clustering: visual groupings without moving cells ─────────────────────
  "form-clusters": {
    instruction:
      "Identify 2–5 meaningful CLUSTERS in the current layout. A cluster is a VISUAL GROUPING of cells that share a theme — shown as a dashed bounding box around them with a short label. Clusters don't move cells; they overlay bounding boxes on top of the current arrangement. RULES: (1) each cluster must contain at least 2 cells; (2) cluster members should be SPATIALLY CONTIGUOUS (adjacent or near each other on the grid) — a cluster with cells scattered across the whole grid produces a giant useless box. If related cells aren't contiguous, pick the largest contiguous subset. (3) Keep labels short (1–3 words). (4) Choose a tone for each cluster: 'warn' (risks, pains, constraints), 'success' (wins, goals), 'info' (data, context), 'accent' (opportunities, features), 'neutral' (anything else). (5) A cell can belong to at most ONE cluster. (6) Not every cell needs a cluster — cells that don't fit a natural grouping stay unclustered. Do NOT move cells or change any other property. Return clusters with fresh ids like 'cluster-1'.",
    temperature: 0.55,
    allowClusters: true,
    preservePositions: true,
  },
};

const ARRANGE_TOOL = {
  name: "arrange_grid",
  description:
    "Produce a new grid arrangement. Return every input cell (by id) with its new row/col. May also return new cells (new ids + text) and/or row/col section labels, depending on what the action asks for.",
  input_schema: {
    type: "object",
    required: ["cells", "rows", "cols"],
    additionalProperties: false,
    properties: {
      cells: {
        type: "array",
        description:
          "Every input cell, with its new position. Use the same ids as the input. For NEW cells introduced by the agent, use fresh ids and include `text`.",
        items: {
          type: "object",
          required: ["id", "row", "col"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            row: { type: "integer", minimum: 0 },
            col: { type: "integer", minimum: 0 },
            text: {
              type: "string",
              description:
                "Only required for NEW cells (ids not present in input). Omit for existing cells.",
            },
          },
        },
      },
      rows: { type: "integer", minimum: 1, maximum: 30 },
      cols: { type: "integer", minimum: 1, maximum: 30 },
      rowLabels: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional section labels for rows. Length should equal `rows`. Empty strings are allowed for rows with no label. Only set when the action asks for section labels.",
      },
      colLabels: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional section labels for columns. Length should equal `cols`. Empty strings are allowed.",
      },
      newEdges: {
        type: "array",
        description:
          "New edges to introduce (only for actions that allow it — otherwise ignored). Every new edge must reference existing OR newly-introduced cell ids.",
        items: {
          type: "object",
          required: ["fromId", "toId"],
          additionalProperties: false,
          properties: {
            fromId: { type: "string" },
            toId: { type: "string" },
            label: { type: "string" },
          },
        },
      },
      clusters: {
        type: "array",
        description:
          "Visual groupings of cells (only for actions that allow it). Each cluster overlays a dashed bounding box around a set of cells. Members should be spatially contiguous on the grid. A cell can belong to at most one cluster.",
        items: {
          type: "object",
          required: ["id", "cellIds"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string", description: "Short (1-3 words). Optional." },
            cellIds: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
            },
            tone: {
              type: "string",
              enum: ["neutral", "warn", "success", "info", "accent"],
            },
          },
        },
      },
    },
  },
} as const;

const BASE_SYSTEM_PROMPT = `You rearrange cells on a 2D grid.

Model:
- Each cell has { id, row, col, text }. Position is discrete: row and col are non-negative integers.
- Edges are directed: { fromId, toId } — they define semantic relationships (parent→child, step→step, cause→effect).
- Grid size is rows × cols. No two cells may share the same (row, col).
- Connectors follow cell ids, so moving a cell automatically re-routes its edges.

Rules:
- Return EVERY input cell via the arrange_grid tool. Use the same ids as the input.
- Never rename or drop existing cells. You may add new cells ONLY when the action asks for it.
- Respect the action's intent — different actions want different outcomes.
- Empty slots are fine and often desirable (buffer cells carry meaning).
- If the action doesn't meaningfully apply to this framework (e.g. "prioritize" on a tree, "group by theme" on a process where everything is already structured), return cells UNCHANGED and omit rowLabels / colLabels. Don't invent structure where none is needed.
- Only return rowLabels or colLabels when you are genuinely setting or CHANGING the axis meaning. If the existing arrangement already has an implicit structure and you're preserving it, omit the label arrays.`;

function buildSystemPrompt(hint?: StructureHint): string {
  if (!hint) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\nFramework context:\n${STRUCTURE_GUIDANCE[hint]}`;
}

export async function POST(req: Request) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const spec = ACTIONS[body.action];
  if (!spec) {
    return NextResponse.json({ ok: false, error: `Unknown action: ${body.action}` }, { status: 400 });
  }
  if (!Array.isArray(body.cells) || body.cells.length === 0) {
    return NextResponse.json({ ok: false, error: "No cells provided" }, { status: 400 });
  }

  let client;
  try {
    client = getAnthropic();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const userPrompt =
    `Grid: ${body.rows} rows × ${body.cols} cols\n\n` +
    `Cells (${body.cells.length}):\n` +
    body.cells
      .map((c) => `  ${c.id} @ (${c.row},${c.col}) — "${c.text}"`)
      .join("\n") +
    (body.edges?.length
      ? `\n\nEdges (${body.edges.length}):\n` +
        body.edges
          .map((e) => `  ${e.fromId} → ${e.toId}${e.label ? ` [${e.label}]` : ""}`)
          .join("\n")
      : "\n\nNo edges.") +
    (body.clusters?.length
      ? `\n\nExisting clusters (${body.clusters.length}):\n` +
        body.clusters
          .map(
            (c) =>
              `  ${c.id}${c.label ? ` "${c.label}"` : ""} [${c.tone ?? "neutral"}]: ${c.cellIds.join(", ")}`
          )
          .join("\n") +
        `\n(Preserve these unless the action explicitly asks to reshape them.)`
      : "") +
    `\n\nTask: ${spec.instruction}\n\nCall arrange_grid with the result. Include every cell id.`;

  let response;
  try {
    response = await client.messages.create({
      model: getAgentModel(),
      max_tokens: 4096,
      temperature: spec.temperature,
      system: buildSystemPrompt(body.structureHint),
      tools: [ARRANGE_TOOL as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "arrange_grid" },
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Model error: ${message}` }, { status: 502 });
  }

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return NextResponse.json(
      { ok: false, error: "No tool_use block in response" },
      { status: 502 }
    );
  }

  const out = toolBlock.input as Parameters<typeof postProcessExecutorOutput>[0]["rawOutput"];

  let processed;
  try {
    processed = postProcessExecutorOutput({
      rawOutput: out,
      inputCells: body.cells,
      inputRows: body.rows,
      inputCols: body.cols,
      flags: {
        allowNewCells: spec.allowNewCells,
        allowNewEdges: spec.allowNewEdges,
        allowLabels: spec.allowLabels,
        allowClusters: spec.allowClusters,
        preservePositions: spec.preservePositions,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, ...processed });
}
