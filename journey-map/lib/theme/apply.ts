import type { LaneTokenSet, SemanticTokens, ThemeV1 } from "./types";
import { buildGoogleFontsHref, removeGoogleFontLinks, upsertGoogleFontLink } from "./google-fonts";

/** Inline `--foo` vars from an external design system (cleared with {@link clearAppliedTheme}). */
let appliedDesignTokenKeys: string[] = [];

/**
 * Names we already drive via {@link applyTheme} or that must stay compatible with
 * `rgb(var(--…) / α)` in Tailwind/globals — injecting foreign values (hex, full shadows)
 * breaks paint (e.g. blank canvas).
 */
const AUXILIARY_VAR_DENY_EXACT = new Set([
  "--canvas",
  "--surface",
  "--surface-subtle",
  "--surface-hover",
  "--ink-primary",
  "--ink-secondary",
  "--ink-muted",
  "--border-soft",
  "--border-medium",
  "--shadow-tint",
  "--shadow-panel",
  "--shadow-card",
  "--shadow-card-hover",
  "--wash-north",
  "--wash-east",
  "--wash-south-west",
  "--dot-grid",
  "--glass-surface",
  "--glass-border",
  "--glass-inset",
  "--font-sans",
  "--font-mono",
  "--jm-font-sans",
  "--jm-font-mono",
]);

function isDesignTokenVarKeyAllowed(key: string): boolean {
  if (!key.startsWith("--")) return false;
  if (AUXILIARY_VAR_DENY_EXACT.has(key)) return false;
  if (key.startsWith("--lane-")) return false;
  // App shadows expect `rgb(var(--shadow-tint) / …)`; design files use different `--shadow-*`.
  if (key.startsWith("--shadow-")) return false;
  return true;
}

export function applyDesignTokenCssVars(flat: Record<string, string> | undefined): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const k of appliedDesignTokenKeys) {
    root.style.removeProperty(k);
  }
  appliedDesignTokenKeys = [];
  if (!flat) return;
  for (const [k, v] of Object.entries(flat)) {
    if (!isDesignTokenVarKeyAllowed(k)) continue;
    root.style.setProperty(k, v);
    appliedDesignTokenKeys.push(k);
  }
}

function semanticToCssVar(key: keyof SemanticTokens): string {
  return `--${key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

function laneSlotToKebab(slot: keyof LaneTokenSet): string {
  return String(slot).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function applySemantic(root: HTMLElement, s: SemanticTokens): void {
  (Object.keys(s) as (keyof SemanticTokens)[]).forEach((key) => {
    root.style.setProperty(semanticToCssVar(key), s[key]);
  });
}

function applyLanes(root: HTMLElement, lanes: ThemeV1["lanes"]): void {
  for (const [kind, tokens] of Object.entries(lanes)) {
    (Object.keys(tokens) as (keyof LaneTokenSet)[]).forEach((slot) => {
      const name = `--lane-${kind}-${laneSlotToKebab(slot)}`;
      root.style.setProperty(name, tokens[slot]);
    });
  }
}

/** Apply theme to the document root (CSS variables + optional Google Fonts). */
export function applyTheme(theme: ThemeV1): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  applySemantic(root, theme.semantic);
  applyLanes(root, theme.lanes);

  removeGoogleFontLinks();
  const href = buildGoogleFontsHref(theme.fonts);
  if (href) upsertGoogleFontLink(href);

  root.style.removeProperty("--jm-font-sans");
  root.style.removeProperty("--jm-font-mono");

  if (theme.fonts?.sansStack) {
    root.style.setProperty("--jm-font-sans", theme.fonts.sansStack);
  } else if (theme.fonts?.sansGoogle) {
    const name = theme.fonts.sansGoogle.replace(/\+/g, " ");
    root.style.setProperty(
      "--jm-font-sans",
      `"${name}", ui-sans-serif, system-ui, sans-serif`
    );
  }

  if (theme.fonts?.monoStack) {
    root.style.setProperty("--jm-font-mono", theme.fonts.monoStack);
  } else if (theme.fonts?.monoGoogle) {
    const name = theme.fonts.monoGoogle.replace(/\+/g, " ");
    root.style.setProperty(
      "--jm-font-mono",
      `"${name}", ui-monospace, monospace`
    );
  }
}

/** Clear runtime theme overrides (fonts link + inline vars we set). */
export function clearAppliedTheme(): void {
  if (typeof document === "undefined") return;
  applyDesignTokenCssVars(undefined);
  removeGoogleFontLinks();
  const root = document.documentElement;
  const keys = Array.from(root.style);
  for (const k of keys) {
    if (
      k.startsWith("--canvas") ||
      k.startsWith("--surface") ||
      k.startsWith("--ink-") ||
      k.startsWith("--border-") ||
      k.startsWith("--shadow") ||
      k.startsWith("--wash-") ||
      k.startsWith("--dot-") ||
      k.startsWith("--glass-") ||
      k.startsWith("--lane-") ||
      k === "--font-sans" ||
      k === "--font-mono" ||
      k === "--jm-font-sans" ||
      k === "--jm-font-mono"
    ) {
      root.style.removeProperty(k);
    }
  }
}
