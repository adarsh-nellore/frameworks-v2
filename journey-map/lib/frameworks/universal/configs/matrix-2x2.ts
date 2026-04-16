import type { UniversalMap } from "../types";
import type { FrameworkConfig } from "../config";

// 2×2 Matrix: 2 fixed cols (x-axis: Low/High), 2 fixed rows (y-axis: Low/High).
// Multiple cards stack in each quadrant.
// Meta holds axis labels and polarity descriptions.
const seed: UniversalMap = {
  id: "template",
  title: "Q3 Feature Prioritization",
  meta: {
    xAxisLabel: "Effort",
    xLowLabel: "Low Effort",
    xHighLabel: "High Effort",
    yAxisLabel: "Impact",
    yLowLabel: "Low Impact",
    yHighLabel: "High Impact",
  },
  // Fixed cols: x-axis (Low → High)
  cols: [
    { id: "c1", label: "Low Effort",  kind: "quadrant_low" },
    { id: "c2", label: "High Effort", kind: "quadrant_high" },
  ],
  // Fixed rows: y-axis (High → Low, rendered top→bottom)
  rows: [
    { id: "r1", label: "High Impact", kind: "quadrant_high" },
    { id: "r2", label: "Low Impact",  kind: "quadrant_low" },
  ],
  cards: [
    // Quick Wins (Low Effort, High Impact)
    { id: "k1", colId: "c1", rowId: "r1", text: "**Inline CSV export** from any data table", order: 0 },
    { id: "k2", colId: "c1", rowId: "r1", text: "Keyboard shortcut cheatsheet overlay", order: 1 },
    { id: "k3", colId: "c1", rowId: "r1", text: "==Persistent== filter state between sessions", order: 2 },
    // Big Bets (High Effort, High Impact)
    { id: "k4", colId: "c2", rowId: "r1", text: "AI-powered anomaly detection on dashboards", order: 0 },
    { id: "k5", colId: "c2", rowId: "r1", text: "Real-time collaborative editing", order: 1 },
    // Fill-ins (Low Effort, Low Impact)
    { id: "k6", colId: "c1", rowId: "r2", text: "Additional chart color themes", order: 0 },
    { id: "k7", colId: "c1", rowId: "r2", text: "Rename dashboard from the list view", order: 1 },
    // Avoid (High Effort, Low Impact)
    { id: "k8", colId: "c2", rowId: "r2", text: "Custom domain support for embeds", order: 0 },
    { id: "k9", colId: "c2", rowId: "r2", text: "White-label mobile app", order: 1 },
  ],
};

export const matrix2x2Config: FrameworkConfig = {
  id: "matrix-2x2",
  label: "2×2 Priority Matrix",
  layout: "matrix",
  colNoun: "Column",
  rowNoun: "Row",
  cardNoun: "Item",
  fixedCols: true,
  fixedRows: true,
  heroMetaFields: [
    { key: "xAxisLabel", label: "X Axis", placeholder: "e.g. Effort, Cost, Complexity" },
    { key: "yAxisLabel", label: "Y Axis", placeholder: "e.g. Impact, Value, Urgency" },
  ],
  seed,
  exampleInstructions: [
    "Move 'AI anomaly detection' to Quick Wins — we have a library for it now",
    "Add three more items to the Big Bets quadrant from our roadmap",
    "Rename the axes to 'Cost' and 'Revenue Impact'",
    "Clear the Avoid quadrant and repopulate with deferred items",
  ],
  chatPlaceholder: "Reshape the priority matrix…",
  chatSubtitle: "Editing items across four quadrants",
  structuringPrompt: `
You are building a **2×2 Priority Matrix** — a 2-column × 2-row grid that maps items against two axes to surface prioritization decisions.

**Canonical structure**: 2 cols × 2 rows. Honor this unless the user explicitly asks to extend (e.g. "make it 3×3", "add a middle band"); then allow addCol/addRow.

**Col = X-axis**: The horizontal axis (e.g. Effort, Cost, Complexity).
- c1 = Low (left column)
- c2 = High (right column)

**Row = Y-axis**: The vertical axis (e.g. Impact, Value, Urgency).
- r1 = High (top row) — the desirable end
- r2 = Low (bottom row)

**The four quadrants** (conventional names — feel free to relabel):
- c1·r1 (Low/High) = "Quick Wins" — do first
- c2·r1 (High/High) = "Big Bets" — invest carefully
- c1·r2 (Low/Low)  = "Fill-ins" — do if capacity allows
- c2·r2 (High/Low) = "Avoid" — deprioritize or kill

**Card density**: Each quadrant typically holds 2–6 items. Cards are the items being prioritized.

**Axis meta**: Use \`setMapMeta\` with keys \`xAxisLabel\`, \`xLowLabel\`, \`xHighLabel\`, \`yAxisLabel\`, \`yLowLabel\`, \`yHighLabel\` to describe the axes.
  `.trim(),
};
