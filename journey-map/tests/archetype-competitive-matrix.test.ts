import { test } from "node:test";
import { strict as assert } from "node:assert";
import { competitiveMatrixArchetype } from "../lib/archetypes/competitive-matrix/archetype";
import {
  buildMatrixToolSchema,
  validateCompetitiveMatrixDoc,
  type CompetitiveMatrixDoc,
} from "../lib/archetypes/competitive-matrix/schema";

function baseDoc(
  overrides: Partial<CompetitiveMatrixDoc> = {}
): CompetitiveMatrixDoc {
  return {
    id: "cm1",
    title: "CRMs",
    subject: "Q1 2026",
    competitors: [
      { id: "r1", label: "Acme CRM" },
      { id: "r2", label: "Beta CRM", tagline: "challenger" },
    ],
    capabilities: [
      { id: "c1", label: "SSO", kind: "presence" },
      { id: "c2", label: "Dev Experience", kind: "score", maxScore: 5 },
      { id: "c3", label: "Pricing Model", kind: "text" },
    ],
    cells: [
      { competitorId: "r1", capabilityId: "c1", value: "yes" },
      { competitorId: "r1", capabilityId: "c2", value: 4 },
      { competitorId: "r1", capabilityId: "c3", value: "per-seat" },
      { competitorId: "r2", capabilityId: "c1", value: "partial", note: "via SCIM" },
      { competitorId: "r2", capabilityId: "c2", value: 3 },
      { competitorId: "r2", capabilityId: "c3", value: null },
    ],
    ...overrides,
  };
}

test("competitive-matrix archetype identity", () => {
  assert.equal(competitiveMatrixArchetype.id, "competitive-matrix");
  assert.equal(typeof competitiveMatrixArchetype.pipeline, "function");
  assert.equal(typeof competitiveMatrixArchetype.Component, "function");
});

test("validator accepts a well-formed doc", () => {
  const r = validateCompetitiveMatrixDoc(baseDoc());
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("validator rejects score out of range", () => {
  const doc = baseDoc();
  doc.cells[1] = { competitorId: "r1", capabilityId: "c2", value: 9 };
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /out of range/);
});

test("validator rejects negative score", () => {
  const doc = baseDoc();
  doc.cells[1] = { competitorId: "r1", capabilityId: "c2", value: -1 };
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects score capability without maxScore", () => {
  const doc = baseDoc({
    capabilities: [{ id: "c1", label: "X", kind: "score" }],
    cells: [],
  });
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /maxScore/);
});

test("validator rejects presence capability with maxScore", () => {
  const doc = baseDoc({
    capabilities: [{ id: "c1", label: "X", kind: "presence", maxScore: 5 }],
    cells: [],
  });
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /must not include maxScore/);
});

test("validator rejects unknown presence value", () => {
  const doc = baseDoc();
  doc.cells[0] = { competitorId: "r1", capabilityId: "c1", value: "maybe" };
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects duplicate cell at same (competitor, capability)", () => {
  const doc = baseDoc();
  doc.cells.push({ competitorId: "r1", capabilityId: "c1", value: "no" });
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /duplicate cell/);
});

test("validator rejects cell referencing unknown competitor", () => {
  const doc = baseDoc();
  doc.cells[0] = { competitorId: "rZ", capabilityId: "c1", value: "yes" };
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects cell referencing unknown capability", () => {
  const doc = baseDoc();
  doc.cells[0] = { competitorId: "r1", capabilityId: "cZ", value: "yes" };
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
});

test("validator rejects duplicate competitor labels (case-insensitive)", () => {
  const doc = baseDoc({
    competitors: [
      { id: "r1", label: "Acme" },
      { id: "r2", label: "ACME" },
    ],
    cells: [],
  });
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /duplicate competitor label/i);
});

test("validator rejects bad id patterns", () => {
  const badCompId = baseDoc({
    competitors: [
      { id: "comp1", label: "A" },
      { id: "r2", label: "B" },
    ],
    cells: [],
  });
  assert.equal(validateCompetitiveMatrixDoc(badCompId).ok, false);

  const badCapId = baseDoc({
    capabilities: [{ id: "cap1", label: "X", kind: "presence" }],
    cells: [],
  });
  assert.equal(validateCompetitiveMatrixDoc(badCapId).ok, false);
});

test("validator accepts null cell values across all kinds", () => {
  const doc = baseDoc({
    cells: [
      { competitorId: "r1", capabilityId: "c1", value: null },
      { competitorId: "r1", capabilityId: "c2", value: null },
      { competitorId: "r1", capabilityId: "c3", value: null },
    ],
  });
  const r = validateCompetitiveMatrixDoc(doc);
  assert.equal(r.ok, true, r.ok ? "" : r.reason);
});

test("build_competitive_matrix tool schema enforces id patterns", () => {
  const comp = buildMatrixToolSchema.properties.competitors.items;
  const cap = buildMatrixToolSchema.properties.capabilities.items;
  const cell = buildMatrixToolSchema.properties.cells.items;
  assert.equal(comp.properties.id.pattern, "^r\\d+$");
  assert.equal(cap.properties.id.pattern, "^c\\d+$");
  assert.equal(cell.properties.competitorId.pattern, "^r\\d+$");
  assert.equal(cell.properties.capabilityId.pattern, "^c\\d+$");
});

test("build_competitive_matrix tool schema lists the three cell kinds", () => {
  const cap = buildMatrixToolSchema.properties.capabilities.items;
  assert.deepEqual(
    [...cap.properties.kind.enum].sort(),
    ["presence", "score", "text"]
  );
});

test("competitive-matrix library signals head-to-head comparison", () => {
  const hints = competitiveMatrixArchetype.library.selectionHints
    .join(" ")
    .toLowerCase();
  assert.match(hints, /compare|matrix|scorecard|capability|head-to-head/);
});
