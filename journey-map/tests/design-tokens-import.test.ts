import test from "node:test";
import assert from "node:assert/strict";
import {
  colorToRgbTriplet,
  flattenDesignTokenGroups,
  isDesignTokenBundleShape,
} from "@/lib/theme/import-design-tokens";
import { parseThemeImport } from "@/lib/theme/parse";

test("colorToRgbTriplet parses hex and rgb", () => {
  assert.equal(colorToRgbTriplet("#862b00"), "134 43 0");
  assert.equal(colorToRgbTriplet("#fff"), "255 255 255");
  assert.equal(colorToRgbTriplet("rgb(20, 18, 15)"), "20 18 15");
});

test("flattenDesignTokenGroups collects --vars", () => {
  const flat = flattenDesignTokenGroups({
    tokens: {
      A: { "--x": "#111111" },
      B: { "--y": "#222222" },
    },
  });
  assert.equal(flat["--x"], "#111111");
  assert.equal(flat["--y"], "#222222");
});

test("parseThemeImport accepts grouped design token bundle", () => {
  const raw = {
    tokens: {
      surf: {
        "--surface-50": "#f5f3f0",
        "--surface-100": "#e8e5e1",
        "--surface-200": "#cdc9c4",
        "--surface-300": "#aca8a3",
        "--surface-400": "#908c87",
        "--surface-500": "#6e6b67",
        "--surface-700": "#413f3c",
        "--surface-900": "#201f1d",
        "--surface-950": "#1a1917",
      },
      brand: { "--primary-100": "#ffe5e1", "--primary-200": "#f5cdc5", "--blush": "#ffd4ce" },
      typo: {
        "--font-body": "'DM Sans', system-ui, sans-serif",
        "--font-mono": "'JetBrains Mono', monospace",
      },
    },
    components: [],
  };
  assert.equal(isDesignTokenBundleShape(raw), true);
  const p = parseThemeImport(raw);
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.equal(p.theme.version, 1);
  assert.equal(p.theme.semantic.canvas, "245 243 240");
  assert.equal(p.theme.semantic.inkPrimary, "26 25 23");
  assert.ok(p.designTokenCssVars && p.designTokenCssVars["--primary-200"]);
  assert.ok(p.theme.fonts?.sansStack?.includes("DM Sans"));
});

test("parseThemeImport still accepts theme v1", () => {
  const p = parseThemeImport({
    version: 1,
    semantic: {
      canvas: "1 2 3",
      surface: "4 5 6",
      surfaceSubtle: "7 8 9",
      surfaceHover: "10 11 12",
      inkPrimary: "13 14 15",
      inkSecondary: "16 17 18",
      inkMuted: "19 20 21",
      borderSoft: "22 23 24",
      borderMedium: "25 26 27",
      shadowTint: "28 29 30",
      washNorth: "31 32 33",
      washEast: "34 35 36",
      washSouthWest: "37 38 39",
      dotGrid: "40 41 42",
      glassSurface: "43 44 45",
      glassBorder: "46 47 48",
      glassInset: "49 50 51",
    },
    lanes: {},
  });
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.equal(p.designTokenCssVars, undefined);
});
