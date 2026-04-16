import test from "node:test";
import assert from "node:assert/strict";
import { applyOps, type Op } from "@/lib/frameworks/journey-map/ops";
import type { JourneyMap, RowKind } from "@/lib/frameworks/journey-map/types";

function makeMap(stagesN = 3, rowsN = 3, textPattern = ""): JourneyMap {
  const stages = Array.from({ length: stagesN }, (_, i) => ({
    id: `s${i + 1}`,
    label: `S${i + 1}`,
  }));
  const kinds: RowKind[] = [
    "actions",
    "touchpoints",
    "thoughts",
    "emotions",
    "pain_points",
    "opportunities",
  ];
  const rows = Array.from({ length: rowsN }, (_, i) => ({
    id: `r${i + 1}`,
    label: `R${i + 1}`,
    kind: kinds[i % kinds.length],
  }));
  const cells = rows.flatMap((r) =>
    stages.map((s) => ({
      id: `${r.id}-${s.id}`,
      stageId: s.id,
      rowId: r.id,
      text: textPattern ? `${r.id}-${s.id}` : "",
    }))
  );
  return { id: "test", title: "t", persona: "p", stages, rows, cells };
}

function expectOk(r: ReturnType<typeof applyOps>): JourneyMap {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.map;
}

test("moveRow reorders correctly", () => {
  const m = makeMap();
  const next = expectOk(applyOps(m, [{ op: "moveRow", rowId: "r1", toIndex: 2 }]));
  assert.deepEqual(
    next.rows.map((r) => r.id),
    ["r2", "r3", "r1"]
  );
});

