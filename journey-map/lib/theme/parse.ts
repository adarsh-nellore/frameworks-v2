import { DEFAULT_LANES, DEFAULT_SEMANTIC, DEFAULT_THEME_V1 } from "./defaults";
import { tryParseDesignTokenBundle } from "./import-design-tokens";
import type { LaneTokenSet, SemanticTokens, ThemeV1 } from "./types";

const RGB = /^\d{1,3} \d{1,3} \d{1,3}$/;

function isTriplet(v: unknown): v is string {
  return typeof v === "string" && RGB.test(v.trim()) && v.trim() === v;
}

function parseLaneSet(raw: unknown, path: string): LaneTokenSet | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const slots: (keyof LaneTokenSet)[] = [
    "accent",
    "border",
    "tint",
    "chipBg",
    "chipText",
    "highlightBg",
    "highlightText",
  ];
  const out = {} as LaneTokenSet;
  for (const s of slots) {
    const v = o[s];
    if (!isTriplet(v)) return null;
    out[s] = v.trim();
  }
  return out;
}

function parseSemantic(raw: unknown): SemanticTokens | null {
  const out = { ...DEFAULT_SEMANTIC };
  if (raw === undefined) return out;
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_SEMANTIC) as (keyof SemanticTokens)[];
  for (const k of keys) {
    const v = o[k as string];
    if (v === undefined) continue;
    if (!isTriplet(v)) return null;
    out[k] = v.trim();
  }
  return out;
}

export type ParseResult =
  | { ok: true; theme: ThemeV1; designTokenCssVars?: Record<string, string> }
  | { ok: false; error: string };

/** Validate and merge a partial or full theme JSON with shipped defaults. */
export function parseThemeV1(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Theme must be a JSON object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== undefined && o.version !== 1) {
    return { ok: false, error: 'Theme "version" must be 1' };
  }

  const semantic = parseSemantic(o.semantic);
  if (!semantic) {
    return { ok: false, error: "Invalid semantic tokens (expect R G B triplets)" };
  }

  const lanes: ThemeV1["lanes"] = { ...DEFAULT_LANES };
  if (o.lanes !== undefined) {
    if (typeof o.lanes !== "object" || o.lanes === null) {
      return { ok: false, error: '"lanes" must be an object' };
    }
    for (const [kind, val] of Object.entries(o.lanes as Record<string, unknown>)) {
      const parsed = parseLaneSet(val, kind);
      if (!parsed) {
        return { ok: false, error: `Invalid lane token set for "${kind}"` };
      }
      lanes[kind] = parsed;
    }
  }

  if (o.fonts !== undefined && (typeof o.fonts !== "object" || o.fonts === null)) {
    return { ok: false, error: '"fonts" must be an object when present' };
  }
  const f =
    typeof o.fonts === "object" && o.fonts !== null
      ? (o.fonts as Record<string, unknown>)
      : {};
  if (f.sansGoogle !== undefined && typeof f.sansGoogle !== "string") {
    return { ok: false, error: "fonts.sansGoogle must be a string" };
  }
  if (f.monoGoogle !== undefined && typeof f.monoGoogle !== "string") {
    return { ok: false, error: "fonts.monoGoogle must be a string" };
  }
  if (f.sansStack !== undefined && typeof f.sansStack !== "string") {
    return { ok: false, error: "fonts.sansStack must be a string" };
  }
  if (f.monoStack !== undefined && typeof f.monoStack !== "string") {
    return { ok: false, error: "fonts.monoStack must be a string" };
  }

  const fonts = {
    ...DEFAULT_THEME_V1.fonts,
    sansGoogle: f.sansGoogle as string | undefined,
    monoGoogle: f.monoGoogle as string | undefined,
    sansStack: f.sansStack as string | undefined,
    monoStack: f.monoStack as string | undefined,
  };

  return {
    ok: true,
    theme: {
      version: 1,
      semantic,
      lanes,
      fonts,
    },
  };
}

/** Accepts journey-map `theme.v1` or a grouped CSS token document (`tokens` → `--vars`). */
export function parseThemeImport(raw: unknown): ParseResult {
  const bundle = tryParseDesignTokenBundle(raw);
  if (bundle) {
    return { ok: true, theme: bundle.theme, designTokenCssVars: bundle.cssVars };
  }
  return parseThemeV1(raw);
}
