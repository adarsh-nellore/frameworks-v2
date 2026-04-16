import type { DesignSystem, LaneTokenSet, SemanticTokens, ThemeV1 } from "./types";
import { buildGoogleFontsHref, removeGoogleFontLinks, upsertGoogleFontLink } from "./google-fonts";

// ──────────────────────────────────────────────────────────────────────────────
// Theme application — SCOPED TO THE FRAMEWORK BOARD.
//
// All CSS variables are written to the `[data-map-page]` element (rendered
// at app/page.tsx). Copilot, TopBar, Canvas, framework switcher, dialogs,
// and overlays are siblings of the board — not descendants — so they
// continue to resolve tokens via :root defaults and never repaint.
//
// Deliberately NOT touched here:
//   --wash-*, --dot-grid, --glass-*   (page background + chrome — stay :root)
//   --shadow-tint                     (would require overriding shadow
//                                      compositions; default shadows are fine)
//   --font-sans / --font-mono         (next/font base — reserved for chrome)
// Only --jm-font-sans / --jm-font-mono are overridden (board-local font).
// ──────────────────────────────────────────────────────────────────────────────

/** Resolve the scoping target (the board container). Null if not in DOM yet. */
function boardTarget(explicit?: HTMLElement | null): HTMLElement | null {
  if (explicit) return explicit;
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>("[data-map-page]");
}

/** Tracked inline design-token keys we set via applyDesignTokenCssVars, so we can clear them. */
let appliedDesignTokenKeys: string[] = [];

/**
 * Names we already drive via {@link applyTheme} or that must stay compatible with
 * `rgb(var(--…) / α)` in Tailwind/globals — injecting foreign values (hex, full shadows)
 * breaks paint.
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
  "--accent",
]);

function isDesignTokenVarKeyAllowed(key: string): boolean {
  if (!key.startsWith("--")) return false;
  if (AUXILIARY_VAR_DENY_EXACT.has(key)) return false;
  if (key.startsWith("--lane-")) return false;
  if (key.startsWith("--shadow-")) return false;
  return true;
}

export function applyDesignTokenCssVars(
  flat: Record<string, string> | undefined,
  target?: HTMLElement | null,
): void {
  const root = boardTarget(target);
  // Always clear previously-applied keys (even if target is now missing — the
  // old keys might still be on a prior element we captured earlier).
  if (root) {
    for (const k of appliedDesignTokenKeys) root.style.removeProperty(k);
  }
  appliedDesignTokenKeys = [];
  if (!flat || !root) return;
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

// The semantic tokens we actively write on the board. Everything else in the
// SemanticTokens shape (washes, dot-grid, glass) stays at :root so the page
// background and chrome don't repaint.
const BOARD_SCOPED_SEMANTIC: (keyof SemanticTokens)[] = [
  "canvas",
  "surface",
  "surfaceSubtle",
  "surfaceHover",
  "inkPrimary",
  "inkSecondary",
  "inkMuted",
  "borderSoft",
  "borderMedium",
];

function applySemantic(root: HTMLElement, s: SemanticTokens): void {
  for (const key of BOARD_SCOPED_SEMANTIC) {
    root.style.setProperty(semanticToCssVar(key), s[key]);
  }
}

function applyLanes(root: HTMLElement, lanes: ThemeV1["lanes"]): void {
  for (const [kind, tokens] of Object.entries(lanes)) {
    (Object.keys(tokens) as (keyof LaneTokenSet)[]).forEach((slot) => {
      const name = `--lane-${kind}-${laneSlotToKebab(slot)}`;
      root.style.setProperty(name, tokens[slot]);
    });
  }
}

/** Apply theme.v1 to the framework board (CSS variables + optional Google Fonts). */
export function applyTheme(theme: ThemeV1, target?: HTMLElement | null): void {
  const root = boardTarget(target);
  if (!root) return;

  applySemantic(root, theme.semantic);
  applyLanes(root, theme.lanes);

  // Google Fonts link is global (head). That's OK — a Google Font being
  // available doesn't apply it anywhere; only --jm-font-sans/mono on an
  // element controls which subtree uses it.
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
      `"${name}", ui-sans-serif, system-ui, sans-serif`,
    );
  }

  if (theme.fonts?.monoStack) {
    root.style.setProperty("--jm-font-mono", theme.fonts.monoStack);
  } else if (theme.fonts?.monoGoogle) {
    const name = theme.fonts.monoGoogle.replace(/\+/g, " ");
    root.style.setProperty(
      "--jm-font-mono",
      `"${name}", ui-monospace, monospace`,
    );
  }
}

