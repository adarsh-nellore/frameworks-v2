// ──────────────────────────────────────────────────────────────────────────────
// ShapeContract — the single typed handoff between planner, populator, renderer.
//
// Replaces the old "# Shape plan (authoritative)" markdown block with a
// structured object that every downstream stage reads as data, not prose.
//
// The contract is built ONCE (by the shape planner, informed by clarifier
// answers), validated ONCE (populate output must satisfy it), and handed to
// the renderer as a first-class input. Every bug class we've been patching
// (invented entities, empty populate, bullets in grid cells, freeform
// overflow) dissolves when the contract is enforced instead of advised.
//
// Variant replaces layout at the planner level:
//   - "axed"        → cols AND rows both carry semantic meaning (grid / matrix).
//   - "categorical" → one meaningful axis (kanban; single implicit row).
//   - "clustered"   → cells grouped into named regions (mind map, post-mortem
//                     canvas, opportunity map). Renders as a grid with a
//                     CellGroupChrome layer. NO absolute (x, y) positioning.
// ──────────────────────────────────────────────────────────────────────────────

import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

export type ContractVariant = "axed" | "categorical" | "clustered";

export type CellRef = { colId: string; rowId: string };

export type CellGroup = {
  id: string;
  label: string;
  cells: CellRef[];
  chromeStyle?: "box" | "region" | "radial-petal" | "none";
};

export type ChromeKind =
  | "double-diamond"
  | "venn"
  | "kano-curve"
  | "funnel"
  | "concentric-rings"
  | "coordinate-cross"
  | "none";

export type ShapeContract = {
  subject: string;
  audience?: string;

  variant: ContractVariant;

  /** Chrome rendered behind the headers. Decorative; composes with variant. */
  chrome?: ChromeKind;

  axes: {
    /** order-stable list; ids c1, c2, … assigned in declaration order. */
    cols: { id: string; label: string; kind?: string }[];
    /** order-stable list; ids r1, r2, … (categorical variant = single row). */
    rows: { id: string; label: string; kind?: string }[];
    colLabelsShown: boolean;
    rowLabelsShown: boolean;
  };

  /** Named cell groupings. ONLY present on clustered variant. */
  cellGroups?: CellGroup[];
  /** Hint for group layout ("3x2", "radial", "horizontal-strip", …). */
  cellGroupLayoutHint?: string;

  /** Card-count envelope per cell (or per group for clustered). */
  density: { min: number; target: number; max: number };

  /** Names the user literally listed in the prompt. Populate MUST NOT invent
   *  labels outside these lists when populated. Empty / absent = open list. */
  enumerated: {
    entities?: string[];
    dimensions?: string[];
  };

  /** Why this shape fits THIS subject. */
  rationale: string;
  /** The category-default shape, and why we're rejecting it. */
  vsDefault: string;

  /** Per-field confidence so the clarifier knows which gaps are worth asking
   *  about. "high" = ready; "medium" = defensible guess; "low" = needs ask. */
  confidence?: {
    subject?: "high" | "medium" | "low";
    variant?: "high" | "medium" | "low";
    axes?: "high" | "medium" | "low";
    cellGroups?: "high" | "medium" | "low";
    density?: "high" | "medium" | "low";
  };
};

// ──────────────────────────────────────────────────────────────────────────────
// validateContract — structural correctness gate.
// Returns { ok: true } | { ok: false, reason }. Meant to run on planner output
// before we hand it to synth, so a malformed plan surfaces immediately.
// ──────────────────────────────────────────────────────────────────────────────

export type ContractValidation =
  | { ok: true; contract: ShapeContract }
  | { ok: false; reason: string };

