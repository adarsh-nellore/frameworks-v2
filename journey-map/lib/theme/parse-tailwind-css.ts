/**
 * Parse raw Tailwind CSS v4 / shadcn/ui CSS variable blocks into a DesignSystem.
 *
 * Handles:
 *   @import "tailwindcss";
 *   @custom-variant dark (&:is(.dark *));
 *   :root { --background: oklch(...); --foreground: oklch(...); ... }
 *   .dark { --background: oklch(...); ... }        ← ignored (dark-mode not used yet)
 *   @theme inline { --color-background: var(--background); ... }  ← ignored (just re-refs)
 *   @layer base { * { @apply border-border; } }    ← ignored
 *
 * Color formats supported (delegated to colorToRgbTriplet):
 *   oklch(), hsl(), hsla(), rgb(), rgba(), #hex
 */

import { colorToRgbTriplet } from "./import-design-tokens";
import type { DesignSystem } from "./types";
import type { DesignSystemParseResult } from "./parse";

// ── Detection ────────────────────────────────────────────────────────────────

/** Returns true if the string looks like CSS rather than JSON. */
export function looksLikeCss(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.startsWith("@import") ||
    trimmed.startsWith("@custom-variant") ||
    trimmed.startsWith("@theme") ||
    trimmed.startsWith("@layer") ||
    trimmed.startsWith(":root") ||
    trimmed.startsWith(".dark") ||
    /^\/\*/.test(trimmed) ||
    // Has CSS variable declarations but is not JSON-like
    (/--[a-zA-Z]/.test(trimmed) && !trimmed.startsWith("{"))
  );
}

// ── CSS block extractor ──────────────────────────────────────────────────────

/**
 * Extract all `--var: value` declarations from a named block like `:root { }` or `.dark { }`.
 * Handles simple single-level blocks only (no nesting beyond one `{ }`).
 */
