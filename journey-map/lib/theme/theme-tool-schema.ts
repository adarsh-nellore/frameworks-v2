/** Tiny tool schema for AI brand extraction — just 3 hex colors + optional fonts. */

export const BRAND_TOOL_NAME = "extract_brand";
export const BRAND_TOOL_DESCRIPTION =
  "Extract the 3 most important brand colors and any font names from the design system source.";

export const brandToolSchema = {
  type: "object",
  properties: {
    primary: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description:
        "The primary brand / anchor color as a 6-digit hex (e.g. '#862b00'). This is the most dominant non-neutral hue in the source.",
    },
    secondary: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description:
        "The lightest surface / background color as a 6-digit hex (e.g. '#f5f3f0'). Used for the map's surface — should be light enough for dark text on top.",
    },
    accent: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description:
        "A secondary accent / highlight / pop color as a 6-digit hex (e.g. '#f0a83a'). Used for highlights and alternate lanes. Should differ from primary in hue.",
    },
    sansFont: {
      type: "string",
      description:
        "Sans-serif Google Font name extracted from the source (e.g. 'DM Sans'). Omit if none found.",
    },
    monoFont: {
      type: "string",
      description:
        "Monospace Google Font name (e.g. 'JetBrains Mono'). Omit if none found.",
    },
    notes: {
      type: "string",
      description:
        "1-2 sentences for the user: which colors/fonts you picked and why.",
    },
  },
  required: ["primary", "secondary", "accent", "notes"],
  additionalProperties: false,
} as const;

export type BrandExtraction = {
  primary: string;
  secondary: string;
  accent: string;
  sansFont?: string;
  monoFont?: string;
  notes: string;
};

export function validateBrandExtraction(
  u: unknown
): { ok: true; brand: BrandExtraction } | { ok: false; reason: string } {
  if (typeof u !== "object" || u === null) {
    return { ok: false, reason: "must be an object" };
  }
  const o = u as Record<string, unknown>;
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  if (typeof o.primary !== "string" || !hexRe.test(o.primary))
    return { ok: false, reason: "primary must be a #RRGGBB hex" };
  if (typeof o.secondary !== "string" || !hexRe.test(o.secondary))
    return { ok: false, reason: "secondary must be a #RRGGBB hex" };
  if (typeof o.accent !== "string" || !hexRe.test(o.accent))
    return { ok: false, reason: "accent must be a #RRGGBB hex" };
  if (typeof o.notes !== "string")
    return { ok: false, reason: "notes must be a string" };
  return {
    ok: true,
    brand: {
      primary: o.primary as string,
      secondary: o.secondary as string,
      accent: o.accent as string,
      notes: o.notes as string,
      ...(typeof o.sansFont === "string" ? { sansFont: o.sansFont } : {}),
      ...(typeof o.monoFont === "string" ? { monoFont: o.monoFont } : {}),
    },
  };
}
