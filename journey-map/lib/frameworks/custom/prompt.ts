import type { FrameworkConfig } from "../universal/config";
import {
  journeyMapConfig,
  matrix2x2Config,
  competitiveMapConfig,
  jtbdCanvasConfig,
  affinityDiagramConfig,
  processMapConfig,
} from "../universal";

// ──────────────────────────────────────────────────────────────────────────────
// System prompt for the propose_framework tool.
//
// Strategy: the LLM already knows thousands of frameworks (SWOT, RACI, Porter's,
// Kano, Ansoff, BCG, Ikigai, Value Prop, 5 Whys, Empathy, Service Blueprint…).
// We don't need to teach the domain. We need to teach the OUTPUT SHAPE — what
// a FrameworkConfig looks like — and give the model a decision rubric for
// picking a layout + dimensions + structuringPrompt style.
//
// The few-shots are SHAPE-spanning (not domain-spanning): they cover every
// layout × every constraint combo × a range of col/row counts and optional
// fields. Live configs are serialized at module-load time so they can't drift.
// Three synthetic few-shots are added for variety: SWOT, Card Sort, Stakeholder
// Map. These live inside this file to keep the prompt self-contained.
// ──────────────────────────────────────────────────────────────────────────────

// Strip universal-op references from a structuringPrompt before serializing it
// as a few-shot. The live configs (journey-map, matrix-2x2, ...) predate this
// constraint and mention setMapMeta / addRow by name in places; if we copy
// them verbatim, the agent patterns after that leak and the validator rejects
// the resulting config. We replace those instructions with neutral language.
function stripOpMentions(prompt: string): string {
  return prompt
    // "Use setMapMeta with key X to set Y" → "Record X via the Y hero field"
    .replace(
      /Use\s+`?setMapMeta`?\s+with\s+keys?\s+([^.]+?)\s+to\s+([^.]+)\./gi,
      "Record $2 in the hero meta field(s) $1."
    )
    // Generic mentions: "use `addCard`" / "via `moveRow`" → drop the op, keep the noun
    .replace(
      /\b(use|via|with)\s+`?(addCard|addCol|addRow|removeCard|removeCol|removeRow|renameCol|renameRow|moveCard|moveCol|moveRow|editCard|reparentCard|setCardMeta|setMapMeta)`?\s*/gi,
      "$1 the corresponding action "
    )
    // Final safety net: if any bare op name survives, replace with neutral token.
    .replace(
      /\b(addCard|addCol|addRow|removeCard|removeCol|removeRow|renameCol|renameRow|moveCard|moveCol|moveRow|editCard|reparentCard|setCardMeta|setMapMeta)\b/g,
      "the relevant operation"
    );
}

// Trim a live config down to just the shape the LLM needs to copy.
// Drops bulky seed.cards so we don't waste tokens on example content.
function serializeFewShot(cfg: FrameworkConfig): unknown {
  return {
    id: cfg.id.startsWith("custom-") ? cfg.id : `custom-${cfg.id}`,
    label: cfg.label,
    layout: cfg.layout,
    colNoun: cfg.colNoun,
    rowNoun: cfg.rowNoun,
    cardNoun: cfg.cardNoun,
    ...(cfg.fixedCols ? { fixedCols: true } : {}),
    ...(cfg.fixedRows ? { fixedRows: true } : {}),
    ...(cfg.cardMetaFields ? { cardMetaFields: cfg.cardMetaFields } : {}),
    ...(cfg.heroMetaFields ? { heroMetaFields: cfg.heroMetaFields } : {}),
    ...(cfg.chatPlaceholder ? { chatPlaceholder: cfg.chatPlaceholder } : {}),
    ...(cfg.chatSubtitle ? { chatSubtitle: cfg.chatSubtitle } : {}),
    ...(cfg.connectors ? { connectors: cfg.connectors } : {}),
    structuringPrompt: stripOpMentions(cfg.structuringPrompt),
    exampleInstructions: cfg.exampleInstructions.slice(0, 3),
    seed: {
      id: `${cfg.id}-seed`,
      title: cfg.seed.title,
      meta: {},
      cols: cfg.seed.cols.map((c) => ({
        id: c.id,
        label: c.label,
        ...(c.kind ? { kind: c.kind } : {}),
      })),
      rows: cfg.seed.rows.map((r) => ({
        id: r.id,
        label: r.label,
        ...(r.kind ? { kind: r.kind } : {}),
      })),
      cards: [],
    },
  };
}

