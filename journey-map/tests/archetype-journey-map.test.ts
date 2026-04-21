import { test } from "node:test";
import { strict as assert } from "node:assert";
import { journeyMapArchetype } from "../lib/archetypes/journey-map/archetype";
import { seed } from "../lib/archetypes/journey-map/seed";
import { validateMap } from "../lib/archetypes/journey-map/schema";
import type { JourneyMap } from "../lib/archetypes/journey-map/types";

test("journey-map archetype has expected identity", () => {
  assert.equal(journeyMapArchetype.id, "journey-map");
  assert.equal(typeof journeyMapArchetype.label, "string");
  assert.equal(typeof journeyMapArchetype.pipeline, "function");
  assert.equal(typeof journeyMapArchetype.Component, "function");
});

test("journey-map seed round-trips through validateMap", () => {
  const r = validateMap(seed);
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("journey-map archetype.validateDoc accepts seed", () => {
  const r = journeyMapArchetype.validateDoc(seed);
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("journey-map archetype.validateDoc rejects missing stages", () => {
  const doc: JourneyMap = {
    id: "m1",
    title: "t",
    persona: "",
    stages: [],
    rows: [{ id: "r1", label: "Actions", kind: "actions" }],
    cells: [],
  };
  const r = journeyMapArchetype.validateDoc(doc);
  assert.equal(r.ok, false);
});

test("journey-map archetype.validateDoc rejects cell referencing unknown stage", () => {
  const doc: JourneyMap = {
    id: "m1",
    title: "t",
    persona: "",
    stages: [{ id: "s1", label: "A" }],
    rows: [{ id: "r1", label: "Actions", kind: "actions" }],
    cells: [{ id: "x1", stageId: "sZ", rowId: "r1", text: "bogus" }],
  };
  const r = journeyMapArchetype.validateDoc(doc);
  assert.equal(r.ok, false);
});

test("journey-map library has recognizable signal words", () => {
  const text = journeyMapArchetype.library.selectionHints.join(" ").toLowerCase();
  assert.match(text, /journey/);
  assert.ok(text.includes("persona") || text.includes("stage"));
});

test("journey-map library anti-hints point away from other archetypes", () => {
  const anti = journeyMapArchetype.library.antiHints ?? [];
  const joined = anti.join(" ").toLowerCase();
  assert.match(joined, /competitive|table|cartesian|process/);
});
