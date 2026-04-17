import type { UniversalMap, Card, Col, Row, Connector } from "./types";
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
  // Optional `id` lets the agent name a card it plans to reference later in the
  // same batch (e.g. as addConnector source/target or a subsequent addCard's
  // parentCardId). Validated as a slug; `k\d+` format is reserved for auto-assignment.
  | { op: "addCard"; colId: string; rowId: string; text: string; meta?: Record<string, string>; parentCardId?: string; id?: string }
  | { op: "removeCard"; cardId: string }
  | { op: "editCard"; cardId: string; text: string }
  | { op: "moveCard"; cardId: string; toColId: string; toRowId: string; toOrder?: number }
  // Nesting — reparent a card under a new parent (same col/row), or promote to top-level with null.
  | { op: "reparentCard"; cardId: string; newParentCardId: string | null; toOrder?: number }
  // Meta ops
  | { op: "setCardMeta"; cardId: string; key: string; value: string | null }
  | { op: "setMapMeta"; key: string; value: string }
  // Connector ops — card-to-card relationships. Source/target must both exist.
  // removeCard / removeCol / removeRow cascade: any connector that references
  // a deleted card is dropped automatically by applyOps.
  | { op: "addConnector"; sourceCardId: string; targetCardId: string; kind?: string; label?: string; routing?: "straight" | "orthogonal"; sourceAnchor?: "top" | "right" | "bottom" | "left"; targetAnchor?: "top" | "right" | "bottom" | "left" }
  | { op: "removeConnector"; connectorId: string }
  | { op: "updateConnector"; connectorId: string; patch: Partial<Omit<Connector, "id">> };

// ---------------------------------------------------------------------------
// ID generation — derived from the current map for each applyOps batch.
// Sequences are NOT module-level: each batch has its own counters to make
// applyOps a pure function of (map, ops) and to keep ID assignment
// deterministic for testing and replay.
// ---------------------------------------------------------------------------

type SeqState = { col: number; row: number; card: number; connector: number };

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
    connector: maxId(map.connectors ?? [], "e"),
  };
}

function nextColId(s: SeqState): string { return `c${++s.col}`; }
function nextRowId(s: SeqState): string { return `r${++s.row}`; }
function nextCardId(s: SeqState): string { return `k${++s.card}`; }
function nextConnectorId(s: SeqState): string { return `e${++s.connector}`; }

// Slug-id pattern for agent-specified card ids. Lowercase letter lead, then
// letters/digits/underscore/hyphen, 1–41 chars total. `k\d+` is reserved for
// the auto-assigner so manual ids can't collide with a later auto id.
const CARD_SLUG_ID = /^[a-z][a-z0-9_-]{0,40}$/;
const RESERVED_AUTO_CARD_ID = /^k\d+$/;