// Three synthetic few-shots covering common patterns the live configs don't hit.
const SWOT_SHOT: unknown = {
  id: "custom-swot-analysis",
  label: "SWOT Analysis",
  layout: "matrix",
  colNoun: "Origin",
  rowNoun: "Valence",
  cardNoun: "Finding",
  fixedCols: true,
  fixedRows: true,
  heroMetaFields: [
    { key: "subject", label: "Subject", placeholder: "What are we analyzing? (a team, product, strategy…)" },
  ],
  structuringPrompt:
    "A SWOT analysis maps findings across two binary axes. Col = origin (Internal vs External). Row = valence (Helpful vs Harmful). Each cell holds a distinct group of findings: Strengths (Internal/Helpful), Weaknesses (Internal/Harmful), Opportunities (External/Helpful), Threats (External/Harmful). Cards are short, concrete observations — one insight per card. Use the Subject hero field to record what is being analyzed.",
  exampleInstructions: [
    "Add three strengths about our brand recognition",
    "List the top external threats from new entrants",
    "Move 'team is small' from Strengths to Weaknesses",
  ],
  chatPlaceholder: "Refine the SWOT…",
  chatSubtitle: "Mapping findings across internal/external and helpful/harmful",
  seed: {
    id: "custom-swot-analysis-seed",
    title: "SWOT Analysis",
    meta: {},
    cols: [
      { id: "c1", label: "Internal", kind: "quadrant_low" },
      { id: "c2", label: "External", kind: "quadrant_high" },
    ],
    rows: [
      { id: "r1", label: "Helpful", kind: "quadrant_high" },
      { id: "r2", label: "Harmful", kind: "quadrant_low" },
    ],
    cards: [],
  },
};

const CARD_SORT_SHOT: unknown = {
  id: "custom-card-sort",
  label: "Card Sort",
  layout: "kanban",
  colNoun: "Category",
  rowNoun: "Items",
  cardNoun: "Card",
  fixedRows: true,
  structuringPrompt:
    "A card sort groups items into a small number of categories. Col = category (typically 3–7 named groups plus an 'Ungrouped' catchall). Row = a single implicit bucket (all items share one logical plane). Cards are the items being sorted — keep them short and concrete. Start with a few seed categories plus 'Ungrouped' so the user can move cards in.",
  exampleInstructions: [
    "Add three items under 'Navigation' from the research notes",
    "Move the unclassified items into 'Content'",
    "Rename 'Misc' to 'Support'",
  ],
  chatPlaceholder: "Rearrange the sort…",
  chatSubtitle: "Grouping items into named categories",
  seed: {
    id: "custom-card-sort-seed",
    title: "Card Sort",
    meta: {},
    cols: [
      { id: "c1", label: "Ungrouped", kind: "ungrouped" },
      { id: "c2", label: "Category A", kind: "theme" },
      { id: "c3", label: "Category B", kind: "theme" },
      { id: "c4", label: "Category C", kind: "theme" },
    ],
    rows: [{ id: "r1", label: "Items" }],
    cards: [],
  },
};

const STAKEHOLDER_MAP_SHOT: unknown = {
  id: "custom-stakeholder-map",
  label: "Stakeholder Map",
  layout: "matrix",
  colNoun: "Influence",
  rowNoun: "Interest",
  cardNoun: "Stakeholder",
  fixedCols: true,
  fixedRows: true,
  heroMetaFields: [
    { key: "xAxisLabel", label: "X Axis", placeholder: "Influence (Low → High)" },
    { key: "yAxisLabel", label: "Y Axis", placeholder: "Interest (Low → High)" },
  ],
  cardMetaFields: [
    {
      key: "role",
      label: "Role",
      type: "select",
      options: ["executive", "operator", "customer", "partner", "regulator"],
      nullable: true,
    },
  ],
  structuringPrompt:
    "A stakeholder map places people or groups on a 2×2 by their influence over an initiative (x-axis) and their interest in the outcome (y-axis). The four quadrants suggest an engagement strategy: High/High = manage closely; High/Low = keep satisfied; Low/High = keep informed; Low/Low = monitor. Cards are individual stakeholders; use the Role meta field to tag how they're positioned.",
  exampleInstructions: [
    "Add our CFO and their peers to High Influence / High Interest",
    "Move 'Legal team' down to Low Interest now that the policy is settled",
    "Tag all customer stakeholders with role=customer",
  ],
  chatPlaceholder: "Place stakeholders on the map…",
  chatSubtitle: "Mapping people by influence and interest",
  seed: {
    id: "custom-stakeholder-map-seed",
    title: "Stakeholder Map",
    meta: {},
    cols: [
      { id: "c1", label: "Low Influence", kind: "quadrant_low" },
      { id: "c2", label: "High Influence", kind: "quadrant_high" },
    ],
    rows: [
      { id: "r1", label: "High Interest", kind: "quadrant_high" },
      { id: "r2", label: "Low Interest", kind: "quadrant_low" },
    ],
    cards: [],
  },
};

