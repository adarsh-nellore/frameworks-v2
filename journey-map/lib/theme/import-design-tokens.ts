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

// ── Color conversion helpers ─────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function linearToGamma(c: number): number {
  const x = clamp01(c);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function rgbFloatToTriplet(r: number, g: number, b: number): string {
  return `${Math.round(linearToGamma(r) * 255)} ${Math.round(linearToGamma(g) * 255)} ${Math.round(linearToGamma(b) * 255)}`;
}

/** oklch(L C H[ / alpha]) → "R G B" triplet. Pure JS, no browser APIs needed. */
function oklchToTriplet(l: number, c: number, h: number): string {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  // OKLab → LMS (cube-root intermediates)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;
  // LMS → linear sRGB
  const rLin = +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const gLin = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bLin = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc;
  return rgbFloatToTriplet(rLin, gLin, bLin);
}

/** hsl(H S% L%[ / alpha]) — both legacy comma and modern space syntax. */
function hslToTriplet(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `${Math.round(f(0) * 255)} ${Math.round(f(8) * 255)} ${Math.round(f(4) * 255)}`;
}

/** Parse #rgb / #rrggbb / rgb() / rgba() / hsl() / oklch() → "R G B" triplet. */
export function colorToRgbTriplet(value: string): string | null {
  const v = value.trim();

  // Already a space-separated triplet
  const triplet = v.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
  if (triplet) {
    const r = +triplet[1], g = +triplet[2], b = +triplet[3];
    if (r <= 255 && g <= 255 && b <= 255) return `${r} ${g} ${b}`;
    return null;
  }

  // Hex
  const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    // Strip alpha channel if 8-char
    const n = parseInt(h.slice(0, 6), 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  }

  // oklch() — Tailwind CSS v4 default
  const oklchLegacy = v.match(
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+(?:deg)?)\s*(?:\/\s*[\d.%]+\s*)?\)$/i
  );
  if (oklchLegacy) {
    let l = parseFloat(oklchLegacy[1]);
    if (oklchLegacy[1].includes("%")) l /= 100;
    const c = parseFloat(oklchLegacy[2]);
    const h = parseFloat(oklchLegacy[3]);
    return oklchToTriplet(l, c, isNaN(h) ? 0 : h);
  }

  // hsl() / hsla() — both comma (legacy) and space (modern) syntax
  const hslComma = v.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*[\d.%]+\s*)?\)$/i
  );
  if (hslComma) return hslToTriplet(+hslComma[1], +hslComma[2], +hslComma[3]);

  const hslSpace = v.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s+([\d.]+)%?\s+([\d.]+)%?\s*(?:\/\s*[\d.%]+\s*)?\)$/i
  );
  if (hslSpace) return hslToTriplet(+hslSpace[1], +hslSpace[2], +hslSpace[3]);

  // rgb() / rgba() — comma or space syntax
  const rgbComma = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i
  );
  if (rgbComma) {
    return `${Math.round(+rgbComma[1])} ${Math.round(+rgbComma[2])} ${Math.round(+rgbComma[3])}`;
  }

  const rgbSpace = v.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.%]+\s*)?\)$/i
  );
  if (rgbSpace) {
    return `${Math.round(+rgbSpace[1])} ${Math.round(+rgbSpace[2])} ${Math.round(+rgbSpace[3])}`;
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