test("moveRow with bad rowId fails", () => {
  const m = makeMap();
  const r = applyOps(m, [{ op: "moveRow", rowId: "rZ", toIndex: 0 }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.failedAtIndex, 0);
});

test("moveStage reorders and cells follow position", () => {
  const m = makeMap();
  // Move s1 → end. Cell at (s1, r1) should now be at the new last column.
  const next = expectOk(applyOps(m, [{ op: "moveStage", stageId: "s1", toIndex: 2 }]));
  assert.deepEqual(
    next.stages.map((s) => s.id),
    ["s2", "s3", "s1"]
  );
  // Cell ids haven't changed; only stageId/rowId references stay aligned.
  // The cell originally at (r1, s1) still has stageId=s1.
  const cell = next.cells.find((c) => c.id === "r1-s1");
  assert.equal(cell?.stageId, "s1");
});

test("swapCells swaps positions; cell ids unchanged", () => {
  const m = makeMap(3, 3, "fill");
  const next = expectOk(
    applyOps(m, [{ op: "swapCells", aCellId: "r1-s1", bCellId: "r2-s3" }])
  );
  const a = next.cells.find((c) => c.id === "r1-s1");
  const b = next.cells.find((c) => c.id === "r2-s3");
  // Original (r1-s1) was at (r1, s1); now lives at (r2, s3).
  assert.equal(a?.rowId, "r2");
  assert.equal(a?.stageId, "s3");
  // Original (r2-s3) was at (r2, s3); now at (r1, s1).
  assert.equal(b?.rowId, "r1");
  assert.equal(b?.stageId, "s1");
});

test("swapCells preserves text on each cell id", () => {
  const m = makeMap(2, 2, "fill");
  // r1-s1 has text "r1-s1"; r2-s2 has text "r2-s2"
  const next = expectOk(
    applyOps(m, [{ op: "swapCells", aCellId: "r1-s1", bCellId: "r2-s2" }])
  );
  const a = next.cells.find((c) => c.id === "r1-s1");
  const b = next.cells.find((c) => c.id === "r2-s2");
  assert.equal(a?.text, "r1-s1");
  assert.equal(b?.text, "r2-s2");
});

test("setCellText updates one cell's text immutably", () => {
  const m = makeMap();
  const next = expectOk(
    applyOps(m, [{ op: "setCellText", cellId: "r1-s1", text: "hello" }])
  );
  assert.equal(next.cells.find((c) => c.id === "r1-s1")?.text, "hello");
  // Source map untouched
  assert.equal(m.cells.find((c) => c.id === "r1-s1")?.text, "");
});

test("renameRow updates label, leaves kind intact", () => {
  const m = makeMap();
  const originalKind = m.rows[0].kind;
  const next = expectOk(
    applyOps(m, [{ op: "renameRow", rowId: "r1", label: "Renamed" }])
  );
  const r = next.rows.find((x) => x.id === "r1");
  assert.equal(r?.label, "Renamed");
  assert.equal(r?.kind, originalKind);
});

test("renameStage updates label", () => {
  const m = makeMap();
  const next = expectOk(
    applyOps(m, [{ op: "renameStage", stageId: "s2", label: "Phase 2" }])
  );
  assert.equal(next.stages.find((s) => s.id === "s2")?.label, "Phase 2");
});

test("addRow adds row with no cells (sparse)", () => {
  const m = makeMap(3, 3);
  const cellsBefore = m.cells.length;
  const next = expectOk(
    applyOps(m, [{ op: "addRow", label: "New", kind: "actions" }])
  );
  assert.equal(next.rows.length, 4);
  const newRow = next.rows[3];
  const cellsForNewRow = next.cells.filter((c) => c.rowId === newRow.id);
  assert.equal(cellsForNewRow.length, 0);
  assert.equal(next.cells.length, cellsBefore);
});

test("addStage adds stage with no cells (sparse)", () => {
  const m = makeMap(3, 3);
  const cellsBefore = m.cells.length;
  const next = expectOk(applyOps(m, [{ op: "addStage", label: "Z" }]));
  assert.equal(next.stages.length, 4);
  const newStage = next.stages[3];
  const cellsForNewStage = next.cells.filter((c) => c.stageId === newStage.id);
  assert.equal(cellsForNewStage.length, 0);
  assert.equal(next.cells.length, cellsBefore);
});

test("createCell adds a cell at an empty position", () => {
  const m = makeMap(3, 3);
  // Remove (r1, s1) so that slot is empty.
  const m2 = expectOk(applyOps(m, [{ op: "removeCell", cellId: "r1-s1" }]));
  assert.equal(
    m2.cells.some((c) => c.rowId === "r1" && c.stageId === "s1"),
    false
  );
  const m3 = expectOk(
    applyOps(m2, [
      { op: "createCell", rowId: "r1", stageId: "s1", text: "hello" },
    ])
  );
  const created = m3.cells.find(
    (c) => c.rowId === "r1" && c.stageId === "s1"
  );
  assert.ok(created);
  assert.equal(created!.text, "hello");
});

test("createCell on an occupied position with text overwrites (upsert)", () => {
  const m = makeMap(3, 3, "fill"); // cells have text == cellId
  const original = m.cells.find((c) => c.id === "r1-s1")!;
  assert.equal(original.text, "r1-s1");
  const next = expectOk(
    applyOps(m, [
      { op: "createCell", rowId: "r1", stageId: "s1", text: "overwritten" },
    ])
  );
  // No new cell added — same cell id, updated text.
  assert.equal(next.cells.length, m.cells.length);
  assert.equal(next.cells.find((c) => c.id === "r1-s1")?.text, "overwritten");
});

test("createCell on an occupied position without text is a no-op", () => {
  const m = makeMap(3, 3, "fill");
  const next = expectOk(
    applyOps(m, [{ op: "createCell", rowId: "r1", stageId: "s1" }])
  );
  assert.equal(next.cells.length, m.cells.length);
  assert.equal(next.cells.find((c) => c.id === "r1-s1")?.text, "r1-s1");
});

test("removeCell removes a cell and leaves the position empty", () => {
  const m = makeMap(3, 3);
  const before = m.cells.length;
  const next = expectOk(
    applyOps(m, [{ op: "removeCell", cellId: "r1-s1" }])
  );
  assert.equal(next.cells.length, before - 1);
  assert.equal(
    next.cells.some((c) => c.id === "r1-s1"),
    false
  );
});

test("moveCell to an empty target relocates (source becomes empty)", () => {
  const m = makeMap(3, 3, "fill");
  // First empty out (r2, s2).
  const m2 = expectOk(applyOps(m, [{ op: "removeCell", cellId: "r2-s2" }]));
  // Move (r1, s1) → (r2, s2).
  const m3 = expectOk(
    applyOps(m2, [
      { op: "moveCell", cellId: "r1-s1", toRowId: "r2", toStageId: "s2" },
    ])
  );
  const moved = m3.cells.find((c) => c.id === "r1-s1");
  assert.equal(moved?.rowId, "r2");
  assert.equal(moved?.stageId, "s2");
  // (r1, s1) is now empty.
  assert.equal(
    m3.cells.some((c) => c.rowId === "r1" && c.stageId === "s1"),
    false
  );
});

test("moveCell to an occupied target swaps", () => {
  const m = makeMap(3, 3, "fill");
  const next = expectOk(
    applyOps(m, [
      { op: "moveCell", cellId: "r1-s1", toRowId: "r2", toStageId: "s2" },
    ])
  );
  const a = next.cells.find((c) => c.id === "r1-s1");
  const b = next.cells.find((c) => c.id === "r2-s2");
  assert.equal(a?.rowId, "r2");
  assert.equal(a?.stageId, "s2");
  assert.equal(b?.rowId, "r1");
  assert.equal(b?.stageId, "s1");
});

test("removeRow removes row and all its cells", () => {
  const m = makeMap();
  const next = expectOk(applyOps(m, [{ op: "removeRow", rowId: "r2" }]));
  assert.equal(next.rows.length, 2);
  assert.equal(
    next.cells.filter((c) => c.rowId === "r2").length,
    0
  );
});

test("removeStage removes stage and that column from every row", () => {
  const m = makeMap();
  const next = expectOk(applyOps(m, [{ op: "removeStage", stageId: "s2" }]));
  assert.equal(next.stages.length, 2);
  assert.equal(
    next.cells.filter((c) => c.stageId === "s2").length,
    0
  );
});

test("removeRow refuses to remove the last row", () => {
  const m = makeMap(3, 1);
  const r = applyOps(m, [{ op: "removeRow", rowId: m.rows[0].id }]);
  assert.equal(r.ok, false);
});

test("moveBlock delegates to applyBlockDropToRows for multi-card swaps", () => {
  const m = makeMap(3, 3, "fill"); // text == cellId
  // Move block of (r1-s1, r2-s1) downward by 1 row, anchored on r1-s1.
  const next = expectOk(
    applyOps(m, [
      {
        op: "moveBlock",
        anchorCardId: "r1-s1",
        cardIds: ["r1-s1", "r2-s1"],
        toRowId: "r2",
        toIndex: 0,
      },
    ])
  );
  // r1-s1 should now live at (r2, s1)
  const a = next.cells.find((c) => c.id === "r1-s1");
  assert.equal(a?.rowId, "r2");
  assert.equal(a?.stageId, "s1");
  // Sanity: dense grid invariant — exactly one cell per (rowId, stageId)
  const seen = new Set<string>();
  for (const c of next.cells) {
    const key = `${c.rowId}:${c.stageId}`;
    assert.equal(seen.has(key), false, `duplicate at ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, 9);
});

test("sequence applies left-to-right; mid-sequence failure rolls back", () => {
  const m = makeMap();
  const ops: Op[] = [
    { op: "moveRow", rowId: "r1", toIndex: 2 },
    { op: "moveRow", rowId: "rZ", toIndex: 0 }, // BAD
  ];
  const r = applyOps(m, ops);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.failedAtIndex, 1);
  // The original m must be unchanged (we didn't mutate)
  assert.deepEqual(
    m.rows.map((r) => r.id),
    ["r1", "r2", "r3"]
  );
});

test("empty op list is a no-op", () => {
  const m = makeMap();
  const next = expectOk(applyOps(m, []));
  assert.equal(next, m);
});

test("addRow with toIndex inserts at position", () => {
  const m = makeMap(2, 3);
  const next = expectOk(
    applyOps(m, [{ op: "addRow", label: "Mid", kind: "thoughts", toIndex: 1 }])
  );
  assert.equal(next.rows[1].label, "Mid");
});