function setFontFamilyVar(
  root: HTMLElement,
  varName: string,
  value: string | undefined,
  fallbackFamily: "sans" | "mono",
): void {
  root.style.removeProperty(varName);
  if (!value) return;
  const trimmed = value.trim();
  if (/[,"']/.test(trimmed)) {
    root.style.setProperty(varName, trimmed);
    return;
  }
  const tail = fallbackFamily === "sans"
    ? "ui-sans-serif, system-ui, sans-serif"
    : "ui-monospace, monospace";
  root.style.setProperty(varName, `"${trimmed}", ${tail}`);
}

/** Apply a flat DesignSystem to the framework board. */
export function applyDesignSystem(ds: DesignSystem, target?: HTMLElement | null): void {
  const root = boardTarget(target);
  if (!root) return;

  root.style.setProperty("--accent", ds.accent);
  root.style.setProperty("--canvas", ds.canvas);
  root.style.setProperty("--surface", ds.surface);
  root.style.setProperty("--surface-subtle", ds.surfaceSubtle);
  if (ds.surfaceHover) root.style.setProperty("--surface-hover", ds.surfaceHover);
  root.style.setProperty("--ink-primary", ds.inkPrimary);
  root.style.setProperty("--ink-secondary", ds.inkSecondary);
  root.style.setProperty("--ink-muted", ds.inkMuted);
  root.style.setProperty("--border-soft", ds.borderSoft);
  if (ds.borderMedium) root.style.setProperty("--border-medium", ds.borderMedium);

  if (ds.radiusSm) root.style.setProperty("--radius-sm", ds.radiusSm);
  if (ds.radiusMd) root.style.setProperty("--radius-md", ds.radiusMd);
  if (ds.radiusLg) root.style.setProperty("--radius-lg", ds.radiusLg);

  // Typography — Google Font link is global, local CSS vars are scoped.
  removeGoogleFontLinks();
  const googleFamilies: string[] = [];
  const looksLikeGoogleName = (s: string) => !/[,"']/.test(s);
  if (ds.fontSans && looksLikeGoogleName(ds.fontSans)) googleFamilies.push(ds.fontSans);
  if (ds.fontMono && looksLikeGoogleName(ds.fontMono)) googleFamilies.push(ds.fontMono);
  if (googleFamilies.length > 0) {
    const href = buildGoogleFontsHref({
      sansGoogle: googleFamilies[0],
      monoGoogle: googleFamilies[1],
    });
    if (href) upsertGoogleFontLink(href);
  }
  setFontFamilyVar(root, "--jm-font-sans", ds.fontSans, "sans");
  setFontFamilyVar(root, "--jm-font-mono", ds.fontMono, "mono");
}

/** Clear all inline theme overrides from the board element. */
export function clearAppliedTheme(target?: HTMLElement | null): void {
  const root = boardTarget(target);
  removeGoogleFontLinks();
  if (!root) return;
  applyDesignTokenCssVars(undefined, root);
  const toClear = Array.from(root.style);
  for (const k of toClear) {
    if (
      k === "--accent" ||
      k.startsWith("--canvas") ||
      k.startsWith("--surface") ||
      k.startsWith("--ink-") ||
      k.startsWith("--border-") ||
      k.startsWith("--radius-") ||
      k.startsWith("--lane-") ||
      k === "--jm-font-sans" ||
      k === "--jm-font-mono"
    ) {
      root.style.removeProperty(k);
    }
  }
}
