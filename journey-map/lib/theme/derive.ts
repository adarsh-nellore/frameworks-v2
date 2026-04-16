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
  // Journey-map lanes
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

  // JTBD canvas — role lanes derive from brand, valence lanes keep semantic hues.
  functional_jobs:   { hue: (hp) => shiftHue(hp, 180), sat: 55 },
  emotional_jobs:    { hue: (hp) => shiftHue(hp, 330), sat: 55 },
  social_jobs:       { hue: (hp) => shiftHue(hp, 280), sat: 55 },
  desired_outcomes:  { hue: () => 145, sat: 55 },
  current_solutions: { hue: (hp) => shiftHue(hp, 250), sat: 50 },
  context_triggers:  { hue: (_hp, ha) => shiftHue(ha, 180), sat: 55 },
  hiring_criteria:   { hue: () => 145, sat: 50 },
  firing_criteria:   { hue: () => 0, sat: 55 },

  // Affinity
  observation:       { hue: (hp) => hp, sat: 55 },
  quote:             { hue: (_hp, ha) => ha, sat: 60 },
  insight:           { hue: (_hp, ha) => ha, sat: 60 },
  need:              { hue: () => 0, sat: 55 },
  theme:             { hue: (_hp, _ha, hs) => hs, sat: 15 },
  ungrouped:         { hue: (_hp, _ha, hs) => hs, sat: 5 },

  // Competitive map
  subject:           { hue: (hp) => hp, sat: 55 },
  competitor:        { hue: (_hp, _ha, hs) => hs, sat: 10 },
  criterion:         { hue: (_hp, _ha, hs) => hs, sat: 12 },

  // Matrix quadrants (valence: high = positive, low = muted)
  quadrant_high:     { hue: () => 145, sat: 55 },
  quadrant_low:      { hue: (_hp, _ha, hs) => hs, sat: 10 },
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
  const [hs, ss] = secondary;
  void accent;

  // KEY FIX — previously we let the secondary's raw lightness drive the
  // surface tokens, which meant a dark secondary → surface/canvas/subtle
  // collapse into the same dark color and ink stays at L12 → unreadable
  // dark-on-dark. The board is a LIGHT canvas by design. The secondary only
  // contributes hue + a heavily damped saturation. Surface lightnesses are
  // fixed so the hierarchy canvas < subtle < hover < surface is always
  // visible, and ink always reads on top.
  const surface =       hslToTriplet(hs, Math.min(ss * 0.06, 4),  100);
  const canvas =        hslToTriplet(hs, Math.min(ss * 0.10, 6),  98);
  const surfaceSubtle = hslToTriplet(hs, Math.min(ss * 0.12, 8),  96);
  const surfaceHover =  hslToTriplet(hs, Math.min(ss * 0.14, 10), 92);

  // Ink from primary hue but fixed-lightness so contrast is guaranteed.
  const inkPrimary =   hslToTriplet(hp, Math.min(sp * 0.25, 15), 12);
  const inkSecondary = hslToTriplet(hp, Math.min(sp * 0.18, 12), 28);
  const inkMuted =     hslToTriplet(hp, Math.min(sp * 0.10, 8),  56);

  const borderSoft =   hslToTriplet(hs, Math.min(ss * 0.15, 10), 90);
  const borderMedium = hslToTriplet(hs, Math.min(ss * 0.18, 12), 82);

  // These four are NOT painted onto [data-map-page]. The scoped applier skips
  // them so the page background/washes stay on their :root defaults and don't
  // change when a brand is applied. We keep the values here for callers that
  // still want a full SemanticTokens object (e.g. theme.v1 export back-compat).
  const washNorth = hslToTriplet(hp, 12, 90);
  const washEast = hslToTriplet(hp, 10, 92);
  const washSouthWest = hslToTriplet(shiftHue(hp, 90), 8, 91);

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
    shadowTint: inkPrimary,
    washNorth,
    washEast,
    washSouthWest,
    dotGrid: inkPrimary,
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
