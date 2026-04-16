import type { UniversalMap, Card, Col, Row } from "./types";
import { nextCardOrder, nextChildOrder } from "./types";

// ---------------------------------------------------------------------------
// Op discriminated union — 14 universal ops covering all frameworks
// ---------------------------------------------------------------------------

export type Op =
  // Column ops
  | { op: "addCol"; label: string; kind?: string; atIndex?: number }
  | { op: "removeCol"; colId: string }
  | { op: "renameCol"; colId: string; label: string }
  | { op: "moveCol"; colId: string; toIndex: number }
  // Row ops
  | { op: "addRow"; label: string; kind?: string; atIndex?: number }
  | { op: "removeRow"; rowId: string }
  | { op: "renameRow"; rowId: string; label: string }
  | { op: "moveRow"; rowId: string; toIndex: number }
  // Card ops — parentCardId on addCard makes the new card a sub-item of the parent.
  | { op: "addCard"; colId: string; rowId: string; text: string; meta?: Record<string, string>; parentCardId?: string }
  | { op: "removeCard"; cardId: string }
  | { op: "editCard"; cardId: string; text: string }
  | { op: "moveCard"; cardId: string; toColId: string; toRowId: string; toOrder?: number }
  // Nesting — reparent a card under a new parent (same col/row), or promote to top-level with null.
  | { op: "reparentCard"; cardId: string; newParentCardId: string | null; toOrder?: number }
  // Meta ops
  | { op: "setCardMeta"; cardId: string; key: string; value: string | null }
  | { op: "setMapMeta"; key: string; value: string };

// ---------------------------------------------------------------------------
// ID generation — derived from the current map for each applyOps batch.
// Sequences are NOT module-level: each batch has its own counters to make
// applyOps a pure function of (map, ops) and to keep ID assignment
// deterministic for testing and replay.
// ---------------------------------------------------------------------------

type SeqState = { col: number; row: number; card: number };

function initSeqs(map: UniversalMap): SeqState {
  const maxId = (xs: { id: string }[], prefix: string): number => {
    let m = 0;
    for (const x of xs) {
      if (!x.id.startsWith(prefix)) continue;
      const n = parseInt(x.id.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > m) m = n;
    }
    return m;
  };
  return {
    col: maxId(map.cols, "c"),
    row: maxId(map.rows, "r"),
    card: maxId(map.cards, "k"),
  };
}

function nextColId(s: SeqState): string { return `c${++s.col}`; }
function nextRowId(s: SeqState): string { return `r${++s.row}`; }
function nextCardId(s: SeqState): string { return `k${++s.card}`; }

// ---------------------------------------------------------------------------
// Apply a single op
// ---------------------------------------------------------------------------