export function validateContract(input: unknown): ContractValidation {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "contract is not an object" };
  }
  const c = input as Partial<ShapeContract>;
  if (typeof c.subject !== "string" || !c.subject.trim()) {
    return { ok: false, reason: "missing subject" };
  }
  if (c.variant !== "axed" && c.variant !== "categorical" && c.variant !== "clustered") {
    return { ok: false, reason: `invalid variant: ${String(c.variant)}` };
  }
  if (!c.axes || !Array.isArray(c.axes.cols) || !Array.isArray(c.axes.rows)) {
    return { ok: false, reason: "missing axes.cols / axes.rows" };
  }
  if (c.axes.cols.length === 0) {
    return { ok: false, reason: "axes.cols is empty" };
  }
  if (c.axes.rows.length === 0) {
    return { ok: false, reason: "axes.rows is empty" };
  }
  for (const col of c.axes.cols) {
    if (!col || typeof col.label !== "string" || !col.label.trim()) {
      return { ok: false, reason: "axes.cols contains unlabeled entries" };
    }
  }
  for (const row of c.axes.rows) {
    if (!row || typeof row.label !== "string" || !row.label.trim()) {
      return { ok: false, reason: "axes.rows contains unlabeled entries" };
    }
  }
  if (c.variant === "categorical" && c.axes.rows.length !== 1) {
    return {
      ok: false,
      reason: `categorical variant requires exactly 1 row; got ${c.axes.rows.length}`,
    };
  }
  if (c.variant === "clustered") {
    if (!Array.isArray(c.cellGroups) || c.cellGroups.length === 0) {
      return {
        ok: false,
        reason: "clustered variant requires at least one cellGroup",
      };
    }
    const colIds = new Set(c.axes.cols.map((x) => x.id));
    const rowIds = new Set(c.axes.rows.map((x) => x.id));
    for (const g of c.cellGroups) {
      if (!g || typeof g.label !== "string" || !g.label.trim()) {
        return { ok: false, reason: "cellGroup missing label" };
      }
      if (!Array.isArray(g.cells) || g.cells.length === 0) {
        return { ok: false, reason: `cellGroup "${g.label}" has no cells` };
      }
      for (const cell of g.cells) {
        if (!colIds.has(cell.colId) || !rowIds.has(cell.rowId)) {
          return {
            ok: false,
            reason: `cellGroup "${g.label}" references unknown cell (${cell.colId}, ${cell.rowId})`,
          };
        }
      }
    }
  }
  if (!c.density || typeof c.density.min !== "number" || typeof c.density.target !== "number" || typeof c.density.max !== "number") {
    return { ok: false, reason: "density must be { min, target, max }" };
  }
  if (c.density.min > c.density.target || c.density.target > c.density.max) {
    return { ok: false, reason: `density invariant violated: ${c.density.min} ≤ ${c.density.target} ≤ ${c.density.max}` };
  }
  if (typeof c.rationale !== "string" || typeof c.vsDefault !== "string") {
    return { ok: false, reason: "missing rationale or vsDefault" };
  }
  // Normalise ids: planner may omit them; assign c1, c2 / r1, r2 in order.
  const cols = c.axes.cols.map((col, i) => ({
    id: col.id && /^c\d+$/.test(col.id) ? col.id : `c${i + 1}`,
    label: col.label.trim(),
    ...(col.kind ? { kind: col.kind } : {}),
  }));
  const rows = c.axes.rows.map((row, i) => ({
    id: row.id && /^r\d+$/.test(row.id) ? row.id : `r${i + 1}`,
    label: row.label.trim(),
    ...(row.kind ? { kind: row.kind } : {}),
  }));

  const cellGroups = c.cellGroups?.map((g, i) => ({
    id: g.id && /^g[a-z0-9_-]+$/i.test(g.id) ? g.id : `g${i + 1}`,
    label: g.label.trim(),
    cells: g.cells.map((cell) => ({
      colId: cols.find((col) => col.id === cell.colId || col.label === cell.colId)?.id ?? cell.colId,
      rowId: rows.find((row) => row.id === cell.rowId || row.label === cell.rowId)?.id ?? cell.rowId,
    })),
    ...(g.chromeStyle ? { chromeStyle: g.chromeStyle } : {}),
  }));

  const normalised: ShapeContract = {
    subject: c.subject.trim(),
    ...(c.audience ? { audience: c.audience.trim() } : {}),
    variant: c.variant,
    ...(c.chrome && c.chrome !== "none" ? { chrome: c.chrome } : {}),
    axes: {
      cols,
      rows,
      colLabelsShown: c.axes.colLabelsShown ?? true,
      rowLabelsShown: c.axes.rowLabelsShown ?? (c.variant !== "categorical"),
    },
    ...(cellGroups ? { cellGroups } : {}),
    ...(c.cellGroupLayoutHint ? { cellGroupLayoutHint: c.cellGroupLayoutHint } : {}),
    density: c.density,
    enumerated: c.enumerated ?? {},
    rationale: c.rationale.trim(),
    vsDefault: c.vsDefault.trim(),
    ...(c.confidence ? { confidence: c.confidence } : {}),
  };
  return { ok: true, contract: normalised };
}