// Assembled list: 6 live configs (span every layout + constraint combo, plus
// process-map which demonstrates connectors: enabled) + 3 synthetics.
function fewShots(): unknown[] {
  return [
    serializeFewShot(journeyMapConfig),       // grid, both axes dynamic
    serializeFewShot(matrix2x2Config),        // matrix, fixedCols + fixedRows
    serializeFewShot(competitiveMapConfig),   // matrix, dynamic (rare but valid)
    serializeFewShot(jtbdCanvasConfig),       // kanban, 1 row, dynamic cols
    serializeFewShot(affinityDiagramConfig),  // kanban with explicit row groupings
    serializeFewShot(processMapConfig),       // grid + connectors: enabled (flow/process)
    SWOT_SHOT,
    CARD_SORT_SHOT,
    STAKEHOLDER_MAP_SHOT,
  ];
}

export function buildDescribeSystemPrompt(): string {
  const shots = fewShots()
    .map((s, i) => `Example ${i + 1}:\n${JSON.stringify(s, null, 2)}`)
    .join("\n\n---\n\n");

  return `
You are a framework architect. Your job: given a short natural-language description of a framework the user wants, return a valid FrameworkConfig object via the propose_framework tool. The framework will be rendered by a universal grid system — every framework is cols × rows → cards, with four layout flavors (grid / kanban / matrix / freeform).

You are NOT writing framework content. The seed you return has empty cards. A separate step will populate the seed with realistic example content after your config is validated.

## Output contract (field-by-field)

- **id**: kebab-case slug starting with "custom-" (e.g. "custom-swot-analysis"). 3–40 chars after the prefix.
- **label**: display name, ≤40 chars, capitalized naturally (e.g. "SWOT Analysis").
- **layout**: one of \`"grid" | "kanban" | "matrix" | "freeform"\` — see decision rules below.
- **colNoun / rowNoun / cardNoun**: singular labels used in UI buttons and agent prompts. ≤20 chars each. Examples: "Stage" / "Lane" / "Card", "Competitor" / "Criterion" / "Assessment", "Quadrant" / "Quadrant" / "Item".
- **fixedCols / fixedRows**: set to \`true\` when the structure should be locked (the "Add column" affordance disappears). See layout rules.
- **structuringPrompt**: 3–6 sentences explaining what col, row, and card MEAN in this framework. This text is appended to the universal system prompt whenever the agent works on this framework. DO NOT mention universal ops like addCard, moveRow, setCardMeta — the universal prompt already explains those. Focus on semantics: "Col = X", "Row = Y", "Card = Z", any fixed interpretations of specific quadrants, optional meta fields.
- **exampleInstructions**: 2–5 short suggestion pills shown in the copilot UI. Each is a concrete, framework-appropriate action the user might ask the agent to do (e.g. "Add three competitors to the Low Price / High Quality quadrant").
- **chatPlaceholder / chatSubtitle**: optional UI copy.
- **cardMetaFields**: optional per-card select fields that render as cycling buttons on every card. Use sparingly — only when a taxonomy would genuinely help the user.
- **heroMetaFields**: optional top-level text fields rendered as a banner above the grid. Use for axis labels on matrix layouts, personas, subject lines, etc.
- **seed**: \`{ id, title, meta: {}, cols: [...], rows: [...], cards: [] }\`. Col ids MUST be \`c1, c2, c3, …\` in order. Row ids MUST be \`r1, r2, r3, …\` in order. Cards MUST be empty.

## Layout decision rules

**Pick \`matrix\` when**:
- The framework is defined by TWO semantic axes (x and y each mean something).
- Dimensions are small and fixed (typically 2×2; up to ~5×5 for things like competitive maps).
- Examples: SWOT, 2×2 priority, Eisenhower, BCG Matrix, Kano, Ansoff, Impact/Effort, Risk Matrix, Stakeholder Map.
- Required: set \`fixedCols: true\` AND \`fixedRows: true\`. At least 2 cols AND 2 rows. Consider heroMetaFields for axis labels.

**Pick \`kanban\` when**:
- The framework has ONE meaningful axis (categories) and cards are sorted into those categories.
- There is no meaningful second axis — everything shares one logical plane.
- Examples: card sort, JTBD sections, affinity themes, empathy map sections, MoSCoW bucketing.
- Required: exactly 1 row (\`rows: [{ id: "r1", label: "Items" }]\` or similar), \`fixedRows: true\`. Cols can be fixed or dynamic.

**Pick \`grid\` when**:
- Both axes are meaningful AND at least one is dynamic (the user adds more as they work).
- The map is sparse OR semi-dense — not every (col, row) cell must be populated.
- Examples: journey map, service blueprint, user story map, RACI matrix (fixed cols = R/A/C/I, dynamic rows = tasks), most timeline-by-lens frameworks.
- Both \`fixedCols\` and \`fixedRows\` typically false.
- **Mixed case**: if exactly one axis is fixed (e.g. RACI has a fixed set of 4 role cols but tasks grow over time), use \`grid\` and set ONLY the fixed axis's flag (\`fixedCols: true\` with dynamic rows, or vice versa). Do NOT use \`matrix\` — matrix requires BOTH axes fixed.

**Pick \`freeform\` when**:
- The framework is a true unstructured canvas — a brainstorm, a mind map, a loose affinity wall, a free-positioned workspace.
- Content is deliberately NOT tabular: cards relate to each other spatially rather than by a shared column/row structure.
- Examples: mind map, brainstorm board, free affinity wall, sticky-note canvas.
- **Do NOT pick freeform** for structured frameworks that have a recognizable tabular shape underneath (Double Diamond, Venn, Kano, SWOT, funnel, concentric rings). Those belong in kanban or matrix with \`chrome\` (see next section) — freeform content organization is chaotic at scale and looks worse than a clean tabular layout.

## Chrome (decorative SVG over tabular layouts)

For frameworks with a recognizable visual shape but tabular content, use a kanban (or matrix) layout plus \`chrome\`. Chrome is a named SVG banner rendered behind the column headers; it signals the framework's identity without interfering with card organization.

Available chrome kinds (set via \`chrome: { kind: "<kind>", ... }\` on the config):

- \`"double-diamond"\` — two rhombi for Problem Space → Solution Space. Use with 4 cols (Discover/Define/Develop/Deliver). Optional \`leftLabel\`, \`rightLabel\`.
- \`"venn"\` — N overlapping circles behind the columns (one per col). Use with 2-5 cols, for Venn diagrams, Ikigai, set-intersection frameworks. Optional \`circles: string[]\` for labels per circle.
- \`"kano-curve"\` — a rising-then-plateauing satisfaction curve. Use with 3 cols (Basics / Performance / Delighters).
- \`"funnel"\` — trapezoidal wide-to-narrow shape. Use for conversion funnels, filtering pipelines.
- \`"concentric"\` — nested circles. Use for onion models, stakeholder ring maps, maturity rings.

Pick chrome when the framework's name evokes a shape. Skip chrome for regular tabular frameworks (SWOT, BCG, JTBD, journey map, etc.) — they don't need it.

## structuringPrompt guidance

- 3–6 sentences. Concrete and specific to THIS framework.
- Tell the agent what each axis means semantically.
- If there are fixed cells with canonical names (e.g. SWOT's 4 quadrants), enumerate them.
- If there are row "kinds" (semantic tags like "actions", "pain_points") that theme the cards, mention them.
- Mention any hero meta fields and what they hold.
- Never mention op names. Never include pseudocode.

## Design rubric (for novel frameworks the examples don't cover)

If the user describes something unfamiliar, reason from first principles:

1. **One axis or two?** If everything naturally sorts into a single set of named buckets → kanban. If there's a conceptual X and Y → matrix or grid.
2. **Fixed or dynamic?** If the framework has a canonical number of cells (2×2, a fixed set of named stages) → fixed. If the user adds more as they work → dynamic.
3. **What is a card?** A finding, a stakeholder, a quote, a competitor, an action, an item? Pick the word that fits.
4. **What's the nearest well-known analogue?** Adapt from that.

## Non-grid frameworks — prefer chrome over freeform

- Venn diagram → kanban with \`chrome: { kind: "venn", circles: [labels] }\`. Cols = sets.
- Double Diamond → kanban with \`chrome: { kind: "double-diamond" }\`. Cols = Discover/Define/Develop/Deliver.
- Kano Model → kanban with \`chrome: { kind: "kano-curve" }\`. Cols = Basics/Performance/Delighters.
- Conversion funnel → kanban with \`chrome: { kind: "funnel" }\`. Cols = funnel stages top-to-bottom.
- Concentric rings (onion) → kanban with \`chrome: { kind: "concentric" }\`. Cols = rings inner-to-outer.
- Mind map / brainstorm → freeform. No chrome; cards cluster by col tag.
- Flowchart / process map / workflow / service blueprint → grid with phases as cols, swimlanes as rows. **MUST set \`connectors: { enabled: true, defaultRouting: "orthogonal" }\`** so the populate step draws arrows between steps. See the process-map example.
  - **CRITICAL anti-pattern — DO NOT duplicate the process across both axes.** Cols encode TIME (when the work happens: e.g. "Intake", "Triage", "Resolve"). Rows encode WHO (the actor/system/team doing it: e.g. "Customer", "Support agent", "Billing system"). If your row labels are synonyms of your col labels (e.g. cols = "Upstream / Transportation / Storage / Refining / Distribution" AND rows = "Exploration / Transportation / Refining / Distribution"), the structure is wrong — cards will collapse onto the diagonal and connectors will zig-zag across empty cells, looking like a mess.
  - **Picking swimlanes (rows)**: list the distinct actors or systems that actually touch the work at any point in the process. For a supply chain: "Producer", "Carrier", "Terminal operator", "Refiner", "Distributor" — NOT the same phase names again. For an incident response: "On-call engineer", "Incident commander", "Customer comms", "Postmortem owner". For a claims flow: "Patient", "Provider", "Payer", "Billing system". 3–6 rows is typical; each row should have meaningful work in at least 2 phases, otherwise the row is really a phase in disguise.
  - **Sanity check before returning**: if I compare my row labels to my col labels, do any of them describe the same thing (stage, activity) rather than different things (actor vs. stage)? If yes, rethink the rows.
- Radar chart → kanban with one col per dimension, scores as cardMetaFields.

## Connectors — when to enable

Include the top-level \`connectors\` field ONLY when the framework's meaning depends on arrows or relationships between cards. Concretely:

**You MUST enable connectors (\`connectors: { enabled: true, defaultRouting: "orthogonal" }\`)** if the user's description contains ANY of these signals:

- The words "process", "process map", "flow", "flowchart", "workflow", "pipeline", "service blueprint", "handoff", "sequence", "procedure", "runbook", "playbook", "state machine", "state diagram", "decision tree", "causal", "dependency", "dependency graph", "BPMN", "approval flow", "escalation", "intake flow", "ticket flow", "request flow", "onboarding flow", "fulfillment flow", "claims flow", "deployment pipeline", "CI/CD", "incident response flow".
- Language implying directed progression: "step X happens, then step Y", "work moves from A to B", "this step triggers that step", "when approved, we do X; when denied, we do Y", "once this is done, route to…".
- Swimlane structure where multiple actors/systems hand work between each other over phases.

If ANY of those match, connectors MUST be enabled. If in doubt, lean toward enabling — it's better to have arrows a user can delete than miss them entirely.

**Do NOT enable for**: SWOT, BCG, 2×2s, empathy maps, JTBD canvas, affinity diagrams, journey maps (journey maps show experience, not directed flow), stakeholder maps, card sorts, Venn, funnels, Kano, RACI, OKRs — these are tabular or spatial, not directed graphs.

Connector kinds you can reference in \`allowedKinds\`: \`"sequence"\` (normal step-to-step flow), \`"handoff"\` (work crosses a swimlane), \`"decision-yes"\` / \`"decision-no"\` (branches out of a decision card), \`"dependency"\`, \`"feedback-loop"\`. Choose whichever subset fits the framework's vocabulary.

When connectors are enabled, you MUST also add a \`stepKind\` cardMetaField with options \`["task", "decision", "start", "end"]\` and \`nullable: true\` so cards can self-describe their node type. The populate step relies on this to know which cards are decisions, starts, ends. (See the process-map example — copy that pattern.)

**ID hygiene for connector-enabled frameworks.** The populate step will create cards AND connectors in the same batch. It MUST assign a slug \`id\` to every card that will be a connector endpoint (nearly all of them). Slug format: \`^[a-z][a-z0-9_-]{0,40}$\` — examples: \`intake_submitted\`, \`decision_approval\`, \`handoff_billing\`, \`end_archived\`. Do NOT use the \`k\\d+\` format — it is reserved for auto-assignment. This note is carried into the populate step via the universal prompt.

## Examples of valid output (shape reference)

${shots}

## Output

Call the \`propose_framework\` tool with your config. The id must start with "custom-". Do NOT return free-form text — the tool call is the only output channel.
  `.trim();
}
