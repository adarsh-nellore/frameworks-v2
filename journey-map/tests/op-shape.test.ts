import test from "node:test";
import assert from "node:assert/strict";
import { validateOpShape } from "@/lib/frameworks/journey-map/ops";

test("validateOpShape accepts well-formed ops", () => {
  assert.equal(
    validateOpShape({ op: "moveRow", rowId: "r1", toIndex: 0 }),
    true
  );
  assert.equal(
    validateOpShape({ op: "moveStage", stageId: "s2", toIndex: 1 }),
    true
  );
  assert.equal(
    validateOpShape({
      op: "swapCells",
      aCellId: "x",
      bCellId: "y",
    }),
    true
  );
  assert.equal(
    validateOpShape({
      op: "moveBlock",
      anchorCardId: "x",
      cardIds: ["x", "y"],
      toRowId: "r2",
      toIndex: 1,
    }),
    true
  );
  assert.equal(
    validateOpShape({ op: "setCellText", cellId: "x", text: "hi" }),
    true
  );
  assert.equal(
    validateOpShape({ op: "renameRow", rowId: "r1", label: "X" }),
    true
  );
  assert.equal(
    validateOpShape({ op: "renameStage", stageId: "s1", label: "X" }),
    true
  );
  assert.equal(
    validateOpShape({ op: "addRow", label: "X", kind: "actions" }),
    true
  );
  assert.equal(validateOpShape({ op: "addStage", label: "X" }), true);
  assert.equal(validateOpShape({ op: "removeRow", rowId: "r1" }), true);
  assert.equal(validateOpShape({ op: "removeStage", stageId: "s1" }), true);
  assert.equal(
    validateOpShape({
      op: "moveCell",
      cellId: "c1",
      toRowId: "r1",
      toStageId: "s1",
    }),
    true
  );
  assert.equal(
    validateOpShape({ op: "createCell", rowId: "r1", stageId: "s1" }),
    true
  );
  assert.equal(
    validateOpShape({
      op: "createCell",
      rowId: "r1",
      stageId: "s1",
      text: "hello",
    }),
    true
  );
  assert.equal(validateOpShape({ op: "removeCell", cellId: "c1" }), true);
});

test("validateOpShape rejects malformed ops", () => {
  assert.equal(validateOpShape(null), false);
  assert.equal(validateOpShape({}), false);
  assert.equal(validateOpShape({ op: "unknown" }), false);
  assert.equal(validateOpShape({ op: "moveRow" }), false); // missing fields
  assert.equal(
    validateOpShape({ op: "moveRow", rowId: 5, toIndex: 0 }), // wrong type
    false
  );
  assert.equal(
    validateOpShape({
      op: "moveBlock",
      anchorCardId: "x",
      cardIds: "not-an-array",
      toRowId: "r2",
      toIndex: 0,
    }),
    false
  );
});
