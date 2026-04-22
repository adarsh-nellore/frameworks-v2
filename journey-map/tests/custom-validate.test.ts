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

test("matrix with missing fixedCols/fixedRows is coerced to fixed (not rejected)", () => {
  // Agents often forget to set both flags when patterning after competitive-map
  // (a built-in matrix config that uses dynamic rows/cols). Matrix is
  // semantically a fixed dense grid in this codebase, so we coerce rather
  // than reject — same forgiveness kanban gets when >1 row is proposed.
  const { fixedCols: _fc, fixedRows: _fr, ...noFlags } = baseMatrix();
  void _fc;
  void _fr;
  const r = validateFrameworkConfig(noFlags);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.fixedCols, true);
  assert.equal(r.config.fixedRows, true);
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

test("kanban with more than 1 row is coerced to grid (not rejected)", () => {
  // The validator forgives kanban-with-multiple-rows by coercing to grid —
  // the user doesn't care which renderer is used, they want their framework.
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
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.layout, "grid");
});

// ──────────────────────────────────────────────────────────────────────────────
// id pattern + collision
// ──────────────────────────────────────────────────────────────────────────────

test("non-custom id prefix is normalized (prepended with custom-)", () => {
  // normalizeFrameworkId is intentionally forgiving — it repairs agent-emitted
  // ids rather than rejecting. A bare slug like "my-framework" becomes
  // "custom-my-framework" so downstream code doesn't have to case-check.
  const r = validateFrameworkConfig({ ...baseGrid(), id: "my-framework" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.id, "custom-my-framework");
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

// ──────────────────────────────────────────────────────────────────────────────
// Chrome validation — every chrome kind the tool schema advertises must round-
// trip through the validator. A kind that's in the tool schema but rejected by
// the validator is the exact failure mode that made the coordinate-cross bug
// silent: the agent would never have been able to emit it anyway.
// ──────────────────────────────────────────────────────────────────────────────

test("chrome: accepts coordinate-cross kind (no params)", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    chrome: { kind: "coordinate-cross" },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.chrome?.kind, "coordinate-cross");
});

test("chrome: accepts all chrome kinds advertised in the tool schema", () => {
  const kinds = [
    "double-diamond",
    "venn",
    "kano-curve",
    "funnel",
    "concentric",
    "coordinate-cross",
  ] as const;
  for (const kind of kinds) {
    const r = validateFrameworkConfig({
      ...baseMatrix(),
      id: `custom-chrome-${kind}`,
      chrome: { kind },
    });
    assert.equal(r.ok, true, `chrome kind "${kind}" should validate`);
    if (r.ok) assert.equal(r.config.chrome?.kind, kind);
  }
});

test("chrome: rejects unknown chrome kind with explicit error", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    chrome: { kind: "lava-lamp" },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /chrome\.kind/);
});

// ──────────────────────────────────────────────────────────────────────────────
// Adversarial battery — plausible misshapes an unconstrained agent might emit.
// Every one of these should either validate (possibly with silent coercion) or
// reject with a precise, actionable reason. No agent output should crash the
// validator, and no technically-valid-but-broken config should slip through.
// ──────────────────────────────────────────────────────────────────────────────

test("adversarial: coordinate-cross chrome on non-matrix layout is stripped, not crashed", () => {
  // If the agent misinterprets and picks kanban + coordinate-cross (an impossible
  // combination — kanban has 1 row, coordinate-cross implies 2 axes), the
  // validator should NOT reject the whole config. Strip the chrome so the user
  // still gets a usable framework.
  const r = validateFrameworkConfig({
    ...baseKanban(),
    chrome: { kind: "coordinate-cross" },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.chrome, undefined, "coordinate-cross chrome should be stripped on non-matrix layout");
  assert.equal(r.config.layout, "kanban");
});

test("adversarial: coordinate-cross chrome on grid layout is stripped, not crashed", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    chrome: { kind: "coordinate-cross" },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.chrome, undefined);
});

test("adversarial: coordinate-cross chrome on freeform layout is stripped, not crashed", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    layout: "freeform",
    chrome: { kind: "coordinate-cross" },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.chrome, undefined);
});

test("adversarial: matrix 3×3 is accepted (no hard upper bound)", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    seed: {
      ...baseMatrix().seed,
      cols: [
        { id: "c1", label: "Low" },
        { id: "c2", label: "Mid" },
        { id: "c3", label: "High" },
      ],
      rows: [
        { id: "r1", label: "High" },
        { id: "r2", label: "Mid" },
        { id: "r3", label: "Low" },
      ],
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.seed.cols.length, 3);
  assert.equal(r.config.seed.rows.length, 3);
});

test("adversarial: matrix 1×2 is rejected with a clear reason", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    seed: {
      ...baseMatrix().seed,
      cols: [{ id: "c1", label: "only col" }],
    },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /at least 2 cols and 2 rows/);
});

