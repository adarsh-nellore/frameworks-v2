import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildClassifierPrompt,
  classifyIntent,
  DEFAULT_THRESHOLD,
} from "../lib/archetypes/classifier";
import { listArchetypes } from "../lib/archetypes";

test("DEFAULT_THRESHOLD is 0.7", () => {
  assert.equal(DEFAULT_THRESHOLD, 0.7);
});

test("classifyIntent short-circuits to fallback when archetype list is empty", async () => {
  const result = await classifyIntent("anything at all", 0.7, []);
  assert.equal(result.kind, "fallback");
  if (result.kind === "fallback") {
    assert.deepEqual(result.scores, []);
  }
});

test("buildClassifierPrompt embeds every archetype's id, label, and hints", () => {
  const archetypes = listArchetypes();
  const prompt = buildClassifierPrompt(archetypes);
  for (const a of archetypes) {
    assert.ok(
      prompt.includes(`id: ${a.id}`),
      `prompt missing id marker for ${a.id}`
    );
    assert.ok(prompt.includes(a.label), `prompt missing label for ${a.id}`);
    for (const hint of a.library.selectionHints) {
      assert.ok(
        prompt.includes(hint),
        `prompt missing selection hint "${hint.slice(0, 40)}..."`
      );
    }
    for (const ex of a.library.exampleIntents) {
      assert.ok(
        prompt.includes(ex),
        `prompt missing example intent "${ex.slice(0, 40)}..."`
      );
    }
  }
});

test("buildClassifierPrompt includes scoring-guidance anchors", () => {
  const prompt = buildClassifierPrompt(listArchetypes());
  assert.match(prompt, /0\.90/);
  assert.match(prompt, /0\.70/);
  assert.match(prompt, /intent classifier/i);
  assert.match(prompt, /archetype_scores/);
});

test("buildClassifierPrompt surfaces anti-hints when present", () => {
  const archetypes = listArchetypes();
  const withAnti = archetypes.find((a) => a.library.antiHints?.length);
  assert.ok(withAnti, "expected at least one archetype with anti-hints");
  const prompt = buildClassifierPrompt([withAnti!]);
  assert.match(prompt, /DO NOT pick when/);
});
