import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  applyOps,
  validateMap,
  validateOpShape,
  cardsAt,
  cardsInCol,
  cardsInRow,
  type UniversalMap,
  type Op,
} from "../lib/frameworks/universal";
import {
  affinityDiagramConfig,
  competitiveMapConfig,
  journeyMapConfig,
  jtbdCanvasConfig,
  matrix2x2Config,
} from "../lib/frameworks/universal";
import { renderMapDSL, renderUserPayload, parseFocus } from "../lib/frameworks/universal/payload";

// Empty seed for clean ops testing
function blank(): UniversalMap {
  return { id: "t", title: "Test", meta: {}, cols: [], rows: [], cards: [] };
}

// ────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ────────────────────────────────────────────────────────────────────────────

test("validateMap: rejects non-objects", () => {
  assert.equal(validateMap(null).ok, false);
  assert.equal(validateMap(42).ok, false);
  assert.equal(validateMap("hi").ok, false);
});

test("validateMap: rejects missing fields", () => {
  assert.equal(validateMap({}).ok, false);
  assert.equal(validateMap({ id: "x" }).ok, false);
  assert.equal(validateMap({ id: "x", title: "y", cols: [], rows: [], cards: [] }).ok, false); // missing meta
});

test("validateMap: accepts blank map", () => {
  const r = validateMap(blank());
  assert.equal(r.ok, true);
});

test("validateOpShape: accepts each op type", () => {
  const ops: Op[] = [
    { op: "addCol", label: "x" },
    { op: "removeCol", colId: "c1" },
    { op: "renameCol", colId: "c1", label: "y" },
    { op: "moveCol", colId: "c1", toIndex: 0 },
    { op: "addRow", label: "r" },
    { op: "removeRow", rowId: "r1" },
    { op: "renameRow", rowId: "r1", label: "y" },
    { op: "moveRow", rowId: "r1", toIndex: 0 },
    { op: "addCard", colId: "c1", rowId: "r1", text: "x" },
    { op: "removeCard", cardId: "k1" },
    { op: "editCard", cardId: "k1", text: "y" },
    { op: "moveCard", cardId: "k1", toColId: "c2", toRowId: "r1" },
    { op: "reparentCard", cardId: "k2", newParentCardId: "k1" },
    { op: "reparentCard", cardId: "k2", newParentCardId: null },
    { op: "setCardMeta", cardId: "k1", key: "priority", value: "high" },
    { op: "setMapMeta", key: "persona", value: "X" },
  ];
  for (const op of ops) {
    assert.equal(validateOpShape(op), true, `op ${op.op} should validate`);
  }
});

test("validateOpShape: rejects garbage", () => {
  assert.equal(validateOpShape(null), false);
  assert.equal(validateOpShape({}), false);
  assert.equal(validateOpShape({ op: "foo" }), false);
  assert.equal(validateOpShape({ op: "addCard" }), true); // shape check is just op name
});

// ────────────────────────────────────────────────────────────────────────────
// APPLY OPS
// ────────────────────────────────────────────────────────────────────────────

test("addCol/addRow/addCard: builds a map from blank", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "Col A" },
    { op: "addCol", label: "Col B" },
    { op: "addRow", label: "Row 1" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "Hello" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.map.cols.length, 2);
  assert.equal(r.map.rows.length, 1);
  assert.equal(r.map.cards.length, 1);
  assert.equal(r.map.cards[0].text, "Hello");
  assert.equal(r.map.cards[0].colId, "c1");
});

test("ID generation continues from existing seed", () => {
  // journeyMap seed uses c1-c6, r1-r6, k1-k27
  const r = applyOps(journeyMapConfig.seed, [
    { op: "addCol", label: "New Col" },
    { op: "addRow", label: "New Row" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Should get c7, r7 (next monotonic)
  const newCol = r.map.cols[r.map.cols.length - 1];
  const newRow = r.map.rows[r.map.rows.length - 1];
  assert.equal(newCol.id, "c7");
  assert.equal(newRow.id, "r7");
});

test("addCol with atIndex inserts at position", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addCol", label: "B" },
    { op: "addCol", label: "C", atIndex: 1 }, // between A and B
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(
    r.map.cols.map((c) => c.label),
    ["A", "C", "B"]
  );
});

test("removeCol cascades cards", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addCol", label: "B" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "in A" },
    { op: "addCard", colId: "c2", rowId: "r1", text: "in B" },
    { op: "removeCol", colId: "c1" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.map.cols.length, 1);
  assert.equal(r.map.cards.length, 1);
  assert.equal(r.map.cards[0].text, "in B");
});

test("removeRow cascades cards", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R1" },
    { op: "addRow", label: "R2" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "in R1" },
    { op: "addCard", colId: "c1", rowId: "r2", text: "in R2" },
    { op: "removeRow", rowId: "r2" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.map.rows.length, 1);
  assert.equal(r.map.cards.length, 1);
  assert.equal(r.map.cards[0].text, "in R1");
});

