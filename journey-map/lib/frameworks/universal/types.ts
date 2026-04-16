// Universal map schema — shared across all frameworks.
// Every framework is cols × rows → cards. The labels and layout differ;
// the structure does not.

export type Col = {
  id: string;
  label: string;
  /** Framework-specific semantic kind (e.g. "actions", "pain_points", "functional_jobs") */
  kind?: string;
};

export type Row = {
  id: string;
  label: string;
  /** Framework-specific semantic kind */
  kind?: string;
};

export type CardMeta = Record<string, string>;

export type Card = {
  id: string;
  /** Which column this card belongs to */
  colId: string;
  /** Which row this card belongs to */
  rowId: string;
  /** Rich text content — supports **bold** and ==highlight== */
  text: string;
  /** Sort order within a (colId, rowId) position — lower numbers render first.
   *  For sub-items, this is the order within the parent's children list. */
  order: number;
  /**
   * Framework-specific metadata key-value pairs.
   * e.g. { priority: "high" } for JTBD, { cardType: "quote" } for affinity
   */
  meta?: CardMeta;
  /**
   * Optional parent card id. If set, this card is a sub-item rendered nested
   * under its parent instead of as a top-level card at (colId, rowId).
   * Invariants enforced by applyOps and validateMap:
   *   - One level only: a parent itself must NOT have a parentCardId.
   *   - A sub-item's colId and rowId MUST equal its parent's colId and rowId.
   *   - Deleting a parent cascades to its children.
   */
  parentCardId?: string;
};

export type UniversalMap = {
  id: string;
  title: string;
  /**
   * Top-level framework-specific metadata.
   * e.g. { persona: "...", coreJobStatement: "...", xAxisLabel: "..." }
   */
  meta: Record<string, string>;
  cols: Col[];
  rows: Row[];
  cards: Card[];
};

// ---------------------------------------------------------------------------
// Selection — sent to the arrange agent as optional focus
// ---------------------------------------------------------------------------

export type UniversalSelection =
  | { type: "cards"; ids: string[] }
  | { type: "col"; id: string }
  | { type: "row"; id: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Top-level cards at (colId, rowId) — excludes sub-items. */
export function cardsAt(map: UniversalMap, colId: string, rowId: string): Card[] {
  return map.cards
    .filter((c) => c.colId === colId && c.rowId === rowId && !c.parentCardId)
    .sort((a, b) => a.order - b.order);
}

/** Top-level cards in a col — excludes sub-items. */
export function cardsInCol(map: UniversalMap, colId: string): Card[] {
  return map.cards
    .filter((c) => c.colId === colId && !c.parentCardId)
    .sort((a, b) => a.order - b.order);
}

/** Top-level cards in a row — excludes sub-items. */
export function cardsInRow(map: UniversalMap, rowId: string): Card[] {
  return map.cards
    .filter((c) => c.rowId === rowId && !c.parentCardId)
    .sort((a, b) => a.order - b.order);
}

/** Next order value for a new top-level card at (colId, rowId). */
export function nextCardOrder(map: UniversalMap, colId: string, rowId: string): number {
  const existing = cardsAt(map, colId, rowId);
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((c) => c.order)) + 1;
}

/** Children of a parent card, sorted by order. */
export function childrenOf(map: UniversalMap, parentCardId: string): Card[] {
  return map.cards
    .filter((c) => c.parentCardId === parentCardId)
    .sort((a, b) => a.order - b.order);
}

/** Next order value for a new sub-item under a parent card. */
export function nextChildOrder(map: UniversalMap, parentCardId: string): number {
  const existing = childrenOf(map, parentCardId);
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((c) => c.order)) + 1;
}
