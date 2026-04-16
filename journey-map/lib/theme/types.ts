/** Space-separated R G B triplets (same convention as :root in globals.css). */
export type RgbTriplet = string;

export type LaneTokenSet = {
  accent: RgbTriplet;
  border: RgbTriplet;
  tint: RgbTriplet;
  chipBg: RgbTriplet;
  chipText: RgbTriplet;
  highlightBg: RgbTriplet;
  highlightText: RgbTriplet;
};

export type SemanticTokens = {
  canvas: RgbTriplet;
  surface: RgbTriplet;
  surfaceSubtle: RgbTriplet;
  surfaceHover: RgbTriplet;
  inkPrimary: RgbTriplet;
  inkSecondary: RgbTriplet;
  inkMuted: RgbTriplet;
  borderSoft: RgbTriplet;
  borderMedium: RgbTriplet;
  shadowTint: RgbTriplet;
  washNorth: RgbTriplet;
  washEast: RgbTriplet;
  washSouthWest: RgbTriplet;
  dotGrid: RgbTriplet;
  glassSurface: RgbTriplet;
  glassBorder: RgbTriplet;
  glassInset: RgbTriplet;
};

export type FontTokens = {
  /** Google Fonts family name for sans (e.g. "Inter"). Optional. */
  sansGoogle?: string;
  /** Google Fonts family name for mono (e.g. "JetBrains Mono"). Optional. */
  monoGoogle?: string;
  /** Full font-family stack for sans when not using Google import. */
  sansStack?: string;
  /** Full font-family stack for mono. */
  monoStack?: string;
};

export type ThemeV1 = {
  version: 1;
  semantic: SemanticTokens;
  lanes: Record<string, LaneTokenSet>;
  fonts?: FontTokens;
};

/** Simplified brand input — 3 hex colors + optional fonts.
 *  `deriveTheme()` deterministically produces a full ThemeV1 from this. */
export type BrandInput = {
  primary: string;    // hex — brand anchor (e.g. "#862b00")
  secondary: string;  // hex — surface/background tone (e.g. "#f5f3f0")
  accent: string;     // hex — pop/highlight color (e.g. "#f0a83a")
  sansFont?: string;  // Google Font name (e.g. "DM Sans")
  monoFont?: string;  // Google Font name (e.g. "JetBrains Mono")
};

/**
 * Flat design-system schema — the preferred import shape.
 *
 * Maps 1:1 to CSS variables on :root. Every framework picks these up uniformly
 * because cards/headers/banners all reference `bg-surface`, `text-ink-primary`,
 * `border-border-soft`, `ring-accent`, etc. No per-kind tint palette.
 *
 * Color values accept hex (#f0a, #ff00aa), rgb()/rgba(), or "R G B" triplets.
 * Numeric sizes accept "6px" strings.
 */
export type DesignSystem = {
  version: 1;
  /** Single brand color — selection rings, primary buttons, accent stripe, focus. */
  accent: string;
  // Surfaces (layered hierarchy: canvas < surface-subtle < surface < surface-hover)
  canvas: string;
  surface: string;
  surfaceSubtle: string;
  surfaceHover?: string;
  // Ink (text hierarchy)
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  // Borders
  borderSoft: string;
  borderMedium?: string;
  // Corner radii (CSS length strings like "6px")
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  // Typography
  fontSans?: string;       // Google Font name OR a full font-family stack
  fontMono?: string;
};