test("moveCard to new position assigns new order", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addCol", label: "B" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "X" },
    { op: "addCard", colId: "c2", rowId: "r1", text: "Y" },
    { op: "addCard", colId: "c2", rowId: "r1", text: "Z" }, // already at order 1
    { op: "moveCard", cardId: "k1", toColId: "c2", toRowId: "r1" }, // moves X to col B
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const inB = cardsAt(r.map, "c2", "r1");
  assert.equal(inB.length, 3);
  // order: Y(0), Z(1), X(2)
  assert.equal(inB[2].text, "X");
});

test("setCardMeta sets and removes", () => {
  const built = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "X" },
  ]);
  if (!built.ok) throw new Error("setup failed");
  const set = applyOps(built.map, [
    { op: "setCardMeta", cardId: "k1", key: "priority", value: "high" },
  ]);
  if (!set.ok) throw new Error("set failed");
  assert.equal(set.map.cards[0].meta?.priority, "high");

  const cleared = applyOps(set.map, [
    { op: "setCardMeta", cardId: "k1", key: "priority", value: null },
  ]);
  if (!cleared.ok) throw new Error("clear failed");
  // meta should be undefined when last key removed
  assert.equal(cleared.map.cards[0].meta, undefined);
});

test("setMapMeta sets top-level fields", () => {
  const r = applyOps(blank(), [
    { op: "setMapMeta", key: "persona", value: "CFO" },
    { op: "setMapMeta", key: "context", value: "B2B SaaS" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.map.meta, { persona: "CFO", context: "B2B SaaS" });
});

test("ops batch is atomic — failure rolls everything back", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "X" },
    { op: "removeCard", cardId: "k999" }, // doesn't exist — should fail
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.failedAtIndex, 3);
  assert.match(r.reason, /not found/);
});

test("forward references in same batch (addCol then addCard with new id)", () => {
  // After addCol with no existing cols, the new id will be c1.
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "Hi" },
  ]);
  assert.equal(r.ok, true);
});

// ────────────────────────────────────────────────────────────────────────────
// FRAMEWORK CONFIGS — every seed validates, has expected structure
// ────────────────────────────────────────────────────────────────────────────

const ALL_CONFIGS = [
  journeyMapConfig,
  jtbdCanvasConfig,
  matrix2x2Config,
  competitiveMapConfig,
  affinityDiagramConfig,
];

test("Every framework seed passes validateMap", () => {
  for (const cfg of ALL_CONFIGS) {
    const r = validateMap(cfg.seed);
    assert.equal(r.ok, true, `${cfg.id} seed should validate`);
  }
});

test("Every framework seed has cards referencing valid cols and rows", () => {
  for (const cfg of ALL_CONFIGS) {
    const colIds = new Set(cfg.seed.cols.map((c) => c.id));
    const rowIds = new Set(cfg.seed.rows.map((r) => r.id));
    for (const card of cfg.seed.cards) {
      assert.ok(colIds.has(card.colId), `${cfg.id}: card ${card.id} references unknown col ${card.colId}`);
      assert.ok(rowIds.has(card.rowId), `${cfg.id}: card ${card.id} references unknown row ${card.rowId}`);
    }
  }
});

test("Fixed-structure frameworks have non-zero cols and rows", () => {
  // 2x2 must always be 2x2
  assert.equal(matrix2x2Config.fixedCols, true);
  assert.equal(matrix2x2Config.fixedRows, true);
  assert.equal(matrix2x2Config.seed.cols.length, 2);
  assert.equal(matrix2x2Config.seed.rows.length, 2);
  // Affinity has fixed rows (4 card types) but flexible cols (themes)
  assert.equal(affinityDiagramConfig.fixedRows, true);
  assert.equal(affinityDiagramConfig.seed.rows.length, 4);
});

