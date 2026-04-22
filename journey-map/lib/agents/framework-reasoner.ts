import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getAgentModel } from "@/lib/anthropic";
import type { ActionFlags, ExecutorOutput } from "./post-process";

// ──────────────────────────────────────────────────────────────────────────────
// framework-reasoner — single-call agent for a framework-specific action.
//
// One Sonnet call per action. Framework expertise lives in the system prompt
// (what this framework is, what good looks like, what to avoid). The model
// outputs the arrange_grid tool call directly. Parallel orchestration happens
// at the caller level (script or future UI button that fires multiple actions
// concurrently).
//
// Latency target: 5-10 s per action. Fanout to N actions in parallel = still
// ~10-15 s wall-clock. The 3-stage Theorist→Critic→Executor design was ~75 s
// per action even with Opus+adaptive thinking — too slow for interactive UX.
// ──────────────────────────────────────────────────────────────────────────────

export type StructureHint = "process-flow" | "hierarchy" | "brainstorm-dump" | "matrix" | "timeline";

export type ReasonInput = {
  frameworkName: string;
  instanceContext: string;
  structureHint?: StructureHint;
  task: string;
  board: {
    cells: Array<{ id: string; row: number; col: number; text: string }>;
    edges: Array<{ id: string; fromId: string; toId: string; label?: string }>;
    clusters: Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>;
    rows: number;
    cols: number;
    rowLabels?: string[];
    colLabels?: string[];
  };
  flags: ActionFlags;
};

