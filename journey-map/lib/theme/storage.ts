import type { BrandInput, DesignSystem, ThemeV1 } from "./types";

const KEY = "journey-map-theme-v1";
/** Raw `--var` → value map from an imported design-token bundle (optional). */
const KEY_DESIGN_CSS = "journey-map-design-token-css-vars";
/** Flat DesignSystem schema — the preferred import shape. */
const KEY_DS = "journey-map-design-system-v1";
/** Brand picker hex inputs so the Theme dialog can hydrate them on reopen. */
const KEY_BRAND = "framework-brand-v1";

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

// ──────────────────────────────────────────────────────────────────────────────
// DesignSystem storage — flat shape. Stored SEPARATELY from theme.v1 so both
// can coexist during the migration; applyDesignSystem takes precedence when
// present on mount.
// ──────────────────────────────────────────────────────────────────────────────

export function loadStoredDesignSystemJson(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(KEY_DS);
  } catch {
    return null;
  }
}

export function saveStoredDesignSystemJson(json: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (json == null || json === "") localStorage.removeItem(KEY_DS);
    else localStorage.setItem(KEY_DS, json);
  } catch {
    /* quota */
  }
}

export function serializeDesignSystem(ds: DesignSystem): string {
  return JSON.stringify(ds, null, 2);
}

// ──────────────────────────────────────────────────────────────────────────────
// Brand picker persistence — stores the hex inputs the user typed so the
// Theme dialog can hydrate them on reopen instead of resetting to defaults.
// ──────────────────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function loadStoredBrand(): BrandInput | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_BRAND);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (
      typeof o.primary !== "string" || !HEX_RE.test(o.primary) ||
      typeof o.secondary !== "string" || !HEX_RE.test(o.secondary) ||
      typeof o.accent !== "string" || !HEX_RE.test(o.accent)
    ) return null;
    const out: BrandInput = {
      primary: o.primary,
      secondary: o.secondary,
      accent: o.accent,
    };
    if (typeof o.sansFont === "string" && o.sansFont.trim()) out.sansFont = o.sansFont;
    if (typeof o.monoFont === "string" && o.monoFont.trim()) out.monoFont = o.monoFont;
    return out;
  } catch {
    return null;
  }
}

export function saveStoredBrand(brand: BrandInput): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY_BRAND, JSON.stringify(brand));
  } catch {
    /* quota */
  }
}

export function clearStoredBrand(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY_BRAND);
  } catch {
    /* ignore */
  }
}