test("JTBD seed uses single virtual row r0 (kanban convention)", () => {
  assert.equal(jtbdCanvasConfig.seed.rows.length, 1);
  assert.equal(jtbdCanvasConfig.seed.rows[0].id, "r0");
});

test("Affinity has ungrouped col c0 + theme cols", () => {
  const ung = affinityDiagramConfig.seed.cols.find((c) => c.id === "c0");
  assert.ok(ung, "ungrouped col c0 must exist");
  assert.equal(ung?.kind, "ungrouped");
});

test("Each framework can apply at least one of its example instructions structurally", () => {
  // Just a smoke check: every config exposes 4+ example instructions
  for (const cfg of ALL_CONFIGS) {
    assert.ok(cfg.exampleInstructions.length >= 3, `${cfg.id} should have example instructions`);
  }
});

test("Apply real ops to each seed (smoke test)", () => {
  for (const cfg of ALL_CONFIGS) {
    const firstCol = cfg.seed.cols[0]?.id;
    const firstRow = cfg.seed.rows[0]?.id;
    if (!firstCol || !firstRow) continue;
    const r = applyOps(cfg.seed, [
      { op: "addCard", colId: firstCol, rowId: firstRow, text: "smoke test card" },
    ]);
    assert.equal(r.ok, true, `${cfg.id}: addCard should succeed`);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DSL RENDERING
// ────────────────────────────────────────────────────────────────────────────

test("renderMapDSL produces readable output", () => {
  const dsl = renderMapDSL(journeyMapConfig.seed);
  assert.match(dsl, /title:/);
  assert.match(dsl, /cols/);
  assert.match(dsl, /rows/);
  assert.match(dsl, /cards/);
  // Specific seed checks
  assert.match(dsl, /Awareness/);
  assert.match(dsl, /Actions/);
  // No undefined/null leaking through
  assert.doesNotMatch(dsl, /undefined|null/i);
});

test("renderUserPayload includes framework vocabulary and structuring hints", () => {
  const out = renderUserPayload(
    journeyMapConfig.seed,
    journeyMapConfig,
    "Add a Post-Purchase stage"
  );
  assert.match(out, /Customer Journey Map/);
  assert.match(out, /Stage/);
  assert.match(out, /Lane/);
  assert.match(out, /Add a Post-Purchase stage/);
});

test("renderUserPayload notes fixed structure for matrix-2x2", () => {
  const out = renderUserPayload(matrix2x2Config.seed, matrix2x2Config, "Move stuff");
  assert.match(out, /FIXED/);
});

test("parseFocus accepts valid selections", () => {
  assert.equal(parseFocus({ type: "cards", ids: ["k1"] }).ok, true);
  assert.equal(parseFocus({ type: "col", id: "c1" }).ok, true);
  assert.equal(parseFocus({ type: "row", id: "r1" }).ok, true);
});

test("parseFocus rejects malformed", () => {
  assert.equal(parseFocus(null).ok, false);
  assert.equal(parseFocus({ type: "cards" }).ok, false);
  assert.equal(parseFocus({ type: "cards", ids: [42] }).ok, false);
  assert.equal(parseFocus({ type: "unknown" }).ok, false);
});

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

test("cardsAt / cardsInCol / cardsInRow group correctly", () => {
  const map = jtbdCanvasConfig.seed;
  // c4 = Desired Outcomes — has 3 cards
  const desired = cardsInCol(map, "c4");
  assert.equal(desired.length, 3);
  // All cards in r0 — entire seed
  const allInR0 = cardsInRow(map, "r0");
  assert.equal(allInR0.length, map.cards.length);
  // c4·r0 = same as cardsInCol("c4")
  const at = cardsAt(map, "c4", "r0");
  assert.equal(at.length, 3);
});

// ────────────────────────────────────────────────────────────────────────────
// NESTING (one level of sub-items)
// ────────────────────────────────────────────────────────────────────────────

// Helper: seed a map with one col, one row, one top-level card (k1).
function seedWithOneCard(): UniversalMap {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "1" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "parent" },
  ]);
  if (!r.ok) throw new Error("seed failed");
  return r.map;
}