function applyOne(
  map: UniversalMap,
  op: Op,
  seq: SeqState
): { ok: true; map: UniversalMap } | { ok: false; reason: string } {
  switch (op.op) {
    // ── Column ops ──────────────────────────────────────────────────────────

    case "addCol": {
      const col: Col = { id: nextColId(seq), label: op.label, ...(op.kind ? { kind: op.kind } : {}) };
      const cols = [...map.cols];
      const idx = op.atIndex !== undefined ? Math.max(0, Math.min(cols.length, op.atIndex)) : cols.length;
      cols.splice(idx, 0, col);
      return { ok: true, map: { ...map, cols } };
    }

    case "removeCol": {
      if (!map.cols.find((c) => c.id === op.colId)) {
        return { ok: false, reason: `Col not found: ${op.colId}` };
      }
      return {
        ok: true,
        map: {
          ...map,
          cols: map.cols.filter((c) => c.id !== op.colId),
          // cascade: remove all cards in this col
          cards: map.cards.filter((c) => c.colId !== op.colId),
        },
      };
    }

    case "renameCol": {
      const col = map.cols.find((c) => c.id === op.colId);
      if (!col) return { ok: false, reason: `Col not found: ${op.colId}` };
      return {
        ok: true,
        map: {
          ...map,
          cols: map.cols.map((c) => (c.id === op.colId ? { ...c, label: op.label } : c)),
        },
      };
    }

    case "moveCol": {
      const idx = map.cols.findIndex((c) => c.id === op.colId);
      if (idx === -1) return { ok: false, reason: `Col not found: ${op.colId}` };
      const cols = [...map.cols];
      const [col] = cols.splice(idx, 1);
      const target = Math.max(0, Math.min(cols.length, op.toIndex));
      cols.splice(target, 0, col);
      return { ok: true, map: { ...map, cols } };
    }

    // ── Row ops ──────────────────────────────────────────────────────────────

    case "addRow": {
      const row: Row = { id: nextRowId(seq), label: op.label, ...(op.kind ? { kind: op.kind } : {}) };
      const rows = [...map.rows];
      const idx = op.atIndex !== undefined ? Math.max(0, Math.min(rows.length, op.atIndex)) : rows.length;
      rows.splice(idx, 0, row);
      return { ok: true, map: { ...map, rows } };
    }

    case "removeRow": {
      if (!map.rows.find((r) => r.id === op.rowId)) {
        return { ok: false, reason: `Row not found: ${op.rowId}` };
      }
      return {
        ok: true,
        map: {
          ...map,
          rows: map.rows.filter((r) => r.id !== op.rowId),
          // cascade: remove all cards in this row
          cards: map.cards.filter((c) => c.rowId !== op.rowId),
        },
      };
    }

    case "renameRow": {
      const row = map.rows.find((r) => r.id === op.rowId);
      if (!row) return { ok: false, reason: `Row not found: ${op.rowId}` };
      return {
        ok: true,
        map: {
          ...map,
          rows: map.rows.map((r) => (r.id === op.rowId ? { ...r, label: op.label } : r)),
        },
      };
    }

    case "moveRow": {
      const idx = map.rows.findIndex((r) => r.id === op.rowId);
      if (idx === -1) return { ok: false, reason: `Row not found: ${op.rowId}` };
      const rows = [...map.rows];
      const [row] = rows.splice(idx, 1);
      const target = Math.max(0, Math.min(rows.length, op.toIndex));
      rows.splice(target, 0, row);
      return { ok: true, map: { ...map, rows } };
    }

    // ── Card ops ─────────────────────────────────────────────────────────────

    case "addCard": {
      if (!map.cols.find((c) => c.id === op.colId)) {
        return { ok: false, reason: `Col not found: ${op.colId}` };
      }
      if (!map.rows.find((r) => r.id === op.rowId)) {
        return { ok: false, reason: `Row not found: ${op.rowId}` };
      }
      // If this is a sub-item, validate the parent: exists, is top-level, same (col, row).
      if (op.parentCardId) {
        const parent = map.cards.find((c) => c.id === op.parentCardId);
        if (!parent) return { ok: false, reason: `Parent card not found: ${op.parentCardId}` };
        if (parent.parentCardId) {
          return { ok: false, reason: `Cannot nest under a sub-item (one level only): ${op.parentCardId}` };
        }
        if (parent.colId !== op.colId || parent.rowId !== op.rowId) {
          return {
            ok: false,
            reason: `Sub-item col/row must match parent (${parent.colId}·${parent.rowId}), got (${op.colId}·${op.rowId})`,
          };
        }
      }
      const card: Card = {
        id: nextCardId(seq),
        colId: op.colId,
        rowId: op.rowId,
        text: op.text,
        order: op.parentCardId
          ? nextChildOrder(map, op.parentCardId)
          : nextCardOrder(map, op.colId, op.rowId),
        ...(op.meta ? { meta: op.meta } : {}),
        ...(op.parentCardId ? { parentCardId: op.parentCardId } : {}),
      };
      return { ok: true, map: { ...map, cards: [...map.cards, card] } };
    }

    case "removeCard": {
      if (!map.cards.find((c) => c.id === op.cardId)) {
        return { ok: false, reason: `Card not found: ${op.cardId}` };
      }
      // Cascade: remove the card AND any children whose parentCardId === cardId.
      return {
        ok: true,
        map: {
          ...map,
          cards: map.cards.filter(
            (c) => c.id !== op.cardId && c.parentCardId !== op.cardId
          ),
        },
      };
    }

    case "editCard": {
      const card = map.cards.find((c) => c.id === op.cardId);
      if (!card) return { ok: false, reason: `Card not found: ${op.cardId}` };
      return {
        ok: true,
        map: {
          ...map,
          cards: map.cards.map((c) => (c.id === op.cardId ? { ...c, text: op.text } : c)),
        },
      };
    }

    case "moveCard": {
      const card = map.cards.find((c) => c.id === op.cardId);
      if (!card) return { ok: false, reason: `Card not found: ${op.cardId}` };
      if (!map.cols.find((c) => c.id === op.toColId)) {
        return { ok: false, reason: `Target col not found: ${op.toColId}` };
      }
      if (!map.rows.find((r) => r.id === op.toRowId)) {
        return { ok: false, reason: `Target row not found: ${op.toRowId}` };
      }
      // Sub-items can't be moved to a different (col, row) on their own —
      // they live where their parent lives. Moving the parent cascades the move.
      if (card.parentCardId && (op.toColId !== card.colId || op.toRowId !== card.rowId)) {
        return {
          ok: false,
          reason: `Cannot move sub-item across (col, row); move the parent or reparent first.`,
        };
      }
      const isParent = !card.parentCardId;
      const childIds = isParent
        ? new Set(map.cards.filter((c) => c.parentCardId === card.id).map((c) => c.id))
        : new Set<string>();
      // Target order only applies to the anchor card; children keep relative order.
      const newOrder =
        op.toOrder !== undefined
          ? op.toOrder
          : nextCardOrder(
              {
                ...map,
                cards: map.cards.filter((c) => c.id !== op.cardId && !childIds.has(c.id)),
              },
              op.toColId,
              op.toRowId
            );
      return {
        ok: true,
        map: {
          ...map,
          cards: map.cards.map((c) => {
            if (c.id === op.cardId) {
              return { ...c, colId: op.toColId, rowId: op.toRowId, order: newOrder };
            }
            if (childIds.has(c.id)) {
              // Cascade: children follow the parent's new (col, row); keep their order within the parent.
              return { ...c, colId: op.toColId, rowId: op.toRowId };
            }
            return c;
          }),
        },
      };
    }

    case "reparentCard": {
      const card = map.cards.find((c) => c.id === op.cardId);
      if (!card) return { ok: false, reason: `Card not found: ${op.cardId}` };
      // Promoting to top-level: just clear parentCardId and assign next top-level order.
      if (op.newParentCardId === null) {
        const newOrder =
          op.toOrder !== undefined
            ? op.toOrder
            : nextCardOrder(
                { ...map, cards: map.cards.filter((c) => c.id !== op.cardId) },
                card.colId,
                card.rowId
              );
        return {
          ok: true,
          map: {
            ...map,
            cards: map.cards.map((c) => {
              if (c.id !== op.cardId) return c;
              const { parentCardId: _drop, ...rest } = c;
              void _drop;
              return { ...rest, order: newOrder };
            }),
          },
        };
      }
      // Reparenting under a new parent.
      const parent = map.cards.find((c) => c.id === op.newParentCardId);
      if (!parent) {
        return { ok: false, reason: `New parent card not found: ${op.newParentCardId}` };
      }
      if (parent.parentCardId) {
        return { ok: false, reason: `New parent is itself a sub-item: ${op.newParentCardId}` };
      }
      if (parent.id === card.id) {
        return { ok: false, reason: `Card cannot be its own parent` };
      }
      // A card with children cannot become a sub-item (would create 2-level nesting).
      const hasChildren = map.cards.some((c) => c.parentCardId === card.id);
      if (hasChildren) {
        return {
          ok: false,
          reason: `Card has its own sub-items; cannot become a sub-item (one level only)`,
        };
      }
      const newOrder =
        op.toOrder !== undefined
          ? op.toOrder
          : nextChildOrder(map, parent.id);
      return {
        ok: true,
        map: {
          ...map,
          cards: map.cards.map((c) =>
            c.id === op.cardId
              ? {
                  ...c,
                  colId: parent.colId,
                  rowId: parent.rowId,
                  order: newOrder,
                  parentCardId: parent.id,
                }
              : c
          ),
        },
      };
    }

    // ── Meta ops ──────────────────────────────────────────────────────────────

    case "setCardMeta": {
      const card = map.cards.find((c) => c.id === op.cardId);
      if (!card) return { ok: false, reason: `Card not found: ${op.cardId}` };
      const meta = { ...(card.meta ?? {}) };
      if (op.value === null) {
        delete meta[op.key];
      } else {
        meta[op.key] = op.value;
      }
      return {
        ok: true,
        map: {
          ...map,
          cards: map.cards.map((c) =>
            c.id === op.cardId ? { ...c, meta: Object.keys(meta).length ? meta : undefined } : c
          ),
        },
      };
    }

    case "setMapMeta": {
      return {
        ok: true,
        map: { ...map, meta: { ...map.meta, [op.key]: op.value } },
      };
    }

    default: {
      // exhaustive check — TypeScript will catch unhandled op variants at compile time
      const _exhaustive: never = op;
      return { ok: false, reason: `Unknown op: ${(_exhaustive as { op: string }).op}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Batch apply — atomic left-to-right
// ---------------------------------------------------------------------------

export function applyOps(
  map: UniversalMap,
  ops: Op[]
): { ok: true; map: UniversalMap } | { ok: false; reason: string; failedAtIndex: number } {
  const seq = initSeqs(map);
  let current = map;
  for (let i = 0; i < ops.length; i++) {
    const result = applyOne(current, ops[i], seq);
    if (!result.ok) {
      return { ok: false, reason: result.reason, failedAtIndex: i };
    }
    current = result.map;
  }
  return { ok: true, map: current };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function validateOpShape(op: unknown): boolean {
  if (!op || typeof op !== "object") return false;
  const o = op as Record<string, unknown>;
  const validOps = new Set([
    "addCol", "removeCol", "renameCol", "moveCol",
    "addRow", "removeRow", "renameRow", "moveRow",
    "addCard", "removeCard", "editCard", "moveCard",
    "reparentCard",
    "setCardMeta", "setMapMeta",
  ]);
  return typeof o.op === "string" && validOps.has(o.op);
}

export function validateMap(m: unknown): { ok: true; map: UniversalMap } | { ok: false; reason: string } {
  if (!m || typeof m !== "object") return { ok: false, reason: "Map must be an object" };
  const map = m as Record<string, unknown>;
  if (typeof map.id !== "string") return { ok: false, reason: "Missing map.id" };
  if (typeof map.title !== "string") return { ok: false, reason: "Missing map.title" };
  if (!Array.isArray(map.cols)) return { ok: false, reason: "map.cols must be an array" };
  if (!Array.isArray(map.rows)) return { ok: false, reason: "map.rows must be an array" };
  if (!Array.isArray(map.cards)) return { ok: false, reason: "map.cards must be an array" };
  if (typeof map.meta !== "object" || map.meta === null || Array.isArray(map.meta)) {
    return { ok: false, reason: "map.meta must be an object" };
  }
  // Nesting invariants: sub-items must reference an existing top-level parent in the same (col, row).
  const byId = new Map<string, Card>();
  for (const c of map.cards as Card[]) byId.set(c.id, c);
  for (const c of map.cards as Card[]) {
    if (!c.parentCardId) continue;
    const parent = byId.get(c.parentCardId);
    if (!parent) {
      return { ok: false, reason: `Card ${c.id} references missing parent ${c.parentCardId}` };
    }
    if (parent.parentCardId) {
      return { ok: false, reason: `Card ${c.id} nests under sub-item ${c.parentCardId} (one level only)` };
    }
    if (parent.colId !== c.colId || parent.rowId !== c.rowId) {
      return {
        ok: false,
        reason: `Sub-item ${c.id} (col=${c.colId},row=${c.rowId}) does not match parent ${parent.id} (col=${parent.colId},row=${parent.rowId})`,
      };
    }
  }
  return { ok: true, map: m as UniversalMap };
}
