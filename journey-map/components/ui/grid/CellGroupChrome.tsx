"use client";

import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

// ──────────────────────────────────────────────────────────────────────────────
// CellGroupChrome — renders "clustered" chrome over an otherwise-normal grid.
//
// The clustered variant of the ShapeContract tags sets of (colId, rowId) cells
// as named groups (Root Causes, Warning Signs, Lessons for 2026, …). The grid
// renderer stays the same — cards still live in regular cells — but we paint
// a shared ring + tint behind each group's cells and show a floating label
// chip at the top-left cell of every group. No absolute positioning; no DOM
// measurement; no overflow risk. If a cell doesn't belong to a group, it
// renders plainly.
//
// The component exports pure helpers (used inside CellSlotGrid) rather than a
// standalone DOM subtree: per-cell styling is the simplest way to avoid
// computing geometry over a flex-based grid whose row heights are intrinsic.
// ──────────────────────────────────────────────────────────────────────────────

export type CellGroup = NonNullable<FrameworkConfig["cellGroups"]>[number];

export type CellGroupInfo = {
  group: CellGroup;
  /** Index into config.cellGroups — used to pick a color from the palette. */
  groupIndex: number;
  /** True if this cell is the smallest-index (col, row) pair in the group. */
  isAnchor: boolean;
  /** Ring color class for the cell border. */
  ringClass: string;
  /** Soft background tint class. */
  bgClass: string;
  /** Pill color class for the group label chip at the anchor cell. */
  chipClass: string;
};

// A small palette — groups cycle through it. Indigo/purple-leaning so it
// composes with the app's existing indigo-accented UI without clashing.
const PALETTE: Array<{ ring: string; bg: string; chip: string }> = [
  {
    ring: "ring-indigo-200",
    bg: "bg-indigo-50/40",
    chip: "bg-indigo-100 text-indigo-900 ring-indigo-200",
  },
  {
    ring: "ring-sky-200",
    bg: "bg-sky-50/40",
    chip: "bg-sky-100 text-sky-900 ring-sky-200",
  },
  {
    ring: "ring-emerald-200",
    bg: "bg-emerald-50/40",
    chip: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  },
  {
    ring: "ring-amber-200",
    bg: "bg-amber-50/40",
    chip: "bg-amber-100 text-amber-900 ring-amber-200",
  },
  {
    ring: "ring-rose-200",
    bg: "bg-rose-50/40",
    chip: "bg-rose-100 text-rose-900 ring-rose-200",
  },
  {
    ring: "ring-violet-200",
    bg: "bg-violet-50/40",
    chip: "bg-violet-100 text-violet-900 ring-violet-200",
  },
  {
    ring: "ring-teal-200",
    bg: "bg-teal-50/40",
    chip: "bg-teal-100 text-teal-900 ring-teal-200",
  },
  {
    ring: "ring-orange-200",
    bg: "bg-orange-50/40",
    chip: "bg-orange-100 text-orange-900 ring-orange-200",
  },
];

/**
 * Resolve the group membership for a given (colId, rowId) cell. Returns
 * null when the config has no cellGroups or the cell is outside every
 * group. The rendering code uses this to decide whether to paint chrome.
 *
 * When a cell falls in multiple groups (rare), the first group wins.
 */
export function resolveCellGroup(
  config: FrameworkConfig,
  colId: string,
  rowId: string,
  colOrder: string[],
  rowOrder: string[]
): CellGroupInfo | null {
  const groups = config.cellGroups;
  if (!groups || groups.length === 0) return null;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const hit = g.cells.find((c) => c.colId === colId && c.rowId === rowId);
    if (!hit) continue;

    // Anchor = smallest (colIndex, rowIndex) cell in this group.
    let anchorColIdx = Number.POSITIVE_INFINITY;
    let anchorRowIdx = Number.POSITIVE_INFINITY;
    for (const cell of g.cells) {
      const cIdx = colOrder.indexOf(cell.colId);
      const rIdx = rowOrder.indexOf(cell.rowId);
      if (cIdx < 0 || rIdx < 0) continue;
      if (rIdx < anchorRowIdx || (rIdx === anchorRowIdx && cIdx < anchorColIdx)) {
        anchorRowIdx = rIdx;
        anchorColIdx = cIdx;
      }
    }
    const thisColIdx = colOrder.indexOf(colId);
    const thisRowIdx = rowOrder.indexOf(rowId);
    const isAnchor = thisColIdx === anchorColIdx && thisRowIdx === anchorRowIdx;

    const tone = PALETTE[i % PALETTE.length];
    return {
      group: g,
      groupIndex: i,
      isAnchor,
      ringClass: `ring-2 ${tone.ring}`,
      bgClass: tone.bg,
      chipClass: `ring-1 ${tone.chip}`,
    };
  }
  return null;
}

/**
 * The floating label chip that marks a group's anchor cell. Rendered INSIDE
 * the anchor cell at the top edge; stacks above sub-items via z-index. The
 * label is editable-in-place via the `onLabelChange` callback — Phase 6
 * uses this to let users rename groups without an agent round-trip.
 */
export function CellGroupLabelChip({
  info,
  onLabelChange,
}: {
  info: CellGroupInfo;
  onLabelChange?: (nextLabel: string) => void;
}) {
  return (
    <div
      className={`absolute top-1 left-1 z-10 px-2 py-[2px] text-[10.5px] font-medium rounded-full ${info.chipClass} pointer-events-auto`}
      data-cell-group-label={info.group.id}
      title={`Group: ${info.group.label}`}
    >
      {onLabelChange ? (
        <span
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(e) => {
            const next = (e.currentTarget.textContent ?? "").trim();
            if (next && next !== info.group.label) onLabelChange(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLElement).blur();
            }
            if (e.key === "Escape") {
              e.currentTarget.textContent = info.group.label;
              (e.currentTarget as HTMLElement).blur();
            }
          }}
          className="outline-none"
        >
          {info.group.label}
        </span>
      ) : (
        info.group.label
      )}
    </div>
  );
}