function extractBlock(css: string, selector: string): Record<string, string> {
  const vars: Record<string, string> = {};
  // Find selector → opening brace
  const selectorRe = new RegExp(`${escapeRegex(selector)}\\s*\\{`, "g");
  let match: RegExpExecArray | null;
  while ((match = selectorRe.exec(css)) !== null) {
    const start = match.index + match[0].length;
    // Find matching closing brace (count depth)
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const block = css.slice(start, i - 1);
    // Extract --var: value; lines (value may contain parens and spaces)
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let d: RegExpExecArray | null;
    while ((d = declRe.exec(block)) !== null) {
      const key = d[1].trim();
      const val = d[2].trim();
      if (key && val) vars[key] = val;
    }
  }
  return vars;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── CSS variable → DesignSystem field mapping ─────────────────────────────────

/**
 * Tailwind CSS v4 / shadcn variable names → DesignSystem fields.
 *
 * Priority order matters: first matching key wins when we have multiple
 * candidates (e.g. --card preferred over --background for `surface`).
 */
const FIELD_CANDIDATES: Array<{
  field: keyof DesignSystem;
  keys: string[];
  required?: boolean;
}> = [
  // Required fields
  { field: "canvas",        required: true,  keys: ["--background", "--muted", "--secondary"] },
  { field: "surface",       required: true,  keys: ["--card", "--popover", "--background"] },
  { field: "surfaceSubtle", required: true,  keys: ["--muted", "--secondary", "--background"] },
  { field: "inkPrimary",    required: true,  keys: ["--foreground", "--card-foreground"] },
  { field: "inkSecondary",  required: true,  keys: ["--secondary-foreground", "--muted-foreground", "--foreground"] },
  { field: "inkMuted",      required: true,  keys: ["--muted-foreground", "--secondary-foreground"] },
  { field: "borderSoft",    required: true,  keys: ["--border", "--input", "--secondary"] },
  { field: "accent",        required: true,  keys: ["--primary", "--ring", "--accent"] },
  // Optional fields
  { field: "surfaceHover",  keys: ["--accent", "--muted"] },
  { field: "borderMedium",  keys: ["--input", "--border"] },
];

/** Font family candidates */
const FONT_SANS_KEYS = ["--font-sans", "--font-body"];
const FONT_MONO_KEYS = ["--font-mono", "--font-code"];

/** Radius candidates */
const RADIUS_KEYS = ["--radius", "--radius-lg"];

function resolveColor(vars: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const raw = vars[k];
    if (!raw) continue;
    // Skip values that are just var() references (from @theme inline)
    if (/^var\(/.test(raw.trim())) continue;
    const t = colorToRgbTriplet(raw);
    if (t) return t;
  }
  return null;
}

function resolveFont(vars: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const raw = vars[k];
    if (!raw) continue;
    if (/^var\(/.test(raw.trim())) continue;
    // Strip surrounding quotes
    const cleaned = raw.trim().replace(/^['"]|['"]$/g, "");
    // Strip trailing ", sans-serif" stack — keep first family name only for Google Fonts
    const first = cleaned.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    if (first) return first;
  }
  return undefined;
}

function resolveRadius(vars: Record<string, string>): string | undefined {
  for (const k of RADIUS_KEYS) {
    const raw = vars[k];
    if (!raw) continue;
    if (/^var\(/.test(raw.trim())) continue;
    const t = raw.trim();
    if (/^\d/.test(t)) return t;
    if (/rem$|px$|em$/.test(t)) return t;
  }
  return undefined;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a raw CSS string containing Tailwind v4 / shadcn-style `:root { }` variable
 * blocks and map them to a flat `DesignSystem`.
 *
 * - Only `:root` variables are used for the light theme; `.dark` is ignored.
 * - `@theme inline` and `@layer` blocks are stripped before parsing.
 * - Colors in oklch(), hsl(), rgb(), hex are all supported.
 */
export function parseTailwindCss(css: string): DesignSystemParseResult {
  // Strip CSS comments
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // Extract :root block
  const rootVars = extractBlock(stripped, ":root");

  if (Object.keys(rootVars).length === 0) {
    return { ok: false, error: "No :root CSS variable block found in the pasted CSS." };
  }

  const result: Partial<Record<keyof DesignSystem, string>> = { version: "1" as unknown as string };

  const errors: string[] = [];

  for (const candidate of FIELD_CANDIDATES) {
    const val = resolveColor(rootVars, candidate.keys);
    if (val) {
      (result as Record<string, string>)[candidate.field] = val;
    } else if (candidate.required) {
      // Try to produce a helpful error showing which CSS vars we looked for
      errors.push(`Could not resolve "${candidate.field}" — tried: ${candidate.keys.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors[0] };
  }

  // Optional fields
  const fontSans = resolveFont(rootVars, FONT_SANS_KEYS);
  const fontMono = resolveFont(rootVars, FONT_MONO_KEYS);
  const radiusRaw = resolveRadius(rootVars);

  // Derive radius variants from base radius
  let radiusSm: string | undefined;
  let radiusMd: string | undefined;
  let radiusLg: string | undefined;
  if (radiusRaw) {
    // Convert to px for simple arithmetic
    const pxVal = cssLengthToPx(radiusRaw);
    if (pxVal !== null) {
      radiusSm = `${Math.max(2, Math.round(pxVal * 0.5))}px`;
      radiusMd = `${Math.round(pxVal * 0.75)}px`;
      radiusLg = radiusRaw; // keep original unit
    } else {
      radiusLg = radiusRaw;
    }
  }

  const ds: DesignSystem = {
    version: 1,
    accent:        result.accent as string,
    canvas:        result.canvas as string,
    surface:       result.surface as string,
    surfaceSubtle: result.surfaceSubtle as string,
    inkPrimary:    result.inkPrimary as string,
    inkSecondary:  result.inkSecondary as string,
    inkMuted:      result.inkMuted as string,
    borderSoft:    result.borderSoft as string,
    ...(result.surfaceHover  ? { surfaceHover:  result.surfaceHover  as string } : {}),
    ...(result.borderMedium  ? { borderMedium:  result.borderMedium  as string } : {}),
    ...(radiusSm             ? { radiusSm }                                       : {}),
    ...(radiusMd             ? { radiusMd }                                       : {}),
    ...(radiusLg             ? { radiusLg }                                       : {}),
    ...(fontSans             ? { fontSans }                                       : {}),
    ...(fontMono             ? { fontMono }                                       : {}),
  };

  return { ok: true, ds };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function cssLengthToPx(value: string): number | null {
  const remMatch = value.match(/^([\d.]+)rem$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  const pxMatch = value.match(/^([\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);
  const emMatch = value.match(/^([\d.]+)em$/);
  if (emMatch) return parseFloat(emMatch[1]) * 16;
  return null;
}
