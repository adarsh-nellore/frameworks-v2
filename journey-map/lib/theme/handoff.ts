import type { ThemeV1 } from "./types";
import { DEFAULT_THEME_V1 } from "./defaults";
import { serializeTheme } from "./storage";

const README = `Journey Map handoff bundle
===========================

This archive contains:

1. **map.json** — Journey map data (stages, rows, cells). Import into the app via "JSON" copy flow or replace seed.
2. **theme.v1.json** — Design tokens (semantic colors, lane palettes, optional Google Font names). Import via Theme → Import in the app.

CSS variables
-------------

The app maps \`theme.v1.json\` to CSS custom properties on \`:root\`:

- Semantic keys like \`semantic.inkPrimary\` become \`--ink-primary\` (space-separated R G B triplets, e.g. \`"40 42 47"\`).
- Lane keys like \`lanes.actions.tint\` become \`--lane-actions-tint\`.

Tailwind classes in the app use \`rgb(var(--token) / <opacity>)\` for chrome; row cards use \`--lane-{kind}-*\` variables.

To reuse in another codebase, mirror the same variable names in your global CSS or map them into your token pipeline (Style Dictionary, Figma Tokens, etc.).
`;

export type HandoffBundle = {
  readme: string;
  mapJson: string;
  themeJson: string;
};

export function buildHandoffBundle(
  map: unknown,
  theme: ThemeV1 | null
): HandoffBundle {
  const t = theme ?? DEFAULT_THEME_V1;
  return {
    readme: README,
    mapJson: JSON.stringify(map, null, 2),
    themeJson: serializeTheme(t),
  };
}

/** Single JSON file for easy download (no zip dependency). */
export function buildHandoffJson(map: unknown, theme: ThemeV1 | null): string {
  const b = buildHandoffBundle(map, theme);
  return JSON.stringify(
    {
      version: 1,
      readme: b.readme,
      map: JSON.parse(b.mapJson),
      theme: JSON.parse(b.themeJson),
    },
    null,
    2
  );
}
