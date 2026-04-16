import type { JourneyMap, RowKind } from "./types";
import { applyBlockDropToRows } from "@/lib/block-drop";
import { nextCellId, nextRowId, nextStageId } from "./ids";

export type Op =
  | { op: "moveRow"; rowId: string; toIndex: number }
  | { op: "moveStage"; stageId: string; toIndex: number }
  | { op: "swapCells"; aCellId: string; bCellId: string }
  | {
      op: "moveBlock";
      anchorCardId: string;
      cardIds: string[];
      toRowId: string;
      toIndex: number;
    }
  | { op: "moveCell"; cellId: string; toRowId: string; toStageId: string }
  | { op: "createCell"; rowId: string; stageId: string; text?: string }
  | { op: "removeCell"; cellId: string }
  | { op: "setCellText"; cellId: string; text: string }
  | { op: "renameStage"; stageId: string; label: string }
  | { op: "renameRow"; rowId: string; label: string }
  | { op: "addRow"; label: string; kind: RowKind; toIndex?: number }
  | { op: "addStage"; label: string; toIndex?: number }
  | { op: "removeRow"; rowId: string }
  | { op: "removeStage"; stageId: string };

export type ApplyResult =
  | { ok: true; map: JourneyMap }
  | { ok: false; reason: string; failedAtIndex: number };

// Apply a sequence of ops left-to-right. Atomic on failure: if any op fails,
// returns the original map unchanged with failedAtIndex pointing at the offender.
export function applyOps(map: JourneyMap, ops: Op[]): ApplyResult {
  let cur = map;
  for (let i = 0; i < ops.length; i++) {
    const result = applyOne(cur, ops[i]);
    if (!result.ok) return { ok: false, reason: result.reason, failedAtIndex: i };
    cur = result.map;
  }
  return { ok: true, map: cur };
}