test("adversarial: fixedCols as string \"true\" is treated as missing (coerced for matrix)", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    fixedCols: "true" as unknown as boolean,
    fixedRows: "true" as unknown as boolean,
  });
  // Matrix coerces missing/non-boolean fixed flags to true — same result.
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.fixedCols, true);
  assert.equal(r.config.fixedRows, true);
});

test("adversarial: chrome: null is treated as no chrome (not an error)", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    chrome: null as unknown as undefined,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.chrome, undefined);
});

test("adversarial: chrome: {} (no kind) is rejected with explicit reason", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    chrome: {} as unknown as { kind: string },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /chrome\.kind/);
});

test("adversarial: chrome with extra properties is tolerated (extras dropped)", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    chrome: {
      kind: "coordinate-cross",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nonsense: "should be ignored",
      opacity: 0.5,
    } as any,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.chrome?.kind, "coordinate-cross");
  // Extras should not survive on the parsed chrome object.
  const ch = r.config.chrome as unknown as Record<string, unknown>;
  assert.equal(ch.nonsense, undefined);
  assert.equal(ch.opacity, undefined);
});

test("adversarial: connectors on a matrix layout is allowed (opt-in per framework)", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    connectors: { enabled: true, defaultRouting: "orthogonal" },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.connectors?.enabled, true);
});

test("adversarial: seed with duplicate col ids is re-sequenced", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    seed: {
      ...baseGrid().seed,
      cols: [
        { id: "c1", label: "Col A" },
        { id: "c1", label: "Col B" }, // duplicate id
      ],
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Dedup should renumber the second one so both ids are unique and c-N sequenced.
  const ids = r.config.seed.cols.map((c) => c.id);
  assert.equal(new Set(ids).size, 2, "col ids must be unique after dedup");
});

test("adversarial: agent-emitted trailing whitespace and tabs in labels are trimmed", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    label: "  Demo Grid\t ",
    colNoun: " Column ",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.label, "Demo Grid");
  assert.equal(r.config.colNoun, "Column");
});

test("adversarial: heroMetaFields with empty placeholder survives validation", () => {
  // Empty placeholder isn't a user-visible bug — just renders no hint in the
  // input. Validator shouldn't choke.
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    heroMetaFields: [
      { key: "xAxisLabel", label: "X Axis", placeholder: "" },
      { key: "yAxisLabel", label: "Y Axis", placeholder: "" },
    ],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.heroMetaFields?.length, 2);
});

// ──────────────────────────────────────────────────────────────────────────────
// renderingPlan — Phase C visual layer. Coerce missing to a safe default,
// reject unknown enums, preserve well-formed plans.
// ──────────────────────────────────────────────────────────────────────────────

test("renderingPlan: accepts a well-formed horizontal-bar plan", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    renderingPlan: {
      cardOrientation: "horizontal-bar",
      spatialContinuity: "axis-continuous",
      density: "moderate",
      summary:
        "Swimlanes stack vertically; tasks render as bars along the time axis.",
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.renderingPlan?.cardOrientation, "horizontal-bar");
  assert.equal(r.config.renderingPlan?.spatialContinuity, "axis-continuous");
});

test("renderingPlan: accepts a dot + xy-continuous plan", () => {
  const r = validateFrameworkConfig({
    ...baseMatrix(),
    renderingPlan: {
      cardOrientation: "dot",
      spatialContinuity: "xy-continuous",
      density: "sparse",
      summary: "Each entity renders as a dot at continuous (x, y).",
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.renderingPlan?.cardOrientation, "dot");
});

test("renderingPlan: missing plan coerces to stacked/cell-discrete default", () => {
  const r = validateFrameworkConfig(baseGrid());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.renderingPlan?.cardOrientation, "stacked");
  assert.equal(r.config.renderingPlan?.spatialContinuity, "cell-discrete");
  assert.equal(r.config.renderingPlan?.density, "moderate");
});

test("renderingPlan: rejects unknown cardOrientation with precise reason", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    renderingPlan: {
      cardOrientation: "hologram",
      spatialContinuity: "cell-discrete",
      density: "moderate",
      summary: "whatever",
    },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /cardOrientation/);
});

test("renderingPlan: rejects unknown spatialContinuity with precise reason", () => {
  const r = validateFrameworkConfig({
    ...baseGrid(),
    renderingPlan: {
      cardOrientation: "stacked",
      spatialContinuity: "curvilinear",
      density: "moderate",
      summary: "whatever",
    },
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /spatialContinuity/);
});

test("renderingPlan: partial plan (missing summary) fills the gap from default", () => {
  // Agent omits just summary — we shouldn't reject; fall back to default summary
  // while preserving the user's chosen orientation / continuity / density.
  const r = validateFrameworkConfig({
    ...baseGrid(),
    renderingPlan: {
      cardOrientation: "horizontal-bar",
      spatialContinuity: "axis-continuous",
      density: "dense",
    },
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.renderingPlan?.cardOrientation, "horizontal-bar");
  assert.equal(r.config.renderingPlan?.spatialContinuity, "axis-continuous");
  assert.equal(r.config.renderingPlan?.density, "dense");
  assert.ok(r.config.renderingPlan?.summary.length);
});
