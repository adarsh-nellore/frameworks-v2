import type { DesignSystem, ThemeV1 } from "./types";
import { DEFAULT_THEME_V1 } from "./defaults";
import { serializeDesignSystem, serializeTheme } from "./storage";

// ──────────────────────────────────────────────────────────────────────────────
// Handoff bundle — a single JSON file that captures everything needed to
// recreate the current work elsewhere:
//   - map.json            the framework data
//   - designSystem.v1.json   the preferred flat design-system tokens
//   - theme.v1.json       legacy theme (semantic + lanes) for back-compat
//   - readme              a human-readable preview of the bundle
//
// The output is designed to look polished when opened: stable key ordering,
// 2-space indentation, a leading readme that summarizes the palette + fonts,
// and a top-level "meta" block with a preview snippet of accent/surface/ink
// so a reader can eyeball the look without rendering the map.
// ──────────────────────────────────────────────────────────────────────────────

function rgbTripletToHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return "#000000";
  return "#" + parts.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
}

function buildReadme(ds: DesignSystem | null, mapTitle: string | null): string {
  const lines: string[] = [];
  lines.push("Framework Handoff");
  lines.push("=================");
  lines.push("");
  if (mapTitle) {
    lines.push(`Title: ${mapTitle}`);
  }
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  if (ds) {
    lines.push("Design System");
    lines.push("-------------");
    lines.push(`Accent:         ${rgbTripletToHex(ds.accent)}  (--accent)`);
    lines.push(`Canvas:         ${rgbTripletToHex(ds.canvas)}  (--canvas)`);
    lines.push(`Surface:        ${rgbTripletToHex(ds.surface)}  (--surface)`);
    lines.push(`Surface Subtle: ${rgbTripletToHex(ds.surfaceSubtle)}  (--surface-subtle)`);
    lines.push(`Ink Primary:    ${rgbTripletToHex(ds.inkPrimary)}  (--ink-primary)`);
    lines.push(`Ink Secondary:  ${rgbTripletToHex(ds.inkSecondary)}  (--ink-secondary)`);
    lines.push(`Ink Muted:      ${rgbTripletToHex(ds.inkMuted)}  (--ink-muted)`);
    lines.push(`Border Soft:    ${rgbTripletToHex(ds.borderSoft)}  (--border-soft)`);
    if (ds.borderMedium) lines.push(`Border Medium:  ${rgbTripletToHex(ds.borderMedium)}  (--border-medium)`);
    if (ds.fontSans || ds.fontMono) {
      lines.push("");
      lines.push(`Typography: ${ds.fontSans ?? "(system sans)"} / ${ds.fontMono ?? "(system mono)"}`);
    }
    if (ds.radiusSm || ds.radiusMd || ds.radiusLg) {
      lines.push(`Radii: sm=${ds.radiusSm ?? "default"}  md=${ds.radiusMd ?? "default"}  lg=${ds.radiusLg ?? "default"}`);
    }
    lines.push("");
  }
  lines.push("Contents");
  lines.push("--------");
  lines.push("- meta            bundle metadata + palette preview");
  lines.push("- designSystem    flat DesignSystem (new preferred shape)");
  lines.push("- theme           theme.v1.json (legacy, kept for backward compatibility)");
  lines.push("- map             framework data (cols, rows, cards, meta)");
  lines.push("");
  lines.push("Importing");
  lines.push("---------");
  lines.push("1. Paste the `designSystem` block into Theme → Import → JSON.");
  lines.push("2. Copy `map` into the app via the seed/import flow.");
  lines.push("");
  lines.push("CSS");
  lines.push("---");
  lines.push("Every color maps 1:1 to a CSS variable on :root. Values are stored as");
  lines.push("space-separated R G B triplets so Tailwind opacity modifiers work.");
  return lines.join("\n");
}

export type HandoffBundle = {
  readme: string;
  mapJson: string;
  themeJson: string;
  designSystemJson: string | null;
};

export function buildHandoffBundle(
  map: unknown,
  theme: ThemeV1 | null,
  designSystem?: DesignSystem | null
): HandoffBundle {
  const t = theme ?? DEFAULT_THEME_V1;
  const mapTitle = typeof (map as { title?: unknown })?.title === "string"
    ? ((map as { title: string }).title)
    : null;
  return {
    readme: buildReadme(designSystem ?? null, mapTitle),
    mapJson: JSON.stringify(map, null, 2),
    themeJson: serializeTheme(t),
    designSystemJson: designSystem ? serializeDesignSystem(designSystem) : null,
  };
}

/**
 * Single JSON file for easy download.
 *
 * Layout (keys in this stable order so the file reads nicely):
 *   version, meta, readme, designSystem, theme, map
 *
 * `meta` contains a palette preview (hex form) and timestamp so someone
 * opening this in an editor can eyeball the design system without rendering.
 */
export function buildHandoffJson(
  map: unknown,
  theme: ThemeV1 | null,
  designSystem?: DesignSystem | null
): string {
  const b = buildHandoffBundle(map, theme, designSystem ?? null);
  const meta: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
  if (designSystem) {
    meta.palette = {
      accent: rgbTripletToHex(designSystem.accent),
      canvas: rgbTripletToHex(designSystem.canvas),
      surface: rgbTripletToHex(designSystem.surface),
      inkPrimary: rgbTripletToHex(designSystem.inkPrimary),
      borderSoft: rgbTripletToHex(designSystem.borderSoft),
    };
    meta.typography = {
      sans: designSystem.fontSans ?? null,
      mono: designSystem.fontMono ?? null,
    };
  }

  const payload: Record<string, unknown> = {
    version: 1,
    meta,
    readme: b.readme,
  };
  if (designSystem) {
    payload.designSystem = designSystem;
  }
  payload.theme = JSON.parse(b.themeJson);
  payload.map = JSON.parse(b.mapJson);
  return JSON.stringify(payload, null, 2);
}
