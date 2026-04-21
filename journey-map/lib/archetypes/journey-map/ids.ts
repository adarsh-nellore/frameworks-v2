import type { JourneyMap } from "./types";

// Monotonic: new id = (max existing integer suffix) + 1. This makes ids
// predictable for the agent: if rows are r1..r6, the next addRow creates r7.
// Deleting a row does NOT free up its id — we don't reuse numbers.
function nextIntSuffix(ids: string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = parseInt(id.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export function nextRowId(map: JourneyMap): string {
  return `r${nextIntSuffix(map.rows.map((r) => r.id), "r")}`;
}

export function nextStageId(map: JourneyMap): string {
  return `s${nextIntSuffix(map.stages.map((s) => s.id), "s")}`;
}

// New cells get sequential c-prefixed ids. Seed cells keep their `${rowId}-${stageId}` ids.
export function nextCellId(map: JourneyMap, used?: Set<string>): string {
  const existing = new Set(map.cells.map((c) => c.id));
  if (used) for (const id of used) existing.add(id);
  let n = 1;
  while (existing.has(`c${n}`)) n++;
  return `c${n}`;
}
