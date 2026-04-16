/**
 * Deterministic theme derivation from 3 brand colors + fonts.
 * Pure math — no AI, no network. Runs client-side for live preview.
 */

import { hexToHsl, hslToTriplet, shiftHue } from "./color-math";
import type {
  BrandInput,
  FontTokens,
  LaneTokenSet,
  SemanticTokens,
  ThemeV1,
} from "./types";

// Lane hue derivation: each lane gets a hue from the brand palette.
// H_p = primary hue, H_a = accent hue, H_s = secondary hue.
type LaneHueConfig = {
  hue: (hp: number, ha: number, hs: number) => number;
  sat: number; // base saturation (0-100)
};

const LANE_HUES: Record<string, LaneHueConfig> = {
  actions:       { hue: (hp) => hp, sat: 65 },
  touchpoints:   { hue: (hp) => shiftHue(hp, 80), sat: 55 },
  thoughts:      { hue: (_hp, ha) => ha, sat: 60 },
  emotions:      { hue: (hp) => shiftHue(hp, 330), sat: 55 },
  pain_points:   { hue: () => 0, sat: 60 },
  opportunities: { hue: () => 145, sat: 55 },
  metrics:       { hue: (hp) => shiftHue(hp, 180), sat: 50 },
  stakeholders:  { hue: (hp) => shiftHue(hp, 240), sat: 50 },
  systems:       { hue: (_hp, _ha, hs) => hs, sat: 10 },
  channels:      { hue: (_hp, ha) => shiftHue(ha, 180), sat: 50 },
  decisions:     { hue: (hp) => shiftHue(hp, 300), sat: 45 },
  artifacts:     { hue: (hp) => hp, sat: 15 },
  neutral:       { hue: (_hp, _ha, hs) => hs, sat: 8 },
};

function deriveLane(h: number, baseSat: number): LaneTokenSet {
  const s = baseSat;
  // Key insight: the shipped defaults use ~100% saturation at ~97% lightness
  // for tints. Low saturation at high lightness = gray, not a tinted pastel.
  // Keep saturation HIGH and lightness HIGH for tints/chips/highlights.
  return {
    accent:        hslToTriplet(h, s, 42),
    border:        hslToTriplet(h, s * 0.8, 70),
    tint:          hslToTriplet(h, s * 0.95, 97),
    chipBg:        hslToTriplet(h, s * 0.85, 93),
    chipText:      hslToTriplet(h, s * 0.9, 30),
    highlightBg:   hslToTriplet(h, s * 0.75, 85),
    highlightText: hslToTriplet(h, s * 0.85, 22),
  };
}

function deriveSemantic(
  primary: [number, number, number],
  secondary: [number, number, number],
  accent: [number, number, number]
): SemanticTokens {
  const [hp, sp] = primary;
  const [hs, ss, ls] = secondary;
  const [ha, sa] = accent;

  // Surfaces from secondary hue.
  const canvas =        hslToTriplet(hs, ss * 0.3, Math.min(ls + 2, 98));
  const surface =       hslToTriplet(hs, ss * 0.4, ls);
  const surfaceSubtle = hslToTriplet(hs, ss * 0.35, Math.max(ls - 2, 85));
  const surfaceHover =  hslToTriplet(hs, ss * 0.3, Math.max(ls - 5, 80));

  // Ink from primary hue darkened.
  const inkPrimary =   hslToTriplet(hp, sp * 0.3, 10);
  const inkSecondary = hslToTriplet(hp, sp * 0.2, 20);
  const inkMuted =     hslToTriplet(hs, ss * 0.15, 55);

  // Borders from secondary.
  const borderSoft =   hslToTriplet(hs, ss * 0.15, 88);
  const borderMedium = hslToTriplet(hs, ss * 0.15, 80);

  // Washes — subtle brand tints in the background.
  const washNorth =     hslToTriplet(hp, 15, 88);
  const washEast =      hslToTriplet(ha, 15, 90);
  const washSouthWest = hslToTriplet(shiftHue(hp, 90), 12, 89);

  const shadowTint = inkPrimary;
  const dotGrid = inkPrimary;

  return {
    canvas,
    surface,
    surfaceSubtle,
    surfaceHover,
    inkPrimary,
    inkSecondary,
    inkMuted,
    borderSoft,
    borderMedium,
    shadowTint,
    washNorth,
    washEast,
    washSouthWest,
    dotGrid,
    glassSurface: surface,
    glassBorder: surface,
    glassInset: surface,
  };
}

/**
 * Derive a complete ThemeV1 from 3 hex colors + optional fonts.
 * Pure function — deterministic, instant, no side effects.
 */
export function deriveTheme(brand: BrandInput): ThemeV1 {
  const primary = hexToHsl(brand.primary);
  const secondary = hexToHsl(brand.secondary);
  const accent = hexToHsl(brand.accent);

  const [hp] = primary;
  const [ha] = accent;
  const [hs] = secondary;

  const semantic = deriveSemantic(primary, secondary, accent);

  const lanes: Record<string, LaneTokenSet> = {};
  for (const [kind, config] of Object.entries(LANE_HUES)) {
    const h = config.hue(hp, ha, hs);
    lanes[kind] = deriveLane(h, config.sat);
  }

  const fonts: FontTokens = {};
  if (brand.sansFont) fonts.sansGoogle = brand.sansFont;
  if (brand.monoFont) fonts.monoGoogle = brand.monoFont;

  return {
    version: 1,
    semantic,
    lanes,
    ...(Object.keys(fonts).length ? { fonts } : {}),
  };
}