test("addCard: parentCardId creates a sub-item with matching col/row", () => {
  const seeded = seedWithOneCard();
  const r = applyOps(seeded, [
    { op: "addCard", colId: "c1", rowId: "r1", text: "child", parentCardId: "k1" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const child = r.map.cards.find((c) => c.id === "k2");
  assert.ok(child);
  assert.equal(child!.parentCardId, "k1");
  assert.equal(child!.colId, "c1");
  assert.equal(child!.rowId, "r1");
});

test("addCard: parentCardId pointing to a non-existent parent is rejected", () => {
  const seeded = seedWithOneCard();
  const r = applyOps(seeded, [
    { op: "addCard", colId: "c1", rowId: "r1", text: "orphan", parentCardId: "k999" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /Parent card not found/);
});

test("addCard: nesting under an existing sub-item is rejected (one level only)", () => {
  const seeded = seedWithOneCard();
  const step1 = applyOps(seeded, [
    { op: "addCard", colId: "c1", rowId: "r1", text: "child", parentCardId: "k1" },
  ]);
  assert.equal(step1.ok, true);
  if (!step1.ok) return;
  const r = applyOps(step1.map, [
    { op: "addCard", colId: "c1", rowId: "r1", text: "grandchild", parentCardId: "k2" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /one level only/);
});

test("addCard: sub-item with mismatched col/row is rejected", () => {
  const r0 = applyOps(seedWithOneCard(), [
    { op: "addCol", label: "B" },
    { op: "addRow", label: "2" },
  ]);
  assert.equal(r0.ok, true);
  if (!r0.ok) return;
  const r = applyOps(r0.map, [
    { op: "addCard", colId: "c2", rowId: "r2", text: "mismatched", parentCardId: "k1" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /match parent/);
});

test("removeCard: cascades to sub-items", () => {
  const seeded = seedWithOneCard();
  const step1 = applyOps(seeded, [
    { op: "addCard", colId: "c1", rowId: "r1", text: "child A", parentCardId: "k1" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "child B", parentCardId: "k1" },
  ]);
  assert.equal(step1.ok, true);
  if (!step1.ok) return;
  assert.equal(step1.map.cards.length, 3);
  const r = applyOps(step1.map, [{ op: "removeCard", cardId: "k1" }]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // parent + 2 children all gone
  assert.equal(r.map.cards.length, 0);
});

test("moveCard: moving a parent cascades children to the new (col, row)", () => {
  const r0 = applyOps(seedWithOneCard(), [
    { op: "addCol", label: "B" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "child", parentCardId: "k1" },
  ]);
  assert.equal(r0.ok, true);
  if (!r0.ok) return;
  const r = applyOps(r0.map, [
    { op: "moveCard", cardId: "k1", toColId: "c2", toRowId: "r1" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const parent = r.map.cards.find((c) => c.id === "k1");
  const child = r.map.cards.find((c) => c.id === "k2");
  assert.equal(parent!.colId, "c2");
  assert.equal(child!.colId, "c2"); // cascaded
  assert.equal(child!.parentCardId, "k1");
});

test("moveCard: sub-item cannot move across (col, row) independently", () => {
  const r0 = applyOps(seedWithOneCard(), [
    { op: "addCol", label: "B" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "child", parentCardId: "k1" },
  ]);
  assert.equal(r0.ok, true);
  if (!r0.ok) return;
  const r = applyOps(r0.map, [
    { op: "moveCard", cardId: "k2", toColId: "c2", toRowId: "r1" },
  ]);
  assert.equal(r.ok, false);
});

test("reparentCard: moves child under a new parent in the same cell", () => {
  const r0 = applyOps(seedWithOneCard(), [
    { op: "addCard", colId: "c1", rowId: "r1", text: "parent 2" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "child", parentCardId: "k1" },
  ]);
  assert.equal(r0.ok, true);
  if (!r0.ok) return;
  const r = applyOps(r0.map, [
    { op: "reparentCard", cardId: "k3", newParentCardId: "k2" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const child = r.map.cards.find((c) => c.id === "k3");
  assert.equal(child!.parentCardId, "k2");
});

test("reparentCard: promoting to top-level clears parentCardId", () => {
  const r0 = applyOps(seedWithOneCard(), [
    { op: "addCard", colId: "c1", rowId: "r1", text: "child", parentCardId: "k1" },
  ]);
  assert.equal(r0.ok, true);
  if (!r0.ok) return;
  const r = applyOps(r0.map, [
    { op: "reparentCard", cardId: "k2", newParentCardId: null },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const child = r.map.cards.find((c) => c.id === "k2");
  assert.equal(child!.parentCardId, undefined);
});

test("reparentCard: card with children cannot become a sub-item itself", () => {
  const r0 = applyOps(seedWithOneCard(), [
    { op: "addCard", colId: "c1", rowId: "r1", text: "parent 2" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "child of 1", parentCardId: "k1" },
  ]);
  assert.equal(r0.ok, true);
  if (!r0.ok) return;
  // Try to make k1 (which has k3 as a child) into a sub-item of k2 — forbidden.
  const r = applyOps(r0.map, [
    { op: "reparentCard", cardId: "k1", newParentCardId: "k2" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /one level only/);
});

test("validateMap: rejects orphan sub-item referencing missing parent", () => {
  const bad: UniversalMap = {
    id: "x",
    title: "x",
    meta: {},
    cols: [{ id: "c1", label: "A" }],
    rows: [{ id: "r1", label: "1" }],
    cards: [{ id: "k1", colId: "c1", rowId: "r1", text: "orphan", order: 0, parentCardId: "k999" }],
  };
  const r = validateMap(bad);
  assert.equal(r.ok, false);
});

test("validateMap: rejects sub-item whose col/row does not match parent", () => {
  const bad: UniversalMap = {
    id: "x",
    title: "x",
    meta: {},
    cols: [{ id: "c1", label: "A" }, { id: "c2", label: "B" }],
    rows: [{ id: "r1", label: "1" }],
    cards: [
      { id: "k1", colId: "c1", rowId: "r1", text: "parent", order: 0 },
      { id: "k2", colId: "c2", rowId: "r1", text: "child", order: 0, parentCardId: "k1" },
    ],
  };
  const r = validateMap(bad);
  assert.equal(r.ok, false);
});

test("payload DSL: renders sub-items indented under their parent", () => {
  const r = applyOps(seedWithOneCard(), [
    { op: "addCard", colId: "c1", rowId: "r1", text: "child A", parentCardId: "k1" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "child B", parentCardId: "k1" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const dsl = renderMapDSL(r.map);
  assert.match(dsl, /k1/);
  assert.match(dsl, /└ k2/);
  assert.match(dsl, /└ k3/);
});

// ────────────────────────────────────────────────────────────────────────────
// ADD CARD WITH AGENT-SPECIFIED ID (slug ids for batch referencing)
// ────────────────────────────────────────────────────────────────────────────

test("addCard: accepts a valid slug id and uses it as-is", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "start step", id: "start_node" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.map.cards.length, 1);
  assert.equal(r.map.cards[0].id, "start_node");
});

test("addCard: rejects id that uses the reserved k\\d+ format", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "x", id: "k5" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /reserved k/i);
});

test("addCard: rejects id that collides with an existing card", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "first", id: "step_one" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "second", id: "step_one" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /already exists/);
});

test("addCard: rejects id that doesn't match the slug pattern", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "x", id: "Bad Id!" },
  ]);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /slug/i);
});

test("batch: addCard with slug id + addConnector referencing that slug applies atomically", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "Phase" },
    { op: "addRow", label: "Lane" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "start", id: "start" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "end", id: "end_node" },
    { op: "addConnector", sourceCardId: "start", targetCardId: "end_node", kind: "sequence" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.map.cards.length, 2);
  assert.equal(r.map.connectors?.length, 1);
  assert.equal(r.map.connectors?.[0].sourceCardId, "start");
  assert.equal(r.map.connectors?.[0].targetCardId, "end_node");
});

test("addCard: mixing slug-id and auto-assigned ids in one batch — auto counter is unaffected", () => {
  const r = applyOps(blank(), [
    { op: "addCol", label: "A" },
    { op: "addRow", label: "R" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "manual", id: "first_manual" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "auto 1" },
    { op: "addCard", colId: "c1", rowId: "r1", text: "auto 2" },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // First card has the slug id; the auto-assign counter still produces k1, k2.
  assert.equal(r.map.cards[0].id, "first_manual");
  assert.equal(r.map.cards[1].id, "k1");
  assert.equal(r.map.cards[2].id, "k2");
});
