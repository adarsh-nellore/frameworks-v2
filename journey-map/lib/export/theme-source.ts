import {
  DEFAULT_THEME_V1,
  loadStoredDesignSystemJson,
  loadStoredThemeJson,
  parseDesignSystem,
  parseThemeImport,
  type DesignSystem,
  type ThemeV1,
} from "@/lib/theme";

/** Resolve the current theme for export, falling back to defaults. */
export function loadThemeForExport(): ThemeV1 {
  const raw = loadStoredThemeJson();
  if (!raw) return DEFAULT_THEME_V1;
  try {
    const parsed = parseThemeImport(JSON.parse(raw) as unknown);
    return parsed.ok ? parsed.theme : DEFAULT_THEME_V1;
  } catch {
    return DEFAULT_THEME_V1;
  }
}

/** Resolve the current DesignSystem (flat shape). Returns null if none stored. */
export function loadDesignSystemForExport(): DesignSystem | null {
  const raw = loadStoredDesignSystemJson();
  if (!raw) return null;
  try {
    const parsed = parseDesignSystem(JSON.parse(raw) as unknown);
    return parsed.ok ? parsed.ds : null;
  } catch {
    return null;
  }
}
