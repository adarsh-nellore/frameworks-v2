import { DEFAULT_LANES, DEFAULT_SEMANTIC, DEFAULT_THEME_V1 } from "./defaults";
import type { LaneTokenSet, SemanticTokens, ThemeV1 } from "./types";

/**
 * Last-resort fill — accepts any partial or malformed theme and returns a
 * fully-populated ThemeV1. The server calls this if the AI tool output is
 * somehow incomplete despite the schema forcing all required fields.
 *
 * Guarantees the endpoint never returns a partial theme.
 */
export function fillThemeDefaults(
  partial: Partial<ThemeV1> | null | undefined
): ThemeV1 {
  const semantic: SemanticTokens = {
    ...DEFAULT_SEMANTIC,
    ...(partial?.semantic ?? {}),
  };

  const lanes: Record<string, LaneTokenSet> = { ...DEFAULT_LANES };
  if (partial?.lanes) {
    for (const [kind, val] of Object.entries(partial.lanes)) {
      if (typeof val === "object" && val !== null) {
        lanes[kind] = {
          ...(lanes[kind] ??
            DEFAULT_LANES.neutral ??
            DEFAULT_LANES.actions),
          ...val,
        };
      }
    }
  }

  return {
    version: 1,
    semantic,
    lanes,
    fonts: partial?.fonts ?? DEFAULT_THEME_V1.fonts,
  };
}
