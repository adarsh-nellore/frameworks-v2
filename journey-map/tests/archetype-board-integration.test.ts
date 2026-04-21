import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Board } from "../lib/canvas/types";
import type { GenerateEvent } from "../lib/pipeline/events";
import { getArchetype, listArchetypes } from "../lib/archetypes";

// These tests pin down the seam between the SSE protocol, the Board type, and
// the archetype registry — everything the UI dispatch layer depends on.

test("Board type carries optional archetypeId", () => {
  // Structural assertion — if archetypeId is removed from Board, this no
  // longer type-checks.
  const board: Partial<Board> = {
    id: "b1",
    frameworkId: "journey-map",
    archetypeId: "table",
  };
  assert.equal(board.archetypeId, "table");
});

test("Every registered archetype id resolves via getArchetype", () => {
  for (const a of listArchetypes()) {
    const mod = getArchetype(a.id);
    assert.ok(mod, `getArchetype(${a.id}) returned undefined`);
    assert.equal(mod!.id, a.id);
  }
});

test("SSE result event type accepts archetypeId", () => {
  // Structural assertion against the event union: if archetypeId is removed
  // from the result variant this no longer compiles.
  const event: GenerateEvent = {
    phase: "result",
    summary: "built",
    map: { any: "shape" },
    archetypeId: "table",
    debug: {
      mode: "two-pass",
      sourcesCount: 1,
      opsCount: 10,
      fidelityMode: false,
      critiqueRan: false,
      revisionRan: false,
    },
  };
  assert.equal(event.phase, "result");
  if (event.phase === "result") {
    assert.equal(event.archetypeId, "table");
  }
});

test("SSE classifying event has the expected shape", () => {
  const event: GenerateEvent = {
    phase: "classifying",
    route: "archetype",
    archetypeId: "table",
    scores: [
      { id: "table", score: 0.91, rationale: "tabular list request" },
      { id: "journey-map", score: 0.12, rationale: "not a journey" },
    ],
  };
  if (event.phase === "classifying") {
    assert.equal(event.route, "archetype");
    assert.equal(event.archetypeId, "table");
    assert.equal(event.scores.length, 2);
    assert.equal(event.scores[0].score, 0.91);
  }
});

test("SSE classifying event can also signal fallback", () => {
  const event: GenerateEvent = {
    phase: "classifying",
    route: "fallback",
    scores: [],
  };
  if (event.phase === "classifying") {
    assert.equal(event.route, "fallback");
    assert.equal(event.archetypeId, undefined);
  }
});

test("Archetype IDs shipped align with classifier prompt expectations", () => {
  const ids = listArchetypes()
    .map((a) => a.id)
    .sort();
  const expected = [
    "cartesian",
    "competitive-matrix",
    "journey-map",
    "process-map",
    "table",
  ];
  assert.deepEqual(ids, expected);
});

test("Every archetype's validateDoc returns discriminated union with ok flag", () => {
  for (const a of listArchetypes()) {
    const r = a.validateDoc({});
    assert.equal(typeof r, "object");
    assert.ok("ok" in r);
    assert.equal(typeof r.ok, "boolean");
    if (!r.ok) {
      assert.equal(typeof r.reason, "string");
      assert.ok(r.reason.length > 0);
    }
  }
});

test("Archetype module Components are functions (not objects / classes)", () => {
  for (const a of listArchetypes()) {
    assert.equal(typeof a.Component, "function", `${a.id} Component not a function`);
    // React function components have a name that matches their export
    assert.ok(a.Component.name, `${a.id} Component is anonymous`);
  }
});
