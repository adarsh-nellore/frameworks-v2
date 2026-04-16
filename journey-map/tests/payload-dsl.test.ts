import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAgentFocus,
  renderUserPayload,
} from "@/lib/frameworks/journey-map/payload";
import { seed } from "@/lib/frameworks/journey-map/seed";

test("seed map renders a compact DSL", () => {
  const out = renderUserPayload(seed, "Move Pain Points above Thoughts.");

  // Headers
  assert.match(out, /^cols \(left→right\):/m);
  assert.match(out, /^rows \(top→bottom\):/m);
  assert.match(out, /^cells \(coord=cellId text\):/m);

  // Each stage gets a column letter + label + id
  assert.match(out, /A=Awareness\s+id=s1/);
  assert.match(out, /E=Retention\s+id=s5/);

  // Each row gets a number + label + id + kind
  assert.match(out, /1=Actions\s+id=r1 kind=actions/);
  assert.match(out, /6=Opportunities\s+id=r6 kind=opportunities/);

  // At least one filled cell line with coord=cellId "text"
  assert.match(out, /A1=c\d+ "Reads a peer comparison article"/);

  // Sparse positions show <empty> — D2 (Onboarding / Touchpoints) is left blank
  assert.match(out, /D2=<empty>/);

  // Instruction included verbatim
  assert.match(out, /Instruction: Move Pain Points above Thoughts\./);
});

test("DSL is much shorter than the previous full-pretty-JSON+coordinate-guide approach", () => {
  const out = renderUserPayload(seed, "test");
  // Sanity bound: a 6×6 map should produce < 3000 characters.
  // (For comparison: pretty-printed JSON of seed alone is > 4500 chars.)
  assert.ok(
    out.length < 3000,
    `expected DSL under 3000 chars, got ${out.length}`
  );
});

test("text is JSON-quoted so quotes/backslashes round-trip", () => {
  const m = {
    ...seed,
    cells: seed.cells.map((c, i) =>
      i === 0 ? { ...c, text: `she said "hi"` } : c
    ),
  };
  const out = renderUserPayload(m, "x");
  assert.match(out, /A1=c\d+ "she said \\"hi\\""/);
});

test("blocks focus appends Selection context with cell ids and coords", () => {
  const out = renderUserPayload(seed, "Tighten copy.", {
    type: "blocks",
    ids: ["c1"],
  });
  assert.match(out, /Instruction: Tighten copy\./);
  assert.match(
    out,
    /Selection context \(user focus[\s\S]*- cells:[\s\S]*id=c1 rowId=r1 stageId=s1/
  );
});

test("stages focus appends stage ids and labels", () => {
  const out = renderUserPayload(seed, "Rename phases.", {
    type: "stages",
    stageIds: ["s1", "s2"],
  });
  assert.match(out, /Instruction: Rename phases\./);
  assert.match(
    out,
    /Selection context[\s\S]*- stages:[\s\S]*id=s1 label="Awareness"[\s\S]*id=s2 label="Consideration"/
  );
});

test("parseAgentFocus rejects invalid shapes", () => {
  assert.equal(parseAgentFocus(null).ok, false);
  assert.equal(parseAgentFocus({ type: "blocks", ids: [] }).ok, false);
  assert.equal(parseAgentFocus({ type: "row" }).ok, false);
  assert.equal(parseAgentFocus({ type: "stages", stageIds: [] }).ok, false);
  assert.equal(parseAgentFocus({ type: "unknown" }).ok, false);
});
