import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { EditableCell } from "@/components/ui/grid/EditableGrid";
import type { ChromeSpec } from "@/components/ui/grid/chromes";

// ──────────────────────────────────────────────────────────────────────────────
// universal-to-cells — flattens any UniversalMap onto the EditableGrid cell
// substrate. Strategy:
//
//   - Every column in the map becomes a column in the substrate.
//   - For each map row, reserve a "row block" of H rows where H is the max
//     number of cards in any (col, row) of that row. Cards at a given
//     (col, row) stack top-to-bottom inside the block.
//   - Row labels live on the first row of each block (blank elsewhere).
//   - Sub-items (parentCardId) flatten right after their parent.
//   - cellGroups → labeled regions over the substrate so clustered canvases
//     render as the same grid + a labeled overlay.
//   - chrome → a typed ChromeSpec for the background SVG layer.
//   - axis labels → x/y captions for the chrome (e.g. "Speed" / "Reasoning").
//
// EditableGrid is the single canvas all preview routes share. There is no
// "should we flatten?" decision any more — multi-card cells, sub-items, and
// connectors-disabled boards all sit on this substrate. The chrome layer
// replaces the layout-specific MatrixLayout/KanbanLayout/etc. divergence.
// ──────────────────────────────────────────────────────────────────────────────

export type StructureHint =
  | "process-flow"
  | "hierarchy"
  | "brainstorm-dump"
  | "matrix"
  | "timeline";

export type FlattenedRegion = {
  id: string;
  label: string;
  /** Cells in (row, col) substrate coordinates, post-flattening. */
  cells: Array<{ row: number; col: number }>;
  chromeStyle?: "box" | "region" | "radial-petal" | "none";
};

export type FlattenedAxisLabels = {
  x?: string;
  y?: string;
};

export type FlattenedBoard = {
  cells: EditableCell[];
  rows: number;
  cols: number;
  rowLabels?: string[];
  colLabels?: string[];
  /** Background chrome behind the cell grid (coordinate-cross / venn / etc.). */
  chrome?: ChromeSpec;
  /** Labeled cell-group regions overlaid on the substrate. */
  regions?: FlattenedRegion[];
  /** Optional axis captions for chrome (typically x/y labels). */
  axisLabels?: FlattenedAxisLabels;
};

const MAX_ROWS = 30;
const MAX_COLS = 30;

/**
 * Always flatten — EditableGrid is the universal substrate. Kept exported
 * so existing call-sites that gate on it stay compatible (they all get
 * `true` now). Will be removed once those call-sites are inlined.
 */
export function shouldFlatten(
  _map: UniversalMap,
  _config?: FrameworkConfig | null
): boolean {
  return true;
}

export function universalMapToCells(
  map: UniversalMap,
  config?: FrameworkConfig | null
): FlattenedBoard {
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

  // Block-start row for each original row idx. Track each block's span so
  // cellGroup regions can be expanded across stacked rows.
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

  // ── Chrome ────────────────────────────────────────────────────────────────
  const chrome = resolveChrome(map, config);

  // ── Regions (cellGroups) ──────────────────────────────────────────────────
  const regions = buildRegions(config, colIndexById, rowIndexById, blockStart, maxPerRow, totalRows, colsCount);

  // ── Axis labels ───────────────────────────────────────────────────────────
  const axisLabels: FlattenedAxisLabels = {};
  const xAxisLabel =
    typeof map.meta?.xAxisLabel === "string" ? map.meta.xAxisLabel : undefined;
  const yAxisLabel =
    typeof map.meta?.yAxisLabel === "string" ? map.meta.yAxisLabel : undefined;
  if (xAxisLabel) axisLabels.x = xAxisLabel;
  if (yAxisLabel) axisLabels.y = yAxisLabel;

  return {
    cells,
    rows: totalRows,
    cols: colsCount,
    rowLabels: rowLabels.some((l) => l.length > 0) ? rowLabels : undefined,
    colLabels: colLabels.some((l) => l.length > 0) ? colLabels : undefined,
    chrome,
    regions: regions && regions.length > 0 ? regions : undefined,
    axisLabels: axisLabels.x || axisLabels.y ? axisLabels : undefined,
  };
}

function resolveChrome(
  map: UniversalMap,
  config?: FrameworkConfig | null
): ChromeSpec | undefined {
  // map.meta override beats config.chrome (agent can rewrite chrome via setMapMeta).
  const overrideKind =
    typeof map.meta?.chromeKind === "string" ? map.meta.chromeKind : undefined;
  if (overrideKind === "none") return undefined;
  const cfg = config?.chrome;
  const kind = overrideKind || cfg?.kind;
  if (!kind) return undefined;

  const x = typeof map.meta?.xAxisLabel === "string" ? map.meta.xAxisLabel : undefined;
  const y = typeof map.meta?.yAxisLabel === "string" ? map.meta.yAxisLabel : undefined;
  const left =
    (typeof map.meta?.chromeLeftLabel === "string"
      ? map.meta.chromeLeftLabel
      : undefined) ??
    (cfg?.kind === "double-diamond" ? cfg.leftLabel : undefined);
  const right =
    (typeof map.meta?.chromeRightLabel === "string"
      ? map.meta.chromeRightLabel
      : undefined) ??
    (cfg?.kind === "double-diamond" ? cfg.rightLabel : undefined);
  const circles =
    (typeof map.meta?.chromeCircles === "string"
      ? map.meta.chromeCircles.split("|").map((s) => s.trim()).filter(Boolean)
      : undefined) ??
    (cfg?.kind === "venn" ? cfg.circles : undefined);

  switch (kind) {
    case "coordinate-cross":
      return { kind: "coordinate-cross", xLabel: x, yLabel: y };
    case "double-diamond":
      return { kind: "double-diamond", leftLabel: left, rightLabel: right };
    case "venn":
      return { kind: "venn", circles, colCount: map.cols.length };
    case "kano-curve":
      return { kind: "kano-curve" };
    case "funnel":
      return { kind: "funnel" };
    case "concentric":
    case "concentric-rings":
      return { kind: "concentric" };
    default:
      return undefined;
  }
}

function buildRegions(
  config: FrameworkConfig | null | undefined,
  colIndexById: Map<string, number>,
  rowIndexById: Map<string, number>,
  blockStart: number[],
  maxPerRow: number[],
  totalRows: number,
  colsCount: number
): FlattenedRegion[] | undefined {
  const groups = config?.cellGroups;
  if (!groups || groups.length === 0) return undefined;
  const regions: FlattenedRegion[] = [];
  for (const g of groups) {
    const cellSet = new Set<string>();
    const cells: Array<{ row: number; col: number }> = [];
    for (const c of g.cells) {
      const ri = rowIndexById.get(c.rowId);
      const ci = colIndexById.get(c.colId);
      if (ri === undefined || ci === undefined) continue;
      const start = blockStart[ri];
      const span = Math.max(1, maxPerRow[ri] ?? 1);
      const colIdx = Math.min(colsCount - 1, ci);
      for (let k = 0; k < span; k++) {
        const row = start + k;
        if (row >= totalRows) break;
        const key = `${row}:${colIdx}`;
        if (cellSet.has(key)) continue;
        cellSet.add(key);
        cells.push({ row, col: colIdx });
      }
    }
    if (cells.length === 0) continue;
    regions.push({
      id: g.id,
      label: g.label,
      cells,
      chromeStyle: g.chromeStyle,
    });
  }
  return regions;
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
