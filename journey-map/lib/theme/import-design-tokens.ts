import { DEFAULT_SEMANTIC, DEFAULT_THEME_V1 } from "./defaults";
import type { FontTokens, SemanticTokens, ThemeV1 } from "./types";

/** Flatten `{ tokens: { "Group": { "--x": "#hex" } } }` into one map. */
export function flattenDesignTokenGroups(raw: Record<string, unknown>): Record<string, string> {
  const t = raw.tokens;
  if (typeof t !== "object" || t === null) return {};
  const out: Record<string, string> = {};
  for (const group of Object.values(t as Record<string, unknown>)) {
    if (typeof group !== "object" || group === null) continue;
    for (const [k, val] of Object.entries(group as Record<string, unknown>)) {
      if (typeof k === "string" && k.startsWith("--") && typeof val === "string") {
        out[k] = val;
      }
    }
  }
  return out;
}

export function isDesignTokenBundleShape(raw: unknown): raw is Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return false;
  const o = raw as Record<string, unknown>;
  if (o.semantic !== undefined || o.version !== undefined || o.lanes !== undefined) {
    return false;
  }
  if (typeof o.tokens !== "object" || o.tokens === null) return false;
  for (const v of Object.values(o.tokens as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue;
    for (const k of Object.keys(v as object)) {
      if (k.startsWith("--")) return true;
    }
  }
  return false;
}

/** Parse #rgb / #rrggbb / rgb() / rgba() → space-separated R G B (for our semantic vars). */
export function colorToRgbTriplet(value: string): string | null {
  const v = value.trim();
  const triplet = v.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
  if (triplet) {
    const r = +triplet[1];
    const g = +triplet[2];
    const b = +triplet[3];
    if (r <= 255 && g <= 255 && b <= 255) return `${r} ${g} ${b}`;
    return null;
  }
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const n = parseInt(h, 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  }
  const rgba = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)/i
  );
  if (rgba) {
    return `${Math.round(Number(rgba[1]))} ${Math.round(Number(rgba[2]))} ${Math.round(Number(rgba[3]))}`;
  }
  const borderRgba = v.match(/rgba?\([\d.\s,]+\)/gi);
  if (borderRgba) {
    for (const frag of borderRgba) {
      const t2 = colorToRgbTriplet(frag);
      if (t2) return t2;
    }
  }
  return null;
}

function pick(flat: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const raw = flat[k];
    if (!raw) continue;
    const t = colorToRgbTriplet(raw);
    if (t) return t;
  }
  return null;
}

function mergeSemantic(base: SemanticTokens, patch: Partial<SemanticTokens>): SemanticTokens {
  return { ...base, ...patch };
}

/**
 * Map a flat `--token` → CSS value map (hex stacks, etc.) into our ThemeV1 semantic model.
 * Unknown keys are still returned in `cssVars` for optional application on :root.
 */
export function designTokenFlatToThemeV1(
  flat: Record<string, string>
): { theme: ThemeV1; cssVars: Record<string, string> } {
  const base = { ...DEFAULT_SEMANTIC };
  // Page wash uses the lightest surfaces; the map card stays white for contrast unless overridden.
  const canvas = pick(flat, ["--surface-50", "--surface-100"]) ?? base.canvas;
  const surface = "255 255 255";
  const surfaceSubtle = pick(flat, ["--surface-100", "--surface-200"]) ?? base.surfaceSubtle;
  const surfaceHover = pick(flat, ["--surface-200", "--surface-300"]) ?? base.surfaceHover;
  const inkPrimary = pick(flat, ["--surface-950", "--surface-900", "--surface-850"]) ?? base.inkPrimary;
  const inkSecondary = pick(flat, ["--surface-700", "--surface-600"]) ?? base.inkSecondary;
  const inkMuted = pick(flat, ["--surface-500", "--surface-400"]) ?? base.inkMuted;
  const borderSoft = pick(flat, ["--surface-300", "--surface-200"]) ?? base.borderSoft;
  const borderMedium = pick(flat, ["--surface-400", "--surface-500"]) ?? base.borderMedium;
  const shadowTint = pick(flat, ["--surface-950", "--surface-900"]) ?? inkPrimary;
  const washNorth =
    pick(flat, ["--primary-100", "--primary-200", "--blush"]) ??
    pick(flat, ["--accent-400"]) ??
    base.washNorth;
  const washEast =
    pick(flat, ["--primary-200", "--primary-300"]) ??
    pick(flat, ["--accent-500"]) ??
    base.washEast;
  const washSouthWest =
    pick(flat, ["--primary-50", "--blush", "--primary-100"]) ?? base.washSouthWest;
  const dotGrid = pick(flat, ["--surface-900", "--surface-800"]) ?? inkPrimary;
  const glassSurface = pick(flat, ["--surface-50", "--surface-100"]) ?? surface;
  const glassBorder = pick(flat, ["--surface-200", "--surface-100"]) ?? base.glassBorder;
  const glassInset = pick(flat, ["--surface-100", "--surface-50"]) ?? base.glassInset;

  const semantic = mergeSemantic(base, {
    canvas,
    surface,
    surfaceSubtle,
    surfaceHover,
    inkPrimary,
    inkSecondary,
    inkMuted,
    borderSoft,
    borderMedium,
    shadowTint,
    washNorth,
    washEast,
    washSouthWest,
    dotGrid,
    glassSurface,
    glassBorder,
    glassInset,
  });

  const fonts: FontTokens = { ...DEFAULT_THEME_V1.fonts };
  const body = flat["--font-body"]?.trim();
  const mono = flat["--font-mono"]?.trim();
  if (body) {
    fonts.sansStack = body;
    delete fonts.sansGoogle;
  }
  if (mono) {
    fonts.monoStack = mono;
    delete fonts.monoGoogle;
  }

  const theme: ThemeV1 = {
    version: 1,
    semantic,
    lanes: { ...DEFAULT_THEME_V1.lanes },
    fonts,
  };

  return { theme, cssVars: { ...flat } };
}

export function tryParseDesignTokenBundle(raw: unknown): { theme: ThemeV1; cssVars: Record<string, string> } | null {
  if (!isDesignTokenBundleShape(raw)) return null;
  const o = raw as Record<string, unknown>;
  const flat = flattenDesignTokenGroups(o);
  if (Object.keys(flat).length === 0) return null;
  return designTokenFlatToThemeV1(flat);
}
