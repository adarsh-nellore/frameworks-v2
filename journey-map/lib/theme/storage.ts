import type { ThemeV1 } from "./types";

const KEY = "journey-map-theme-v1";

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
  } catch {
    /* ignore */
  }
}

export function serializeTheme(theme: ThemeV1): string {
  return JSON.stringify(theme, null, 2);
}
