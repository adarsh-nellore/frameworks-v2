import type { ThemeV1 } from "./types";

const KEY = "journey-map-theme-v1";
/** Raw `--var` → value map from an imported design-token bundle (optional). */
const KEY_DESIGN_CSS = "journey-map-design-token-css-vars";

export function loadStoredThemeJson(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveStoredThemeJson(json: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* quota */
  }
}

export function clearStoredTheme(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_DESIGN_CSS);
  } catch {
    /* ignore */
  }
}

export function loadStoredDesignTokenCssVarsJson(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(KEY_DESIGN_CSS);
  } catch {
    return null;
  }
}

export function saveStoredDesignTokenCssVarsJson(json: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (json == null || json === "") localStorage.removeItem(KEY_DESIGN_CSS);
    else localStorage.setItem(KEY_DESIGN_CSS, json);
  } catch {
    /* quota */
  }
}

export function serializeTheme(theme: ThemeV1): string {
  return JSON.stringify(theme, null, 2);
}