export async function runFrameworkAction(input: ReasonInput): Promise<ExecutorOutput> {
  const client = getAnthropic();

  const hintGuidance =
    input.structureHint === "process-flow"
      ? "Swimlane rows (rows with labels) are LOAD-BEARING. A cell in swimlane row R must stay in row R unless the task explicitly requires re-laning. Do NOT re-order cells across swimlanes."
      : input.structureHint === "hierarchy"
        ? "Edges encode parent→child. Don't invert them. When adding cells, connect them into the tree."
        : input.structureHint === "matrix"
          ? "Both row and column positions carry meaning; that IS the relationship. Do NOT add edges between cells — a matrix expresses relationships through (row, col) position, not connectors. Preserve both axes."
          : input.structureHint === "timeline"
            ? "The column axis represents time. Preserve temporal order. Do NOT add edges between cells — temporal adjacency is already expressed by column position."
            : input.structureHint === "brainstorm-dump"
              ? "Cells are loose ideas, not a diagram. Do NOT add edges unless the task EXPLICITLY asks for relationships (e.g., 'show dependencies', 'link causes to effects'). Clusters are the right tool for grouping; connectors are visual noise here."
              : "";

  const system = `You are an expert in ${input.frameworkName}. A great instance of this framework exposes the structure that makes it work — not just a catalog of items, but the relationships, moments, and dependencies that a first-rate practitioner would highlight. A mediocre instance merely lists things.

Your job: look at the current board, do the task, and call arrange_grid with concrete changes. Think carefully about what a rigorous practitioner of ${input.frameworkName} would actually add or mark. Focus on HIGH-LEVERAGE changes — one or two changes that make the framework feel more real are better than ten generic ones.

Rules:
- Return EVERY input cell by id with its row/col. Use the SAME ids as the input for existing cells.
- New cells get fresh ids prefixed 'agent-' and MUST include \`text\`. Only add if allowNewCells.
- Clusters need ≥2 members; members should be spatially contiguous; each cell in at most one cluster. Only add if allowClusters.
- Edges must reference valid cell ids (existing or newly added). Only add if allowNewEdges.
- PRESERVE EXISTING CLUSTERS: if the board already has clusters and you're adding new ones, return ALL clusters (existing + new). Returning only new ones will wipe the existing.
${hintGuidance ? `- ${hintGuidance}` : ""}`;

  const user = [
    `Framework: ${input.frameworkName}`,
    `Instance: ${input.instanceContext}`,
    ``,
    `BOARD:`,
    formatBoard(input),
    ``,
    `TASK: ${input.task}`,
    `Allowed: newCells=${!!input.flags.allowNewCells}, newEdges=${!!input.flags.allowNewEdges}, clusters=${!!input.flags.allowClusters}, labels=${!!input.flags.allowLabels}`,
    ``,
    `Call arrange_grid with your revisions.`,
  ].join("\n");

  const response = await client.messages.create({
    model: getAgentModel(),
    max_tokens: 4096,
    temperature: 0.35,
    system,
    tools: [ARRANGE_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: "tool", name: "arrange_grid" },
    messages: [{ role: "user", content: user }],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Agent did not produce an arrange_grid tool_use block");
  }
  return toolBlock.input as ExecutorOutput;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBoard(input: ReasonInput): string {
  const { board } = input;
  const parts: string[] = [];
  parts.push(`Grid: ${board.rows} rows × ${board.cols} cols`);

  const hasRowLabels = board.rowLabels?.some((l) => l && l.length > 0);
  if (hasRowLabels) {
    const labeled = board.rowLabels!
      .map((l, i) => (l ? `  row ${i} — ${l}` : ""))
      .filter(Boolean)
      .join("\n");
    parts.push(`Row labels:\n${labeled}`);
  }
  const hasColLabels = board.colLabels?.some((l) => l && l.length > 0);
  if (hasColLabels) {
    const labeled = board.colLabels!
      .map((l, i) => (l ? `  col ${i} — ${l}` : ""))
      .filter(Boolean)
      .join("\n");
    parts.push(`Col labels:\n${labeled}`);
  }

  parts.push(`Cells (${board.cells.length}):`);
  parts.push(
    board.cells
      .map((c) => `  ${c.id} @ (${c.row},${c.col}) — "${c.text}"`)
      .join("\n")
  );

  if (board.edges.length > 0) {
    parts.push(`Edges (${board.edges.length}):`);
    parts.push(
      board.edges
        .map((e) => `  ${e.fromId} → ${e.toId}${e.label ? ` [${e.label}]` : ""}`)
        .join("\n")
    );
  } else {
    parts.push(`Edges: none`);
  }

  if (board.clusters.length > 0) {
    parts.push(`Clusters (${board.clusters.length}):`);
    parts.push(
      board.clusters
        .map(
          (c) =>
            `  ${c.id}${c.label ? ` "${c.label}"` : ""} [${c.tone ?? "neutral"}]: ${c.cellIds.join(", ")}`
        )
        .join("\n")
    );
  } else {
    parts.push(`Clusters: none`);
  }

  return parts.join("\n");
}

// ── arrange_grid tool schema (duplicated across this module + rearrange route) ──
const ARRANGE_TOOL = {
  name: "arrange_grid",
  description:
    "Produce a new grid arrangement. Return every input cell (by id) with its new row/col. May also return new cells (new ids + text), edges, clusters, and section labels — only where the action allows.",
  input_schema: {
    type: "object",
    required: ["cells", "rows", "cols"],
    additionalProperties: false,
    properties: {
      cells: {
        type: "array",
        description:
          "Every input cell, with its new position. Use the same ids as the input. For NEW cells introduced by the agent, use fresh ids prefixed 'agent-' and include `text`.",
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
                "Required for NEW cells (ids not in input). Omit for existing cells.",
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
          "Optional section labels for rows. Length should equal `rows`. Only set when the action allows labels.",
      },
      colLabels: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional section labels for columns. Length should equal `cols`.",
      },
      newEdges: {
        type: "array",
        description:
          "New edges to introduce (only for actions that allow it). Every edge must reference existing OR newly-introduced cell ids.",
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
          "Visual groupings of cells (only for actions that allow it). Each cluster is a dashed bounding box with a short label. Members should be spatially contiguous; a cell can belong to at most one cluster.",
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
