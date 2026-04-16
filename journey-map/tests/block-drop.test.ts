import test from "node:test";
import assert from "node:assert/strict";
import { applyBlockDropToRows, type RowCardsMap } from "@/lib/block-drop";

function countIds(map: RowCardsMap) {
  const counts = new Map<string, number>();
  for (const cards of Object.values(map)) {
    for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

test("single card drop keeps intended index (no jump-left)", () => {
  const prev: RowCardsMap = {
    r1: ["a", "b", "c", "d", "e"],
    r2: ["f", "g", "h", "i", "j"],
  };

  const next = applyBlockDropToRows({
    prev,
    ids: ["d"],
    anchorId: "d",
    targetRowId: "r1",
    targetIndex: 4,
    activeRowOrder: ["r1", "r2"],
  });

  assert.deepEqual(next.r1, ["a", "b", "c", "e", "d"]);
  assert.deepEqual(next.r2, prev.r2);
});

test("single card drop swaps slots instead of shifting neighbors", () => {
  const prev: RowCardsMap = {
    r1: ["a", "b", "c", "d", "e"],
    r2: ["f", "g", "h", "i", "j"],
  };

  const next = applyBlockDropToRows({
    prev,
    ids: ["b"],
    anchorId: "b",
    targetRowId: "r1",
    targetIndex: 4,
    activeRowOrder: ["r1", "r2"],
  });

  assert.deepEqual(next.r1, ["a", "e", "c", "d", "b"]);
  assert.deepEqual(next.r2, prev.r2);
});

test("single card drop across rows swaps with target row slot", () => {
  const prev: RowCardsMap = {
    r1: ["a", "b", "c"],
    r2: ["d", "e", "f"],
  };

  const next = applyBlockDropToRows({
    prev,
    ids: ["b"],
    anchorId: "b",
    targetRowId: "r2",
    targetIndex: 1,
    activeRowOrder: ["r1", "r2"],
  });

  assert.deepEqual(next.r1, ["a", "e", "c"]);
  assert.deepEqual(next.r2, ["d", "b", "f"]);
});

test("multi-card drop preserves relative offsets and no orphans", () => {
  const prev: RowCardsMap = {
    r1: ["a1", "a2", "a3", "a4"],
    r2: ["b1", "b2", "b3", "b4"],
    r3: ["c1", "c2", "c3", "c4"],
  };

  const moving = ["a2", "b2", "c2"];
  const next = applyBlockDropToRows({
    prev,
    ids: moving,
    anchorId: "b2",
    targetRowId: "r2",
    targetIndex: 3,
    activeRowOrder: ["r1", "r2", "r3"],
  });

  assert.equal(next.r1.includes("a2"), true);
  assert.equal(next.r2.includes("b2"), true);
  assert.equal(next.r3.includes("c2"), true);

  const before = countIds(prev);
  const after = countIds(next);
  assert.equal(after.size, before.size);
  for (const [id, count] of after.entries()) {
    assert.equal(count, 1, `id ${id} should appear exactly once`);
  }
});

test("ignores missing ids and still returns stable matrix", () => {
  const prev: RowCardsMap = {
    r1: ["x1", "x2", "x3"],
    r2: ["y1", "y2", "y3"],
  };

  const next = applyBlockDropToRows({
    prev,
    ids: ["x2", "missing-id"],
    anchorId: "x2",
    targetRowId: "r2",
    targetIndex: 2,
    activeRowOrder: ["r1", "r2"],
  });

  const counts = countIds(next);
  for (const [id, count] of counts.entries()) {
    assert.equal(count, 1, `${id} should remain non-duplicated`);
  }
  assert.equal(counts.has("missing-id"), false);
});
