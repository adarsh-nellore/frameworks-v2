import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  getArchetype,
  hasArchetypes,
  listArchetypes,
  registerArchetype,
} from "../lib/archetypes";

test("built-in archetypes are registered at import time", () => {
  assert.equal(hasArchetypes(), true);
  const list = listArchetypes();
  const ids = list.map((a) => a.id).sort();
  assert.ok(ids.includes("journey-map"), "journey-map must be registered");
  assert.ok(ids.includes("table"), "table must be registered");
});

test("getArchetype returns the module by id", () => {
  const jm = getArchetype("journey-map");
  assert.ok(jm, "journey-map lookup failed");
  assert.equal(jm!.id, "journey-map");
  const t = getArchetype("table");
  assert.ok(t);
  assert.equal(t!.id, "table");
});

test("getArchetype returns undefined for unknown id", () => {
  assert.equal(getArchetype("never-registered"), undefined);
});

test("registerArchetype rejects duplicate id", () => {
  const existing = getArchetype("journey-map")!;
  assert.throws(() => registerArchetype(existing), /already registered/);
});

test("every archetype module has the full contract surface", () => {
  for (const a of listArchetypes()) {
    assert.equal(typeof a.id, "string", `${a.id} missing id string`);
    assert.equal(typeof a.label, "string", `${a.id} missing label`);
    assert.equal(typeof a.pipeline, "function", `${a.id} missing pipeline`);
    assert.equal(typeof a.Component, "function", `${a.id} missing Component`);
    assert.equal(
      typeof a.validateDoc,
      "function",
      `${a.id} missing validateDoc`
    );
    assert.ok(a.library, `${a.id} missing library`);
    assert.equal(typeof a.library.purpose, "string");
    assert.ok(Array.isArray(a.library.selectionHints));
    assert.ok(a.library.selectionHints.length > 0, `${a.id} has no selectionHints`);
    assert.ok(Array.isArray(a.library.exampleIntents));
    assert.ok(
      a.library.exampleIntents.length >= 3,
      `${a.id} has < 3 exampleIntents`
    );
  }
});

test("no two archetypes share the same id", () => {
  const ids = listArchetypes().map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("no two archetypes share the same label", () => {
  const labels = listArchetypes().map((a) => a.label);
  assert.equal(new Set(labels).size, labels.length);
});
