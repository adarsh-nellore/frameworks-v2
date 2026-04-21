import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tableArchetype } from "../lib/archetypes/table/archetype";
import { buildTableToolSchema } from "../lib/archetypes/table/schema";

test("table archetype has expected identity", () => {
  assert.equal(tableArchetype.id, "table");
  assert.equal(typeof tableArchetype.Component, "function");
  assert.equal(typeof tableArchetype.pipeline, "function");
});

test("build_table tool schema enforces column id pattern", () => {
  const colSchema = buildTableToolSchema.properties.columns.items;
  assert.equal(colSchema.properties.id.pattern, "^c\\d+$");
});

test("build_table tool schema enforces row id pattern", () => {
  const rowSchema = buildTableToolSchema.properties.rows.items;
  assert.equal(rowSchema.properties.id.pattern, "^r\\d+$");
});

test("build_table tool schema lists allowed column types", () => {
  const colSchema = buildTableToolSchema.properties.columns.items;
  assert.deepEqual(
    [...colSchema.properties.type.enum].sort(),
    ["date", "enum", "number", "text"]
  );
});

test("table archetype.validateDoc rejects garbage", () => {
  assert.equal(tableArchetype.validateDoc(null).ok, false);
  assert.equal(tableArchetype.validateDoc({ hello: 1 }).ok, false);
});

test("table archetype library hints target tabular intents", () => {
  const hints = tableArchetype.library.selectionHints.join(" ").toLowerCase();
  assert.match(hints, /table|spreadsheet|list|roster|inventory|csv/);
});

test("table library anti-hints name other archetypes", () => {
  const anti = tableArchetype.library.antiHints ?? [];
  const joined = anti.join(" ").toLowerCase();
  assert.match(joined, /journey/);
  assert.match(joined, /competitive/);
  assert.match(joined, /cartesian/);
  assert.match(joined, /process/);
});
