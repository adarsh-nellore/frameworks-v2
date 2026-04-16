import type { LaneTokenSet, SemanticTokens, ThemeV1 } from "./types";
import { buildGoogleFontsHref, removeGoogleFontLinks, upsertGoogleFontLink } from "./google-fonts";

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

  if (theme.fonts?.sansStack) {
    root.style.setProperty("--font-sans", theme.fonts.sansStack);
  } else if (theme.fonts?.sansGoogle) {
    const name = theme.fonts.sansGoogle.replace(/\+/g, " ");
    root.style.setProperty(
      "--font-sans",
      `"${name}", ui-sans-serif, system-ui, sans-serif`
    );
  }

  if (theme.fonts?.monoStack) {
    root.style.setProperty("--font-mono", theme.fonts.monoStack);
  } else if (theme.fonts?.monoGoogle) {
    const name = theme.fonts.monoGoogle.replace(/\+/g, " ");
    root.style.setProperty(
      "--font-mono",
      `"${name}", ui-monospace, monospace`
    );
  }
}

/** Clear runtime theme overrides (fonts link + inline vars we set). */
export function clearAppliedTheme(): void {
  if (typeof document === "undefined") return;
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
      k === "--font-mono"
    ) {
      root.style.removeProperty(k);
    }
  }
}