function applyOne(
  map: JourneyMap,
  op: Op
): { ok: true; map: JourneyMap } | { ok: false; reason: string } {
  switch (op.op) {
    case "moveRow": {
      const idx = map.rows.findIndex((r) => r.id === op.rowId);
      if (idx < 0) return { ok: false, reason: `unknown rowId: ${op.rowId}` };
      const nextRows = [...map.rows];
      const [moved] = nextRows.splice(idx, 1);
      const insertAt = clamp(op.toIndex, 0, nextRows.length);
      nextRows.splice(insertAt, 0, moved);
      return { ok: true, map: { ...map, rows: nextRows } };
    }

    case "moveStage": {
      const idx = map.stages.findIndex((s) => s.id === op.stageId);
      if (idx < 0)
        return { ok: false, reason: `unknown stageId: ${op.stageId}` };
      const nextStages = [...map.stages];
      const [moved] = nextStages.splice(idx, 1);
      const insertAt = clamp(op.toIndex, 0, nextStages.length);
      nextStages.splice(insertAt, 0, moved);
      return { ok: true, map: { ...map, stages: nextStages } };
    }

    case "swapCells": {
      const a = map.cells.find((c) => c.id === op.aCellId);
      const b = map.cells.find((c) => c.id === op.bCellId);
      if (!a) return { ok: false, reason: `unknown cell ${op.aCellId}` };
      if (!b) return { ok: false, reason: `unknown cell ${op.bCellId}` };
      if (a.id === b.id) return { ok: true, map };
      const nextCells = map.cells.map((c) => {
        if (c.id === a.id) return { ...c, stageId: b.stageId, rowId: b.rowId };
        if (c.id === b.id) return { ...c, stageId: a.stageId, rowId: a.rowId };
        return c;
      });
      return { ok: true, map: { ...map, cells: nextCells } };
    }

    case "moveBlock": {
      // Bridge to applyBlockDropToRows: build rowCards (rowId → cellIds in stage order),
      // run the existing multi-card swap algorithm, then reconcile cell positions back.
      const rowIds = map.rows.map((r) => r.id);
      const stageIds = map.stages.map((s) => s.id);
      if (!rowIds.includes(op.toRowId))
        return { ok: false, reason: `unknown toRowId: ${op.toRowId}` };

      const rowCards: Record<string, string[]> = {};
      for (const rid of rowIds) {
        rowCards[rid] = stageIds.map((sid) => {
          const cell = map.cells.find(
            (c) => c.rowId === rid && c.stageId === sid
          );
          return cell ? cell.id : "";
        });
      }

      // Validate moving ids exist
      for (const id of op.cardIds) {
        if (!map.cells.some((c) => c.id === id)) {
          return { ok: false, reason: `unknown cardId in moveBlock: ${id}` };
        }
      }

      const next = applyBlockDropToRows({
        prev: rowCards,
        ids: op.cardIds,
        anchorId: op.anchorCardId,
        targetRowId: op.toRowId,
        targetIndex: op.toIndex,
        activeRowOrder: rowIds,
      });

      // Reconcile: cell at position (rowIds[r], stageIds[c]) is whatever id is at next[rowIds[r]][c].
      const nextCellsById = new Map(map.cells.map((c) => [c.id, { ...c }]));
      for (let r = 0; r < rowIds.length; r++) {
        const rid = rowIds[r];
        const arr = next[rid] ?? [];
        for (let cIdx = 0; cIdx < arr.length; cIdx++) {
          const cellId = arr[cIdx];
          const cell = nextCellsById.get(cellId);
          if (!cell) continue;
          cell.rowId = rid;
          cell.stageId = stageIds[cIdx];
        }
      }

      return {
        ok: true,
        map: { ...map, cells: Array.from(nextCellsById.values()) },
      };
    }

    case "moveCell": {
      const cell = map.cells.find((c) => c.id === op.cellId);
      if (!cell) return { ok: false, reason: `unknown cell ${op.cellId}` };
      if (!map.rows.some((r) => r.id === op.toRowId))
        return { ok: false, reason: `unknown rowId ${op.toRowId}` };
      if (!map.stages.some((s) => s.id === op.toStageId))
        return { ok: false, reason: `unknown stageId ${op.toStageId}` };
      if (cell.rowId === op.toRowId && cell.stageId === op.toStageId)
        return { ok: true, map };
      const occupant = map.cells.find(
        (c) =>
          c.id !== cell.id &&
          c.rowId === op.toRowId &&
          c.stageId === op.toStageId
      );
      const nextCells = map.cells.map((c) => {
        if (c.id === cell.id)
          return { ...c, rowId: op.toRowId, stageId: op.toStageId };
        if (occupant && c.id === occupant.id)
          return { ...c, rowId: cell.rowId, stageId: cell.stageId };
        return c;
      });
      return { ok: true, map: { ...map, cells: nextCells } };
    }

    case "createCell": {
      if (!map.rows.some((r) => r.id === op.rowId))
        return { ok: false, reason: `unknown rowId ${op.rowId}` };
      if (!map.stages.some((s) => s.id === op.stageId))
        return { ok: false, reason: `unknown stageId ${op.stageId}` };
      const existing = map.cells.find(
        (c) => c.rowId === op.rowId && c.stageId === op.stageId
      );
      if (existing) {
        // Upsert: if text is provided, overwrite; otherwise leave as-is (no-op).
        if (op.text === undefined) return { ok: true, map };
        return {
          ok: true,
          map: {
            ...map,
            cells: map.cells.map((c) =>
              c.id === existing.id ? { ...c, text: op.text! } : c
            ),
          },
        };
      }
      const id = nextCellId(map);
      return {
        ok: true,
        map: {
          ...map,
          cells: [
            ...map.cells,
            { id, rowId: op.rowId, stageId: op.stageId, text: op.text ?? "" },
          ],
        },
      };
    }

    case "removeCell": {
      if (!map.cells.some((c) => c.id === op.cellId))
        return { ok: false, reason: `unknown cell ${op.cellId}` };
      return {
        ok: true,
        map: { ...map, cells: map.cells.filter((c) => c.id !== op.cellId) },
      };
    }

    case "setCellText": {
      const idx = map.cells.findIndex((c) => c.id === op.cellId);
      if (idx < 0) return { ok: false, reason: `unknown cell ${op.cellId}` };
      const nextCells = [...map.cells];
      nextCells[idx] = { ...nextCells[idx], text: op.text };
      return { ok: true, map: { ...map, cells: nextCells } };
    }

    case "renameRow": {
      const idx = map.rows.findIndex((r) => r.id === op.rowId);
      if (idx < 0) return { ok: false, reason: `unknown rowId ${op.rowId}` };
      const nextRows = [...map.rows];
      nextRows[idx] = { ...nextRows[idx], label: op.label };
      return { ok: true, map: { ...map, rows: nextRows } };
    }

    case "renameStage": {
      const idx = map.stages.findIndex((s) => s.id === op.stageId);
      if (idx < 0)
        return { ok: false, reason: `unknown stageId ${op.stageId}` };
      const nextStages = [...map.stages];
      nextStages[idx] = { ...nextStages[idx], label: op.label };
      return { ok: true, map: { ...map, stages: nextStages } };
    }

    case "addRow": {
      const newRowId = nextRowId(map);
      const nextRows = [...map.rows];
      const insertAt =
        op.toIndex !== undefined
          ? clamp(op.toIndex, 0, nextRows.length)
          : nextRows.length;
      nextRows.splice(insertAt, 0, {
        id: newRowId,
        label: op.label,
        kind: op.kind,
      });
      // Sparse: the new row starts with no cells. Use createCell or setCellText
      // (on a cell you've just created) to populate.
      return { ok: true, map: { ...map, rows: nextRows } };
    }

    case "addStage": {
      const newStageId = nextStageId(map);
      const nextStages = [...map.stages];
      const insertAt =
        op.toIndex !== undefined
          ? clamp(op.toIndex, 0, nextStages.length)
          : nextStages.length;
      nextStages.splice(insertAt, 0, { id: newStageId, label: op.label });
      // Sparse: new column starts with no cells.
      return { ok: true, map: { ...map, stages: nextStages } };
    }

    case "removeRow": {
      if (!map.rows.find((r) => r.id === op.rowId))
        return { ok: false, reason: `unknown rowId ${op.rowId}` };
      if (map.rows.length <= 1)
        return { ok: false, reason: "cannot remove last row" };
      return {
        ok: true,
        map: {
          ...map,
          rows: map.rows.filter((r) => r.id !== op.rowId),
          cells: map.cells.filter((c) => c.rowId !== op.rowId),
        },
      };
    }

    case "removeStage": {
      if (!map.stages.find((s) => s.id === op.stageId))
        return { ok: false, reason: `unknown stageId ${op.stageId}` };
      if (map.stages.length <= 1)
        return { ok: false, reason: "cannot remove last stage" };
      return {
        ok: true,
        map: {
          ...map,
          stages: map.stages.filter((s) => s.id !== op.stageId),
          cells: map.cells.filter((c) => c.stageId !== op.stageId),
        },
      };
    }

    default: {
      const _exhaustive: never = op;
      return { ok: false, reason: `unknown op type` };
    }
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(n, hi));
}

