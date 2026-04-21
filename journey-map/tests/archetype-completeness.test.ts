import { test } from "node:test";
import { strict as assert } from "node:assert";
import { listArchetypes } from "../lib/archetypes";
import { journeyMapArchetype } from "../lib/archetypes/journey-map/archetype";
import { tableArchetype } from "../lib/archetypes/table/archetype";
import { competitiveMatrixArchetype } from "../lib/archetypes/competitive-matrix/archetype";
import { cartesianArchetype } from "../lib/archetypes/cartesian/archetype";
import { processMapArchetype } from "../lib/archetypes/process-map/archetype";

const EXPECTED_IDS = [
  "journey-map",
  "table",
  "competitive-matrix",
  "cartesian",
  "process-map",
].sort();

test("all five P1 archetypes are registered", () => {
  const ids = listArchetypes()
    .map((a) => a.id)
    .sort();
  assert.deepEqual(ids, EXPECTED_IDS);
});

test("all five P1 archetypes export their module (direct import)", () => {
  const mods = [
    journeyMapArchetype,
    tableArchetype,
    competitiveMatrixArchetype,
    cartesianArchetype,
    processMapArchetype,
  ];
  for (const m of mods) {
    assert.ok(m.id);
    assert.ok(m.label);
    assert.equal(typeof m.Component, "function");
    assert.equal(typeof m.pipeline, "function");
    assert.equal(typeof m.validateDoc, "function");
    assert.ok(m.library);
  }
});

test("every archetype library has ≥ 3 example intents", () => {
  for (const a of listArchetypes()) {
    assert.ok(
      a.library.exampleIntents.length >= 3,
      `${a.id}: fewer than 3 example intents`
    );
  }
});

test("every archetype library has ≥ 3 selection hints", () => {
  for (const a of listArchetypes()) {
    assert.ok(
      a.library.selectionHints.length >= 3,
      `${a.id}: fewer than 3 selection hints`
    );
  }
});

test("every archetype library has anti-hints that name other archetypes", () => {
  const all = listArchetypes();
  const otherIdFragments = {
    "journey-map": ["journey"],
    table: ["table", "list", "roster"],
    "competitive-matrix": ["competitive", "comparison", "matrix"],
    cartesian: ["cartesian", "plot", "axes", "quadrant"],
    "process-map": ["process", "flow"],
  };
  for (const a of all) {
    const anti = a.library.antiHints ?? [];
    assert.ok(anti.length > 0, `${a.id}: no anti-hints`);
    const joined = anti.join(" ").toLowerCase();
    for (const [otherId, fragments] of Object.entries(otherIdFragments)) {
      if (otherId === a.id) continue;
      const hit = fragments.some((f) => joined.includes(f));
      assert.ok(
        hit,
        `${a.id} anti-hints do not reference ${otherId} (expected one of ${fragments.join("|")})`
      );
    }
  }
});

test("no two archetypes share an example intent (prompt overlap signal)", () => {
  const seen = new Map<string, string>();
  for (const a of listArchetypes()) {
    for (const ex of a.library.exampleIntents) {
      const key = ex.trim().toLowerCase();
      const prior = seen.get(key);
      if (prior && prior !== a.id) {
        assert.fail(
          `Example intent "${ex}" appears in both ${prior} and ${a.id}`
        );
      }
      seen.set(key, a.id);
    }
  }
});

test("every archetype's validateDoc rejects null / empty object", () => {
  for (const a of listArchetypes()) {
    assert.equal(a.validateDoc(null).ok, false, `${a.id} accepts null`);
    assert.equal(a.validateDoc({}).ok, false, `${a.id} accepts {}`);
    assert.equal(a.validateDoc(42).ok, false, `${a.id} accepts 42`);
  }
});
