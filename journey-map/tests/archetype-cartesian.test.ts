import { test } from "node:test";
import { strict as assert } from "node:assert";
import { cartesianArchetype } from "../lib/archetypes/cartesian/archetype";
import {
  buildCartesianToolSchema,
  validateCartesianDoc,
  type CartesianDoc,
} from "../lib/archetypes/cartesian/schema";

function baseDoc(overrides: Partial<CartesianDoc> = {}): CartesianDoc {
  return {
    id: "c1",
    title: "Priority matrix",
    xAxis: { label: "Effort", min: 0, max: 10, lowAnchor: "low", highAnchor: "high" },
    yAxis: { label: "Impact", min: 0, max: 10 },
    quadrants: [
      { id: "q1", location: "lh", label: "Quick wins" },
      { id: "q2", location: "hh", label: "Big bets" },
      { id: "q3", location: "ll", label: "Time sinks" },
      { id: "q4", location: "hl", label: "Fill-ins" },
    ],
    categories: [
      { id: "k1", label: "Growth", color: "4f46e5" },
      { id: "k2", label: "Reliability" },
    ],
    points: [
      { id: "p1", label: "Feature A", x: 2, y: 8, categoryId: "k1" },
      { id: "p2", label: "Feature B", x: 8, y: 9, size: 6 },
      { id: "p3", label: "Feature C", x: 1, y: 2 },
    ],
    ...overrides,
  };
}

test("cartesian archetype identity", () => {
  assert.equal(cartesianArchetype.id, "cartesian");
});

test("validator accepts a well-formed plot", () => {
  const r = validateCartesianDoc(baseDoc());
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("validator rejects point outside xAxis range", () => {
  const doc = baseDoc();
  doc.points[0] = { id: "p1", label: "A", x: 99, y: 5 };
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /xAxis range/);
});

test("validator rejects point outside yAxis range", () => {
  const doc = baseDoc();
  doc.points[0] = { id: "p1", label: "A", x: 5, y: -1 };
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /yAxis range/);
});

test("validator rejects axis max <= min", () => {
  const doc = baseDoc();
  doc.xAxis = { label: "x", min: 10, max: 0 };
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects duplicate quadrant location", () => {
  const doc = baseDoc();
  doc.quadrants = [
    { id: "q1", location: "hh", label: "A" },
    { id: "q2", location: "hh", label: "B" },
  ];
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /used twice/);
});

test("validator rejects point referencing unknown category", () => {
  const doc = baseDoc();
  doc.points[0] = { id: "p1", label: "A", x: 5, y: 5, categoryId: "kZ" };
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects bad category color", () => {
  const doc = baseDoc();
  doc.categories![0].color = "#invalidhex";
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /hex/);
});

test("validator rejects duplicate point labels", () => {
  const doc = baseDoc();
  doc.points = [
    { id: "p1", label: "Alpha", x: 1, y: 1 },
    { id: "p2", label: "alpha", x: 2, y: 2 },
  ];
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /duplicate point label/i);
});

test("validator rejects bad point id pattern", () => {
  const doc = baseDoc();
  doc.points = [{ id: "point1", label: "A", x: 1, y: 1 }];
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects size outside [0, 10]", () => {
  const doc = baseDoc();
  doc.points[0] = { id: "p1", label: "A", x: 5, y: 5, size: 11 };
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, false);
});

test("validator accepts doc without quadrants or categories", () => {
  const doc = baseDoc({ quadrants: undefined, categories: undefined });
  delete doc.points[0].categoryId;
  const r = validateCartesianDoc(doc);
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("cartesian tool schema enforces id patterns", () => {
  const qs = buildCartesianToolSchema.properties.quadrants.items.properties.id
    .pattern;
  const ks = buildCartesianToolSchema.properties.categories.items.properties.id
    .pattern;
  const ps = buildCartesianToolSchema.properties.points.items.properties.id
    .pattern;
  assert.equal(qs, "^q[1-4]$");
  assert.equal(ks, "^k\\d+$");
  assert.equal(ps, "^p\\d+$");
});

test("cartesian library captures quadrant vocabulary", () => {
  const hints = cartesianArchetype.library.selectionHints
    .join(" ")
    .toLowerCase();
  assert.match(hints, /quadrant|2x2|priority|impact|effort|magic/);
});

test("cartesian library example intents cover prioritization + landscape + roadmap", () => {
  const examples = cartesianArchetype.library.exampleIntents.join(" ").toLowerCase();
  assert.match(examples, /effort|impact|prioritization/);
  assert.match(examples, /landscape|magic|quadrant/);
  assert.match(examples, /roadmap|horizon|quarter/);
});
