export type RowCardsMap = Record<string, string[]>;

type LiveOrigin = { rowIdx: number; colIdx: number };

export type ApplyBlockDropParams = {
  prev: RowCardsMap;
  ids: string[];
  anchorId: string;
  targetRowId: string;
  targetIndex: number;
  activeRowOrder: string[];
  seedRows?: RowCardsMap;
};

export function applyBlockDropToRows({
  prev,
  ids,
  anchorId,
  targetRowId,
  targetIndex,
  activeRowOrder,
  seedRows,
}: ApplyBlockDropParams): RowCardsMap {
  const anchorTargetRowIdx = activeRowOrder.indexOf(targetRowId);
  if (anchorTargetRowIdx < 0) return prev;

  const next: RowCardsMap = {};
  for (const rid of Object.keys(prev)) next[rid] = [...prev[rid]];
  for (const [rid, cards] of Object.entries(seedRows ?? {})) {
    next[rid] = [...cards];
  }

  const liveOriginById = new Map<string, LiveOrigin>();
  for (let rowIdx = 0; rowIdx < activeRowOrder.length; rowIdx++) {
    const rid = activeRowOrder[rowIdx];
    const arr = next[rid] ?? [];
    for (let colIdx = 0; colIdx < arr.length; colIdx++) {
      const id = arr[colIdx];
      if (!liveOriginById.has(id)) liveOriginById.set(id, { rowIdx, colIdx });
    }
  }

  const movingIds = ids.filter((id) => liveOriginById.has(id));
  if (!movingIds.length) return next;

  if (movingIds.length === 1) {
    const movingId = movingIds[0];
    const origin = liveOriginById.get(movingId);
    if (!origin) return next;
    const targetRowLen = next[targetRowId]?.length ?? 0;
    if (targetRowLen === 0) return next;
    const targetColIdx = Math.max(0, Math.min(targetIndex, targetRowLen - 1));
    if (origin.rowIdx === anchorTargetRowIdx && origin.colIdx === targetColIdx) {
      return next;
    }

    const originRowId = activeRowOrder[origin.rowIdx];
    const originArr = next[originRowId];
    const targetArr = next[targetRowId];
    if (!originArr || !targetArr) return next;

    const displacedId = targetArr[targetColIdx];
    originArr[origin.colIdx] = displacedId;
    targetArr[targetColIdx] = movingId;
    return next;
  }

  const anchorOrigin =
    liveOriginById.get(anchorId) ?? liveOriginById.get(movingIds[0]);
  if (!anchorOrigin) return next;

  const candidates: Array<{ id: string; rowId: string; origIdx: number }> = [];
  for (const id of movingIds) {
    const origin = liveOriginById.get(id);
    if (!origin) continue;
    const rowOffset = origin.rowIdx - anchorOrigin.rowIdx;
    const colOffset = origin.colIdx - anchorOrigin.colIdx;
    const targetRowIdx = Math.max(
      0,
      Math.min(anchorTargetRowIdx + rowOffset, activeRowOrder.length - 1)
    );
    const rowId = activeRowOrder[targetRowIdx];
    const rowLen = next[rowId]?.length ?? 0;
    const origIdx = Math.max(0, Math.min(targetIndex + colOffset, rowLen));
    candidates.push({ id, rowId, origIdx });
  }

  const movedIds = new Set(candidates.map((c) => c.id));
  for (const rid of Object.keys(next)) {
    next[rid] = next[rid].filter((id) => !movedIds.has(id));
  }

  const byRow: Record<string, Array<{ id: string; index: number }>> = {};
  for (const c of candidates) {
    const rowLen = next[c.rowId]?.length ?? 0;
    const index = Math.max(0, Math.min(c.origIdx, rowLen));
    if (!byRow[c.rowId]) byRow[c.rowId] = [];
    byRow[c.rowId].push({ id: c.id, index });
  }

  for (const [rid, items] of Object.entries(byRow)) {
    items.sort((a, b) => a.index - b.index);
    const arr = [...(next[rid] ?? [])];
    items.forEach((item, i) => {
      const insertAt = Math.min(item.index + i, arr.length);
      arr.splice(insertAt, 0, item.id);
    });
    next[rid] = arr;
  }

  return next;
}
