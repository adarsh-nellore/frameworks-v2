import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  validateTableDoc,
  type TableDoc,
} from "../lib/archetypes/table/schema";

function baseDoc(overrides: Partial<TableDoc> = {}): TableDoc {
  return {
    id: "t1",
    title: "Sample",
    columns: [
      { id: "c1", label: "Name", type: "text" },
      { id: "c2", label: "ARR", type: "number" },
      { id: "c3", label: "Stage", type: "enum", options: ["new", "live"] },
      { id: "c4", label: "Start", type: "date" },
    ],
    rows: [
      {
        id: "r1",
        values: { c1: "Acme", c2: 120000, c3: "live", c4: "2026-01-01" },
      },
      { id: "r2", values: { c1: "Beta", c2: null, c3: "new", c4: null } },
    ],
    ...overrides,
  };
}

test("validateTableDoc accepts a well-formed doc", () => {
  const r = validateTableDoc(baseDoc());
  assert.equal(r.ok, true);
});

test("validateTableDoc rejects missing title", () => {
  const r = validateTableDoc(baseDoc({ title: "" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /title/i);
});

test("validateTableDoc rejects non-object input", () => {
  assert.equal(validateTableDoc(null).ok, false);
  assert.equal(validateTableDoc("string").ok, false);
  assert.equal(validateTableDoc(42).ok, false);
});

test("validateTableDoc rejects empty columns", () => {
  const r = validateTableDoc(baseDoc({ columns: [] }));
  assert.equal(r.ok, false);
});

test("validateTableDoc rejects bad column id format", () => {
  const doc = baseDoc({
    columns: [{ id: "name", label: "Name", type: "text" }],
    rows: [{ id: "r1", values: { name: "x" } }],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /c\\d/);
});

test("validateTableDoc rejects duplicate column ids", () => {
  const doc = baseDoc({
    columns: [
      { id: "c1", label: "A", type: "text" },
      { id: "c1", label: "B", type: "text" },
    ],
    rows: [],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /duplicate column id/i);
});

test("validateTableDoc rejects duplicate column labels", () => {
  const doc = baseDoc({
    columns: [
      { id: "c1", label: "Score", type: "number" },
      { id: "c2", label: "score", type: "number" },
    ],
    rows: [],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /duplicate column label/i);
});

test("validateTableDoc rejects unknown column type", () => {
  // @ts-expect-error intentional bad type
  const doc = baseDoc({ columns: [{ id: "c1", label: "x", type: "blob" }] });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
});

test("validateTableDoc rejects enum column without options", () => {
  const doc = baseDoc({
    columns: [{ id: "c1", label: "Stage", type: "enum" }],
    rows: [],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /missing options/);
});

test("validateTableDoc rejects enum with empty options", () => {
  const doc = baseDoc({
    columns: [{ id: "c1", label: "Stage", type: "enum", options: [] }],
    rows: [],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
});

test("validateTableDoc rejects enum value not in options", () => {
  const doc = baseDoc({
    columns: [{ id: "c1", label: "Stage", type: "enum", options: ["a", "b"] }],
    rows: [{ id: "r1", values: { c1: "c" } }],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /not in options/);
});

test("validateTableDoc rejects non-enum column with options", () => {
  const doc = baseDoc({
    columns: [
      { id: "c1", label: "Name", type: "text", options: ["a", "b"] },
    ],
    rows: [],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /must not include options/);
});

test("validateTableDoc rejects row referencing unknown column", () => {
  const doc = baseDoc({
    rows: [{ id: "r1", values: { ghost: "x" } }],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /unknown column/i);
});

test("validateTableDoc rejects number column with string value", () => {
  const doc = baseDoc({
    rows: [
      { id: "r1", values: { c1: "x", c2: "not a number", c3: "new", c4: null } },
    ],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /number/i);
});

test("validateTableDoc accepts null cell values", () => {
  const doc = baseDoc({
    rows: [{ id: "r1", values: { c1: null, c2: null, c3: null, c4: null } }],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, true);
});

test("validateTableDoc rejects duplicate row ids", () => {
  const doc = baseDoc({
    rows: [
      { id: "r1", values: { c1: "a", c2: 1, c3: "new", c4: null } },
      { id: "r1", values: { c1: "b", c2: 2, c3: "new", c4: null } },
    ],
  });
  const r = validateTableDoc(doc);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /duplicate row/i);
});

test("validateTableDoc accepts doc with zero rows", () => {
  const r = validateTableDoc(baseDoc({ rows: [] }));
  assert.equal(r.ok, true);
});
