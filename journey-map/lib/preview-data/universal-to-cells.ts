import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { EditableCell } from "@/components/ui/grid/EditableGrid";

// ──────────────────────────────────────────────────────────────────────────────
// Flatten a UniversalMap (the real product's output from /api/generate) into
// the one-card-per-slot shape EditableGrid expects. Strategy:
//   - Every column in the map becomes a column in the grid.
//   - For each map row, we reserve a "row block" of H rows where H is the max
//     number of cards found at any (col, row) within that row. Cards at a
//     given (col, row) stack top-to-bottom inside that block.
//   - Row labels live on the first row of each block (blank elsewhere).
//   - Sub-items (parentCardId) are flattened right after their parent.
//   - Rich-text markup (**bold**, ==highlight==) is stripped.
// ──────────────────────────────────────────────────────────────────────────────

export type StructureHint =
  | "process-flow"
  | "hierarchy"
  | "brainstorm-dump"
  | "matrix"
  | "timeline";

export type FlattenedBoard = {
  cells: EditableCell[];
  rows: number;
  cols: number;
  rowLabels?: string[];
  colLabels?: string[];
};

const MAX_ROWS = 30;
const MAX_COLS = 30;

/** Decide whether a generated UniversalMap can be rendered faithfully on the
 *  single-card-per-slot EditableGrid. Data-driven, not name-based:
 *   - fails if ANY (colId,rowId) holds more than 1 top-level card
 *   - fails if any card has a parentCardId (sub-items can't be represented)
 *   - fails if the config's layout is grid with meaningful rowLabels — grid
 *     layouts encode multi-aspect swimlanes that typically carry multiple
 *     items per (col,row) even if the seed happens to be sparse
 *   - otherwise: safe to flatten (matrix, kanban, freeform with single-
 *     entry cells, or any grid where each slot is already a single card)
 */
export function shouldFlatten(
  map: UniversalMap,
  config?: FrameworkConfig | null
): boolean {
  const perSlot = new Map<string, number>();
  for (const c of map.cards) {
    if (c.parentCardId) return false;
    const key = `${c.colId}:${c.rowId}`;
    perSlot.set(key, (perSlot.get(key) ?? 0) + 1);
  }
  for (const count of perSlot.values()) if (count > 1) return false;
  // Grid layout with >1 named row is a swimlane-style framework (journey map,
  // service blueprint, process map) — always hand those to the real renderer,
  // even when the seed is coincidentally single-card-per-slot. Flattening them
  // strips row semantics that the user expects to see.
  if (config?.layout === "grid") {
    const namedRows = map.rows.filter((r) => r.label && r.label.trim().length > 0).length;
    if (namedRows > 1) return false;
  }
  return true;
}

export function universalMapToCells(map: UniversalMap): FlattenedBoard {
  const colsCount = Math.max(1, Math.min(MAX_COLS, map.cols.length || 1));
  const rowsCount = Math.max(1, map.rows.length || 1);

  const colIndexById = new Map<string, number>();
  map.cols.slice(0, colsCount).forEach((c, i) => colIndexById.set(c.id, i));
  const rowIndexById = new Map<string, number>();
  map.rows.forEach((r, i) => rowIndexById.set(r.id, i));

  // Group top-level cards by (rowIdx, colIdx); sort by order.
  const topCards = map.cards.filter((c) => !c.parentCardId);
  const childrenByParent = new Map<string, typeof map.cards>();
  for (const c of map.cards) {
    if (!c.parentCardId) continue;
    const list = childrenByParent.get(c.parentCardId) ?? [];
    list.push(c);
    childrenByParent.set(c.parentCardId, list);
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => a.order - b.order);

  const byPos = new Map<string, typeof map.cards>();
  for (const card of topCards) {
    const ri = rowIndexById.get(card.rowId);
    const ci = colIndexById.get(card.colId);
    if (ri === undefined || ci === undefined) continue;
    const key = `${ri}:${ci}`;
    const list = byPos.get(key) ?? [];
    list.push(card);
    byPos.set(key, list);
  }
  for (const list of byPos.values()) list.sort((a, b) => a.order - b.order);

  // Expand each parent into [parent, ...children] to stack vertically in its cell.
  const expandedByPos = new Map<string, typeof map.cards>();
  for (const [key, list] of byPos.entries()) {
    const expanded: typeof map.cards = [];
    for (const card of list) {
      expanded.push(card);
      const kids = childrenByParent.get(card.id) ?? [];
      for (const k of kids) expanded.push(k);
    }
    expandedByPos.set(key, expanded);
  }

  // maxPerRow[r] = max stack height across cols in that row.
  const maxPerRow: number[] = Array.from({ length: rowsCount }, () => 1);
  for (const [key, list] of expandedByPos.entries()) {
    const [ri] = key.split(":").map(Number);
    maxPerRow[ri] = Math.max(maxPerRow[ri], list.length);
  }

  // Block-start row for each original row idx.
  const blockStart: number[] = [];
  let acc = 0;
  for (let i = 0; i < rowsCount; i++) {
    blockStart.push(acc);
    acc += maxPerRow[i];
  }
  const totalRows = Math.max(1, Math.min(MAX_ROWS, acc));

  const cells: EditableCell[] = [];
  const seenIds = new Set<string>();
  for (const [key, list] of expandedByPos.entries()) {
    const [ri, ci] = key.split(":").map(Number);
    for (let k = 0; k < list.length; k++) {
      const card = list[k];
      const row = blockStart[ri] + k;
      if (row >= totalRows) continue;
      let id = card.id || `card-${cells.length}`;
      while (seenIds.has(id)) id = `${id}-${cells.length}`;
      seenIds.add(id);
      cells.push({
        id,
        row,
        col: Math.min(colsCount - 1, ci),
        text: stripRichText(card.text),
      });
    }
  }

  const colLabels = map.cols.slice(0, colsCount).map((c) => c.label || "");
  const rowLabels: string[] = Array.from({ length: totalRows }, () => "");
  for (let i = 0; i < rowsCount; i++) {
    if (blockStart[i] < totalRows && map.rows[i]) {
      rowLabels[blockStart[i]] = map.rows[i].label || "";
    }
  }

  return {
    cells,
    rows: totalRows,
    cols: colsCount,
    rowLabels: rowLabels.some((l) => l.length > 0) ? rowLabels : undefined,
    colLabels: colLabels.some((l) => l.length > 0) ? colLabels : undefined,
  };
}

export function structureHintForConfig(config?: FrameworkConfig | null): StructureHint {
  switch (config?.layout) {
    case "matrix":
      return "matrix";
    case "grid":
      return "process-flow";
    case "kanban":
    case "freeform":
    default:
      return "brainstorm-dump";
  }
}

function stripRichText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