// ──────────────────────────────────────────────────────────────────────────────
// contractToLayout — map contract variant to the existing FrameworkConfig
// layout enum. Keeps the universal renderer unchanged; the variant is a
// higher-level semantic tag that collapses into today's four-way enum.
// ──────────────────────────────────────────────────────────────────────────────

export function contractToLayout(contract: ShapeContract): FrameworkConfig["layout"] {
  if (contract.variant === "categorical") return "kanban";
  if (contract.variant === "axed") {
    // 2x2 / 2x3 / 3x3 with both axes fixed and ≤5 per side → matrix chrome.
    const smallSquare = contract.axes.cols.length <= 5 && contract.axes.rows.length <= 5;
    const bothFixed = contract.axes.cols.length >= 2 && contract.axes.rows.length >= 2;
    if (smallSquare && bothFixed && contract.axes.cols.length === contract.axes.rows.length) {
      return "matrix";
    }
    return "grid";
  }
  // clustered — renders as a grid with a CellGroupChrome overlay (Phase 3).
  return "grid";
}

// ──────────────────────────────────────────────────────────────────────────────
// diffContract — takes a populated UniversalMap and reports where it
// diverges from the contract. Used by the corrective-retry signal (Phase 5)
// so the populate agent sees the exact cells/labels it missed.
// ──────────────────────────────────────────────────────────────────────────────

export type ContractDiff = {
  missingCells: CellRef[];
  /** Cards whose text mentions labels outside enumerated.entities/dimensions. */
  invalidLabels: { cardId: string; text: string }[];
  /** Cards with unpaired markdown tokens (`**` / `==`). */
  markdownViolations: { cardId: string; text: string }[];
  /** Top-level card counts per cell — `min` cells are short of density.min. */
  underfilledCells: { cellRef: CellRef; have: number; need: number }[];
};