// Convenience: validate that ops at least have well-formed shapes (no missing fields).
// Used server-side as a cheap pre-check before the full applyOps dry run.
export function validateOpShape(op: unknown): op is Op {
  if (!op || typeof op !== "object") return false;
  const o = op as { op?: unknown };
  if (typeof o.op !== "string") return false;
  switch (o.op) {
    case "moveRow":
      return hasStringFields(o, ["rowId"]) && hasNumberFields(o, ["toIndex"]);
    case "moveStage":
      return hasStringFields(o, ["stageId"]) && hasNumberFields(o, ["toIndex"]);
    case "swapCells":
      return hasStringFields(o, ["aCellId", "bCellId"]);
    case "moveBlock":
      return (
        hasStringFields(o, ["anchorCardId", "toRowId"]) &&
        hasNumberFields(o, ["toIndex"]) &&
        Array.isArray((o as { cardIds?: unknown }).cardIds) &&
        (o as { cardIds: unknown[] }).cardIds.every(
          (x) => typeof x === "string"
        )
      );
    case "moveCell":
      return hasStringFields(o, ["cellId", "toRowId", "toStageId"]);
    case "createCell":
      return (
        hasStringFields(o, ["rowId", "stageId"]) &&
        ((o as { text?: unknown }).text === undefined ||
          typeof (o as { text?: unknown }).text === "string")
      );
    case "removeCell":
      return hasStringFields(o, ["cellId"]);
    case "setCellText":
      return hasStringFields(o, ["cellId", "text"]);
    case "renameRow":
      return hasStringFields(o, ["rowId", "label"]);
    case "renameStage":
      return hasStringFields(o, ["stageId", "label"]);
    case "addRow":
      return hasStringFields(o, ["label", "kind"]);
    case "addStage":
      return hasStringFields(o, ["label"]);
    case "removeRow":
      return hasStringFields(o, ["rowId"]);
    case "removeStage":
      return hasStringFields(o, ["stageId"]);
    default:
      return false;
  }
}

function hasStringFields(o: object, keys: string[]) {
  return keys.every(
    (k) => typeof (o as Record<string, unknown>)[k] === "string"
  );
}
function hasNumberFields(o: object, keys: string[]) {
  return keys.every(
    (k) => typeof (o as Record<string, unknown>)[k] === "number"
  );
}
