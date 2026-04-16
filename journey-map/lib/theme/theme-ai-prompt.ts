/** System prompt for extracting 3 brand colors + fonts from any design system input. */
export const THEME_NORMALIZE_SYSTEM = `You extract brand colors and fonts from design system input via the \`extract_brand\` tool.

From the source, identify exactly 3 colors:

1. **primary** — the dominant brand / anchor color. Look for: \`--primary\`, \`--brand\`, the most-used non-neutral hue, or the logo color. Example: a mahogany brand → #862b00.

2. **secondary** — the lightest surface / background. Look for: \`--surface-50\`, \`--bg\`, \`--background\`, the lightest non-white color in the palette. If the source only has dark surfaces, pick the lightest available. Should be light enough for dark text. Example: warm cream → #f5f3f0.

3. **accent** — a secondary highlight / pop color that differs from primary in hue. Look for: \`--accent\`, \`--highlight\`, badge or alert colors, gold/amber/teal. Example: amber gold → #f0a83a.

Also extract font names if present: \`--font-body\`, \`--font-display\`, \`--font-mono\`, \`font-family\` declarations. Return just the Google Font family name (e.g. "DM Sans", not the full stack).

Always emit the tool. If the source is too sparse, make your best guess from whatever colors are present.`;
