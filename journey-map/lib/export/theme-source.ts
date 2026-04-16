import {
  DEFAULT_THEME_V1,
  loadStoredThemeJson,
  parseThemeImport,
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
