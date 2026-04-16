import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validateFrameworkConfig } from "../lib/frameworks/custom/validate";

// Minimal valid inputs used across tests. Each test overrides a subset.
function baseGrid() {
  return {
    id: "custom-grid-demo",
    label: "Demo Grid",
    layout: "grid",
    colNoun: "Column",
    rowNoun: "Row",
    cardNoun: "Card",
    structuringPrompt:
      "A demo grid framework. Cols group things by an axis and rows group them by another. Cards are items placed in the relevant cell.",
    exampleInstructions: ["Add a new col called X", "Move items from col A to col B"],
    seed: {
      id: "custom-grid-demo-seed",
      title: "Demo Grid",
      meta: {},
      cols: [
        { id: "c1", label: "Col A" },
        { id: "c2", label: "Col B" },
      ],
      rows: [
        { id: "r1", label: "Row 1" },
        { id: "r2", label: "Row 2" },
      ],
      cards: [],
    },
  };
}

function baseMatrix() {
  return {
    ...baseGrid(),
    id: "custom-matrix-demo",
    label: "Demo Matrix",
    layout: "matrix",
    fixedCols: true,
    fixedRows: true,
  };
}

function baseKanban() {
  return {
    ...baseGrid(),
    id: "custom-kanban-demo",
    label: "Demo Kanban",
    layout: "kanban",
    seed: {
      ...baseGrid().seed,
      rows: [{ id: "r1", label: "Items" }],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Happy paths
// ──────────────────────────────────────────────────────────────────────────────

test("validateFrameworkConfig: happy path — grid", () => {
  const r = validateFrameworkConfig(baseGrid());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.layout, "grid");
  assert.equal(r.config.id, "custom-grid-demo");
  assert.equal(r.config.seed.cols.length, 2);
});

test("validateFrameworkConfig: happy path — matrix forces fixed + dimensions", () => {
  const r = validateFrameworkConfig(baseMatrix());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.layout, "matrix");
  assert.equal(r.config.fixedCols, true);
  assert.equal(r.config.fixedRows, true);
});

test("validateFrameworkConfig: happy path — kanban forces fixedRows true, 1 row", () => {
  const r = validateFrameworkConfig(baseKanban());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.fixedRows, true);
  assert.equal(r.config.seed.rows.length, 1);
});

// ──────────────────────────────────────────────────────────────────────────────
// Layout-specific rules
// ──────────────────────────────────────────────────────────────────────────────

test("matrix without fixedCols+fixedRows is rejected", () => {
  const r = validateFrameworkConfig({ ...baseMatrix(), fixedCols: false });
  assert.equal(r.ok, false);
});

test("matrix smaller than 2x2 is rejected", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    seed: {
      ...baseMatrix().seed,
      rows: [{ id: "r1", label: "only row" }],
    },
  });
  assert.equal(r.ok, false);
});

test("kanban with more than 1 row is rejected", () => {
  const r = validateFrameworkConfig({
    ...baseKanban(),
    seed: {
      ...baseKanban().seed,
      rows: [
        { id: "r1", label: "A" },
        { id: "r2", label: "B" },
      ],
    },
  });
  assert.equal(r.ok, false);
});

// ──────────────────────────────────────────────────────────────────────────────
// id pattern + collision
// ──────────────────────────────────────────────────────────────────────────────

test("rejects non-custom id pattern", () => {
  const r = validateFrameworkConfig({ ...baseGrid(), id: "my-framework" });
  assert.equal(r.ok, false);
});

test("auto-suffixes id on collision with existing ids", () => {
  const r = validateFrameworkConfig(baseGrid(), new Set(["custom-grid-demo"]));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.match(r.config.id, /^custom-grid-demo-2$/);
});

test("auto-suffixes id incrementally when -2 is also taken", () => {
  const r = validateFrameworkConfig(
    baseGrid(),
    new Set(["custom-grid-demo", "custom-grid-demo-2", "custom-grid-demo-3"])
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.match(r.config.id, /^custom-grid-demo-4$/);
});

// ──────────────────────────────────────────────────────────────────────────────
// structuringPrompt
// ──────────────────────────────────────────────────────────────────────────────

test("rejects structuringPrompt that mentions op names", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    structuringPrompt:
      "A framework where you use addCard with parentCardId to create sub-items under each theme column.",
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /op names/);
});

test("rejects structuringPrompt that is too short", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    structuringPrompt: "too short",
  });
  assert.equal(r.ok, false);
});

// ──────────────────────────────────────────────────────────────────────────────
// Seed
// ──────────────────────────────────────────────────────────────────────────────

test("rejects seed with non-empty cards", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    seed: {
      ...baseGrid().seed,
      cards: [
        { id: "k1", colId: "c1", rowId: "r1", text: "early content", order: 0 },
      ],
    },
  });
  assert.equal(r.ok, false);
});

test("re-ids malformed col ids to cN sequence", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    seed: {
      ...baseGrid().seed,
      cols: [
        { id: "wonky-id", label: "Col A" },
        { id: "another-bad", label: "Col B" },
      ],
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(
    r.config.seed.cols.map((c) => c.id),
    ["c1", "c2"]
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// Strips / ignores unknown fields
// ──────────────────────────────────────────────────────────────────────────────

test("unknown top-level fields are dropped silently", () => {
  const raw = {
    ...baseGrid(),
    color: "hotpink",
    icon: "🔥",
    rendererVersion: 99,
  } as Record<string, unknown>;
  const r = validateFrameworkConfig(raw);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const cfg = r.config as unknown as Record<string, unknown>;
  assert.equal(cfg.color, undefined);
  assert.equal(cfg.icon, undefined);
  assert.equal(cfg.rendererVersion, undefined);
});

// ──────────────────────────────────────────────────────────────────────────────
// exampleInstructions
// ──────────────────────────────────────────────────────────────────────────────

test("rejects fewer than 2 exampleInstructions", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    exampleInstructions: ["only one"],
  });
  assert.equal(r.ok, false);
});

test("caps exampleInstructions at 5 items and truncates each to 120 chars", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    exampleInstructions: [
      "a".repeat(200),
      "b".repeat(130),
      "c",
      "d",
      "e",
      "f — this one should be dropped",
      "g — this one should be dropped",
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.exampleInstructions.length, 5);
  assert.equal(r.config.exampleInstructions[0].length, 120);
});