// Remove any connector whose source or target card no longer exists in the
// updated card list. Used by removeCard / removeCol / removeRow cascades and
// after any operation that could remove a card (e.g. parent cascade).
function pruneOrphanConnectors(map: UniversalMap): UniversalMap {
  const existing = map.connectors;
  if (!existing || existing.length === 0) return map;
  const ids = new Set(map.cards.map((c) => c.id));
  const next = existing.filter(
    (e) => ids.has(e.sourceCardId) && ids.has(e.targetCardId)
  );
  if (next.length === existing.length) return map;
  return { ...map, connectors: next };
}

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
      // Cascade: drop all cards in this col, then prune any connector whose
      // source or target card was removed.
      const next: UniversalMap = {
        ...map,
        cols: map.cols.filter((c) => c.id !== op.colId),
        cards: map.cards.filter((c) => c.colId !== op.colId),
      };
      return { ok: true, map: pruneOrphanConnectors(next) };
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
      const next: UniversalMap = {
        ...map,
        rows: map.rows.filter((r) => r.id !== op.rowId),
        cards: map.cards.filter((c) => c.rowId !== op.rowId),
      };
      return { ok: true, map: pruneOrphanConnectors(next) };
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
      // Resolve the card id. If the agent supplied one, validate it: must be a
      // slug, must not collide with the auto-assign pattern, must be unique.
      let cardId: string;
      if (op.id !== undefined) {
        if (typeof op.id !== "string" || !CARD_SLUG_ID.test(op.id)) {
          return {
            ok: false,
            reason: `addCard.id "${String(op.id)}" must be a slug matching ${CARD_SLUG_ID.source}`,
          };
        }
        if (RESERVED_AUTO_CARD_ID.test(op.id)) {
          return {
            ok: false,
            reason: `addCard.id "${op.id}" uses the reserved k\\d+ format (reserved for auto-assignment)`,
          };
        }
        if (map.cards.some((c) => c.id === op.id)) {
          return { ok: false, reason: `addCard.id "${op.id}" already exists` };
        }
        cardId = op.id;
      } else {
        cardId = nextCardId(seq);
      }
      const card: Card = {
        id: cardId,
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
      // Cascade: remove the card AND any children whose parentCardId === cardId,
      // then prune connectors that referenced any of those cards.
      const next: UniversalMap = {
        ...map,
        cards: map.cards.filter(
          (c) => c.id !== op.cardId && c.parentCardId !== op.cardId
        ),
      };
      return { ok: true, map: pruneOrphanConnectors(next) };
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

    // ── Connector ops ─────────────────────────────────────────────────────────

    case "addConnector": {
      if (op.sourceCardId === op.targetCardId) {
        return { ok: false, reason: `Connector source and target must differ` };
      }
      const cardIds = new Set(map.cards.map((c) => c.id));
      if (!cardIds.has(op.sourceCardId)) {
        return { ok: false, reason: `Source card not found: ${op.sourceCardId}` };
      }
      if (!cardIds.has(op.targetCardId)) {
        return { ok: false, reason: `Target card not found: ${op.targetCardId}` };
      }
      const connector: Connector = {
        id: nextConnectorId(seq),
        sourceCardId: op.sourceCardId,
        targetCardId: op.targetCardId,
        ...(op.kind ? { kind: op.kind } : {}),
        ...(op.label ? { label: op.label } : {}),
        ...(op.routing ? { routing: op.routing } : {}),
        ...(op.sourceAnchor ? { sourceAnchor: op.sourceAnchor } : {}),
        ...(op.targetAnchor ? { targetAnchor: op.targetAnchor } : {}),
      };
      return {
        ok: true,
        map: { ...map, connectors: [...(map.connectors ?? []), connector] },
      };
    }

    case "removeConnector": {
      const existing = map.connectors ?? [];
      if (!existing.find((e) => e.id === op.connectorId)) {
        return { ok: false, reason: `Connector not found: ${op.connectorId}` };
      }
      return {
        ok: true,
        map: { ...map, connectors: existing.filter((e) => e.id !== op.connectorId) },
      };
    }

    case "updateConnector": {
      const existing = map.connectors ?? [];
      const target = existing.find((e) => e.id === op.connectorId);
      if (!target) return { ok: false, reason: `Connector not found: ${op.connectorId}` };
      const cardIds = new Set(map.cards.map((c) => c.id));
      const nextSource = op.patch.sourceCardId ?? target.sourceCardId;
      const nextTarget = op.patch.targetCardId ?? target.targetCardId;
      if (nextSource === nextTarget) {
        return { ok: false, reason: `Connector source and target must differ` };
      }
      if (!cardIds.has(nextSource)) {
        return { ok: false, reason: `Source card not found: ${nextSource}` };
      }
      if (!cardIds.has(nextTarget)) {
        return { ok: false, reason: `Target card not found: ${nextTarget}` };
      }
      const { id: _dropId, ...patch } = op.patch as Partial<Connector> & { id?: string };
      void _dropId;
      return {
        ok: true,
        map: {
          ...map,
          connectors: existing.map((e) =>
            e.id === op.connectorId ? { ...e, ...patch } : e
          ),
        },
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
    "addConnector", "removeConnector", "updateConnector",
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
  // Connector invariants — optional field; when present every endpoint must
  // reference an existing card, and source must differ from target.
  const connectors = (map as Record<string, unknown>).connectors;
  if (connectors !== undefined) {
    if (!Array.isArray(connectors)) {
      return { ok: false, reason: "map.connectors must be an array when present" };
    }
    for (const raw of connectors) {
      if (!raw || typeof raw !== "object") {
        return { ok: false, reason: "Connector must be an object" };
      }
      const e = raw as Connector;
      if (typeof e.id !== "string") {
        return { ok: false, reason: "Connector missing id" };
      }
      if (typeof e.sourceCardId !== "string" || !byId.has(e.sourceCardId)) {
        return { ok: false, reason: `Connector ${e.id} references missing source card ${e.sourceCardId}` };
      }
      if (typeof e.targetCardId !== "string" || !byId.has(e.targetCardId)) {
        return { ok: false, reason: `Connector ${e.id} references missing target card ${e.targetCardId}` };
      }
      if (e.sourceCardId === e.targetCardId) {
        return { ok: false, reason: `Connector ${e.id} has identical source and target` };
      }
    }
  }
  return { ok: true, map: m as UniversalMap };
}
