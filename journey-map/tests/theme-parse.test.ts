import test from "node:test";
import assert from "node:assert/strict";
import { parseThemeV1 } from "@/lib/theme/parse";
import { DEFAULT_THEME_V1 } from "@/lib/theme/defaults";

test("parseThemeV1 accepts full default-equivalent document", () => {
  const p = parseThemeV1(JSON.parse(JSON.stringify(DEFAULT_THEME_V1)));
  assert.equal(p.ok, true);
  if (p.ok) assert.equal(p.theme.version, 1);
});

test("parseThemeV1 rejects malformed RGB triplet", () => {
  const p = parseThemeV1({
    version: 1,
    semantic: { ...DEFAULT_THEME_V1.semantic, canvas: "40 42" },
    lanes: DEFAULT_THEME_V1.lanes,
  });
  assert.equal(p.ok, false);
});

test("parseThemeV1 merges partial semantic", () => {
  const p = parseThemeV1({
    version: 1,
    semantic: { canvas: "0 0 0" },
    lanes: {},
  });
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.equal(p.theme.semantic.canvas, "0 0 0");
    assert.equal(p.theme.semantic.surface, DEFAULT_THEME_V1.semantic.surface);
  }
});