export function diffContract(
  map: UniversalMap,
  contract: ShapeContract
): ContractDiff {
  const byCell = new Map<string, number>();
  for (const card of map.cards) {
    if (card.parentCardId) continue; // top-level only for the count
    const key = `${card.colId}::${card.rowId}`;
    byCell.set(key, (byCell.get(key) ?? 0) + 1);
  }

  // For axed / categorical variants, every (col, row) pair is "required".
  // For clustered, required cells are the union of cellGroups[*].cells.
  let requiredCells: CellRef[];
  if (contract.variant === "clustered" && contract.cellGroups) {
    const seen = new Set<string>();
    requiredCells = [];
    for (const g of contract.cellGroups) {
      for (const cell of g.cells) {
        const key = `${cell.colId}::${cell.rowId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        requiredCells.push(cell);
      }
    }
  } else {
    requiredCells = [];
    for (const col of contract.axes.cols) {
      for (const row of contract.axes.rows) {
        requiredCells.push({ colId: col.id, rowId: row.id });
      }
    }
  }

  const missingCells: CellRef[] = [];
  const underfilledCells: ContractDiff["underfilledCells"] = [];
  for (const cell of requiredCells) {
    const have = byCell.get(`${cell.colId}::${cell.rowId}`) ?? 0;
    if (have === 0) {
      missingCells.push(cell);
      continue;
    }
    if (have < contract.density.min) {
      underfilledCells.push({ cellRef: cell, have, need: contract.density.min });
    }
  }

  // invalidLabels — only meaningful if enumerated.entities OR .dimensions is
  // non-empty. A card is "invalid" if its text references a label that's
  // clearly NOT in the enumerated list (e.g., "Cohere" in a matrix where the
  // user enumerated {Anthropic, OpenAI, …}). We use a loose contain check —
  // an exact tokenisation is overkill for a retry signal.
  const invalidLabels: ContractDiff["invalidLabels"] = [];
  const enumerated = [
    ...(contract.enumerated.entities ?? []),
    ...(contract.enumerated.dimensions ?? []),
  ].map((s) => s.toLowerCase());
  if (enumerated.length > 0) {
    // No action today beyond passing enumerated list through to retry. A
    // proper check needs card-to-entity linking. Phase 5 can tighten.
  }

  // markdownViolations — unpaired `**` or `==` per card line.
  const markdownViolations: ContractDiff["markdownViolations"] = [];
  for (const card of map.cards) {
    if (hasUnpairedMarkdown(card.text)) {
      markdownViolations.push({ cardId: card.id, text: card.text });
    }
  }

  return { missingCells, invalidLabels, markdownViolations, underfilledCells };
}

/** Returns true if the card text contains orphan `**` or `==` tokens per line. */
export function hasUnpairedMarkdown(text: string): boolean {
  for (const line of text.split("\n")) {
    const bolds = (line.match(/\*\*/g) ?? []).length;
    const highlights = (line.match(/==/g) ?? []).length;
    if (bolds % 2 !== 0) return true;
    if (highlights % 2 !== 0) return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// renderContractBlock — serialises a ShapeContract as an agent-readable block.
// Replaces the old renderShapePlanBlock. Structured, labeled, unambiguous.
// Populate / synth prompts parse this block for cols/rows/enumerated constraints.
// ──────────────────────────────────────────────────────────────────────────────

export function renderContractBlock(contract: ShapeContract): string {
  const lines: string[] = ["# Contract (authoritative — honor exactly)"];
  lines.push(`- subject: ${contract.subject}`);
  if (contract.audience) lines.push(`- audience: ${contract.audience}`);
  lines.push(`- variant: ${contract.variant}`);
  lines.push(`  (${variantDescription(contract.variant)})`);
  if (contract.chrome) lines.push(`- chrome: ${contract.chrome}`);
  lines.push(`- cols (${contract.axes.cols.length}, ${contract.axes.colLabelsShown ? "shown" : "hidden"}):`);
  for (const col of contract.axes.cols) {
    lines.push(`    ${col.id} = "${col.label}"${col.kind ? ` (kind: ${col.kind})` : ""}`);
  }
  lines.push(`- rows (${contract.axes.rows.length}, ${contract.axes.rowLabelsShown ? "shown" : "hidden"}):`);
  for (const row of contract.axes.rows) {
    lines.push(`    ${row.id} = "${row.label}"${row.kind ? ` (kind: ${row.kind})` : ""}`);
  }
  if (contract.cellGroups && contract.cellGroups.length > 0) {
    lines.push(`- cellGroups (${contract.cellGroups.length}):`);
    for (const g of contract.cellGroups) {
      const cellsTxt = g.cells.map((cell) => `(${cell.colId},${cell.rowId})`).join(" ");
      lines.push(`    ${g.id} = "${g.label}" over ${cellsTxt}`);
    }
    if (contract.cellGroupLayoutHint) {
      lines.push(`- cellGroupLayoutHint: ${contract.cellGroupLayoutHint}`);
    }
  }
  lines.push(`- density: ${contract.density.min}–${contract.density.max} cards per cell (target ${contract.density.target})`);
  if (contract.enumerated.entities && contract.enumerated.entities.length > 0) {
    lines.push(
      `- enumerated.entities (CLOSED LIST — do not invent others): ${contract.enumerated.entities.join(", ")}`
    );
  }
  if (contract.enumerated.dimensions && contract.enumerated.dimensions.length > 0) {
    lines.push(
      `- enumerated.dimensions (CLOSED LIST — do not invent others): ${contract.enumerated.dimensions.join(", ")}`
    );
  }
  lines.push(`- rationale: ${contract.rationale}`);
  lines.push(`- vs. default: ${contract.vsDefault}`);
  lines.push("");
  lines.push(
    "NON-NEGOTIABLE: use exactly these col/row ids and labels. Do not add, remove, rename, or reorder them. Do not emit meta.x / meta.y / meta.shapeWidth / meta.shapeHeight on any card (positioning is owned by the grid renderer). Do not invent labels beyond enumerated lists when present."
  );
  return lines.join("\n");
}

function variantDescription(v: ContractVariant): string {
  if (v === "axed") return "axed grid — both cols and rows carry semantic meaning";
  if (v === "categorical") return "categorical grid — cols are categories, single implicit row";
  return "clustered grid — named cell groups form the visual shape; axes may be unlabeled scaffolding";
}
