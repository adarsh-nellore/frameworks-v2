import type { UniversalMap } from "../types";
import type { FrameworkConfig } from "../config";

// Affinity Diagram: themes are cols, card types are rows.
// Cards stack within each (theme, cardType) cell.
// Cards without a theme go in col "c0" (ungrouped).
const seed: UniversalMap = {
  id: "template",
  title: "User Research Synthesis",
  meta: { context: "Discovery interviews: regulatory affairs professionals using FDA monitoring tools" },
  cols: [
    { id: "c0", label: "Ungrouped",              kind: "ungrouped" },
    { id: "c1", label: "Signal vs. Noise",        kind: "theme" },
    { id: "c2", label: "Workflow Integration",     kind: "theme" },
    { id: "c3", label: "Trust & Reliability",     kind: "theme" },
    { id: "c4", label: "Organizational Dynamics", kind: "theme" },
  ],
  rows: [
    { id: "r1", label: "Observation", kind: "observation" },
    { id: "r2", label: "Quote",       kind: "quote" },
    { id: "r3", label: "Insight",     kind: "insight" },
    { id: "r4", label: "Need",        kind: "need" },
  ],
  cards: [
    // Signal vs. Noise
    { id: "k1", colId: "c1", rowId: "r1", text: "Users receive ==40–120== emails/week from FDA and RAPS subscriptions", order: 0 },
    { id: "k2", colId: "c1", rowId: "r2", text: "\"I spend more time filtering alerts than acting on them\"", order: 0 },
    { id: "k3", colId: "c1", rowId: "r3", text: "High **email volume** trains users to ignore regulatory alerts — the tool that cried wolf", order: 0 },
    { id: "k4", colId: "c1", rowId: "r4", text: "Need relevance filtering by product code before alerts reach the inbox", order: 0 },

    // Workflow Integration
    { id: "k5", colId: "c2", rowId: "r1", text: "Regulatory monitoring happens in parallel to submission work — not integrated", order: 0 },
    { id: "k6", colId: "c2", rowId: "r2", text: "\"I check FDA.gov manually every Monday because I don't trust the alerts\"", order: 0 },
    { id: "k7", colId: "c2", rowId: "r3", text: "Manual Monday checks are a **compensating behavior** — a symptom of tool mistrust", order: 0 },
    { id: "k8", colId: "c2", rowId: "r4", text: "Need monitoring that surfaces changes at the moment they affect active submissions", order: 0 },

    // Trust & Reliability
    { id: "k9",  colId: "c3", rowId: "r1", text: "Users who received a false positive stopped reading alerts for ==2+ weeks==", order: 0 },
    { id: "k10", colId: "c3", rowId: "r2", text: "\"Once it missed something important, I stopped relying on it entirely\"", order: 0 },
    { id: "k11", colId: "c3", rowId: "r3", text: "Trust is binary — one miss or false positive collapses the entire **adoption**", order: 0 },
    { id: "k12", colId: "c3", rowId: "r4", text: "Need precision over recall: better to surface fewer but always-relevant changes", order: 0 },

    // Organizational Dynamics
    { id: "k13", colId: "c4", rowId: "r1", text: "RA professionals brief their managers on regulatory changes weekly", order: 0 },
    { id: "k14", colId: "c4", rowId: "r2", text: "\"My director asks me every Monday what changed — I need to be prepared\"", order: 0 },
    { id: "k15", colId: "c4", rowId: "r3", text: "The job performer is accountable upward — **visibility** to leadership drives urgency", order: 0 },

    // Ungrouped
    { id: "k16", colId: "c0", rowId: "r1", text: "Users at small companies wear multiple hats — RA is one of several roles", order: 0 },
  ],
};

export const affinityDiagramConfig: FrameworkConfig = {
  id: "affinity-diagram",
  label: "Affinity Diagram",
  layout: "kanban",
  colNoun: "Theme",
  rowNoun: "Card Type",
  cardNoun: "Card",
  fixedRows: true,
  heroMetaFields: [
    { key: "context", label: "Research Context", placeholder: "What research generated these cards?" },
  ],
  seed,
  exampleInstructions: [
    "Split 'Organizational Dynamics' into 'Upward Visibility' and 'Team Collaboration'",
    "Move all quotes from the ungrouped col into the most appropriate themes",
    "Add a new theme 'Tool Expectations' and populate it from existing cards",
    "Merge 'Trust & Reliability' into 'Signal vs. Noise'",
  ],
  chatPlaceholder: "Reorganize the themes…",
  chatSubtitle: "Editing themes, observations, quotes, insights, needs",
  structuringPrompt: `
You are building an **Affinity Diagram** — a synthesis artifact that groups raw research data (observations, quotes, insights, needs) into emergent themes.

**Col = Theme**: A named cluster of related ideas (e.g. "Signal vs. Noise", "Workflow Integration"). Themes should be noun phrases, not categories — they describe a *finding*, not a container. Use \`kind: "theme"\` for themes and \`kind: "ungrouped"\` for the holding area.

There is always one ungrouped col (\`c0\`, kind: \`"ungrouped"\`) for cards that haven't been assigned yet. Do not remove it.

**Row = Card Type** (fixed — do not add or remove rows):
- r1 = observation  — a behavioral fact observed in research
- r2 = quote        — a verbatim participant statement (use quotation marks)
- r3 = insight      — an interpreted pattern or "so what" (not a quote)
- r4 = need         — a latent or expressed need, framed as "need to X"

**Card quality**:
- **Atomic**: One idea per card. Do not combine two distinct points.
- **Preserve voice**: Quotes should be verbatim or very close to verbatim. Wrap in "double quotes".
- **Insights are interpretations**: They go beyond what was observed — they state the implication.
- **Needs are forward-facing**: "Need to X" not "Pain with Y".
- **Source attribution** is encouraged: include participant role or source reference if known.

**Theme naming**: Name themes for what they mean, not what they contain ("Trust is binary" not "Trust Issues").

**Card density**: Themes typically hold 3–8 cards across types. Observations and quotes first; insights and needs emerge from them.
  `.trim(),
};
