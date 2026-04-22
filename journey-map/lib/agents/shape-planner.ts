import Anthropic from "@anthropic-ai/sdk";
import { getAgentModel, getAnthropic } from "@/lib/anthropic";

// ──────────────────────────────────────────────────────────────────────────────
// shape-planner — forces per-subject layout variation. Runs between the
// clarifier/interpreter and the synth agent. Takes a description and emits a
// structured shape blueprint whose core constraint is SPECIFICITY: the shape
// must emerge from THIS subject, not from the framework category's default.
//
// Without this, every "post-mortem" becomes a 6-column kanban, every
// "competitive matrix" becomes a 2×2, every journey map becomes a swimlane
// grid — regardless of what the actual subject demands. The planner is
// explicitly told to reach for unusual shapes when the subject warrants
// (timelines, five-whys cascades, funnel chromes, freeform region canvases).
//
// Opt-out: SHAPE_PLANNER=off.
// ──────────────────────────────────────────────────────────────────────────────

export type ShapePlan = {
  layout: "matrix" | "grid" | "kanban" | "freeform";
  /** Number of cols + their labels in order. Kanban typically 3-7, matrix
   *  typically 2-5, grid 3-12, freeform 0 (positioning is by meta). */
  cols: string[];
  /** Number of rows + labels. Kanban should be a single row. Matrix 2-5.
   *  Grid 2-8. Freeform 0. */
  rows: string[];
  /** Optional chrome kind. Available in the FrameworkConfig.chrome system:
   *  double-diamond, venn, kano-curve, funnel, concentric-rings, none. Use
   *  when the visual shape genuinely reinforces the subject. */
  chrome?: string;
  /** Named thematic regions — REQUIRED when layout === "freeform" and the
   *  board is not a pure mind map. Each region becomes a labeled rectangle
   *  shape card in the renderer that wraps its member content cards. This
   *  is how we get cluster chrome (visible groupings with labels) without
   *  falling back to axis-based layouts. */
  regions?: string[];
  /** Optional layout pattern for the regions on the freeform canvas, e.g.
   *  "2x3 grid", "center + 4 petals", "horizontal strip". Guides the
   *  populate agent's region positioning. */
  regionLayout?: string;
  /** Why this specific shape fits THIS subject — not just the category.
   *  Must reference concrete features of the subject (entities named in
   *  the prompt, temporal structure, causal relationships, etc.). */
  rationale: string;
  /** What generic shape this subject would have defaulted to, and why this
   *  plan is different. Forces the planner to actually compare. */
  vsDefault: string;
  /** Suggested card density heuristic — the synth agent reads this for
   *  populate. e.g. "dense: 6-8 per col", "sparse: 2-3 per cell", "headline
   *  cards only". */
  density?: string;
  /** Optional structural notes. E.g. "cascading five-whys: each row is a
   *  deeper why, cards become the reasoning chain" or "timeline: cols are
   *  dates in strict order, rows are actors". */
  structuralNotes?: string;
};

export function shapePlannerEnabled(): boolean {
  return process.env.SHAPE_PLANNER !== "off";
}

export async function runShapePlanner(args: {
  description: string;
  sourcesSummary?: string;
}): Promise<ShapePlan | null> {
  if (!shapePlannerEnabled()) return null;
  const client = getAnthropic();

  const system = SYSTEM;
  const user = buildUser(args);

  try {
    const response = await client.messages.create({
      model: process.env.SHAPE_PLANNER_MODEL || getAgentModel(),
      max_tokens: 1200,
      temperature: 0.45,
      system,
      tools: [SHAPE_PLAN_TOOL as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "propose_shape" },
      messages: [{ role: "user", content: user }],
    });
    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;
    return coerce(block.input as Partial<ShapePlan>);
  } catch (err) {
    console.warn("[shape-planner] failed — proceeding without a plan:", err);
    return null;
  }
}

export function renderShapePlanBlock(plan: ShapePlan): string {
  const lines: string[] = ["# Shape plan (authoritative)"];
  lines.push(`- layout: ${plan.layout}`);
  if (plan.cols.length > 0) lines.push(`- cols (${plan.cols.length}): ${plan.cols.join(" | ")}`);
  if (plan.rows.length > 0) lines.push(`- rows (${plan.rows.length}): ${plan.rows.join(" | ")}`);
  if (plan.regions && plan.regions.length > 0) {
    lines.push(`- regions (${plan.regions.length}): ${plan.regions.join(" | ")}`);
    lines.push(
      `  (each region MUST be emitted as a rectangle shape card with the region label as its text, positioned to wrap its member content cards. This is the cluster chrome.)`
    );
  }
  if (plan.regionLayout) lines.push(`- region layout: ${plan.regionLayout}`);
  if (plan.chrome && plan.chrome !== "none") lines.push(`- chrome: ${plan.chrome}`);
  if (plan.density) lines.push(`- density: ${plan.density}`);
  if (plan.structuralNotes) lines.push(`- structural notes: ${plan.structuralNotes}`);
  lines.push(`- rationale: ${plan.rationale}`);
  lines.push(`- why not the default: ${plan.vsDefault}`);
  return lines.join("\n");
}

// ── Internals ────────────────────────────────────────────────────────────────

const SYSTEM = `You are a shape planner. A user wants to build a framework board about a specific subject. Your job: propose the SHAPE (layout + dimensions + optional chrome) that tells THIS subject's story best.

The board renderer has four layouts:
- matrix: 2 axes (both meaningful). Good for tradeoff spaces, 2×2s, competitive spaces with clear x/y.
- grid: cols × rows, both meaningful and usually semantically different (time × actor, stage × aspect). Good for journey maps, service blueprints, process maps.
- kanban: 1 row, N cols. Cards fall into columns by category. Good for card sorts, JTBD, Now/Next/Later.
- freeform: no grid. Cards positioned by (x,y). Good for loose spatial narratives, mind maps, canvases with thematic regions.

Optional decorative chrome (renders behind cols): "double-diamond", "venn", "kano-curve", "funnel", "concentric-rings", or "none".

### Your hard rules

1. **SPECIFICITY OVER CATEGORY**. Do NOT pick the default shape for the framework category.
   - "Post-mortem" → do NOT default to a 5-column kanban (What happened / Why / Impact / Actions / Lessons). Ask: what does THIS post-mortem demand? A post-mortem about a time-bound crisis (SVB collapse, outage, launch) is a TIMELINE. A post-mortem about a failed product decision is a FIVE-WHYS cascade (grid with each row deeper). A post-mortem about team dynamics is a 2×2. An incident post-mortem at a tech company with structured sections might be a freeform with named regions.
   - "Competitive matrix" → usually a matrix, but NOT always 2×2. A CLM vendor comparison across 8 dimensions is a grid (vendors × dimensions), not a 2×2.
   - "Journey map" → NOT always 6-swimlane × 7-stages. A super short product onboarding is maybe 3 swimlanes × 4 stages. A multi-actor B2B sale might be 8 stages with 2 actor bands.
   - "Strategy board" → rarely a simple tabular grid. Often a freeform with named thematic regions (Users, Pains, Bets, Metrics, Risks, Capital) positioned spatially.

2. **REACH FOR VARIATION**. If two or more shapes could reasonably work, pick the LESS common one when it tells the story better. Bias toward interesting over safe.

3. **DIMENSIONS MUST MATCH CONTENT**. Don't pick a 6-col kanban because 6 feels right. Count what the subject actually has: if there are 4 meaningful phases, use 4 cols. If the subject has 11 vendors and 7 criteria, use a grid that size.

4. **ROW / COL LABELS MUST BE SPECIFIC**. Not "Category 1, Category 2" — name them based on the subject. For SVB, not "Event A, Event B" but "Mar 8: bond-sale announcement", "Mar 9: $42B run", etc.

5. **STATE WHY NOT THE DEFAULT**. In \`vsDefault\`, name the shape this subject would have gotten by default and explain why your proposal is better. This is a self-check against lazy shape picks.

### When to reach for each layout

- **freeform**: the subject has thematic regions that don't map to clean axes (exec planning boards, opportunity landscapes, post-mortems of complex incidents with heterogeneous evidence). Use freeform when cards relate BY GROUP more than by row/col position. **CRITICAL**: when you pick freeform, you MUST also populate \`regions\`: one named region per thematic cluster (e.g., for an SVB post-mortem: ["Root Causes", "Warning Signs", "Founder Decisions", "Regulatory Response", "Market Changes", "Lessons for 2026"]). Without named regions, the board becomes a chaotic card soup. Also specify \`regionLayout\` (e.g., "2x3 grid", "3x2 grid", "central + 5 petals", "horizontal strip of 4") so the populate step knows how to lay regions out on the canvas.
- **timeline (grid with time cols)**: the subject is EVENT-DRIVEN. SVB collapse. Product launch retrospective. Political campaign post-mortem. Use col labels = dates or phases; row labels = actors, categories, or evidence types.
- **five-whys cascade (grid, rows = depth)**: the subject is a CAUSAL CHAIN. "Why did X happen?" → each row is a deeper why. Use col labels = branches; row labels = why-1, why-2, why-3.
- **matrix (2×2 or larger)**: two axes genuinely define the space. Don't pick matrix unless the axes are actually meaningful independent variables.
- **kanban with chrome**: the subject wants a recognized visual identity (Double Diamond, Ikigai, Kano). Include chrome kind.

### How to use the sources (if a digest is provided)

If a CSV's columns/rows are meaningful, USE THEM as your col/row labels (not generic labels). If a document is named, anchor the subject to it. If a transcript mentions named people, consider actor-based rows.

Call propose_shape with one concrete, opinionated plan.`;

function buildUser(args: { description: string; sourcesSummary?: string }): string {
  const parts: string[] = [];
  parts.push(`## Description`);
  parts.push(args.description.trim());
  if (args.sourcesSummary && args.sourcesSummary.trim()) {
    parts.push(``);
    parts.push(args.sourcesSummary.trim());
  }
  parts.push(``);
  parts.push(`Propose a shape. Be specific. Reach for the less-common shape when it tells the story better. Call propose_shape.`);
  return parts.join("\n");
}

function coerce(raw: Partial<ShapePlan>): ShapePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const layout = raw.layout;
  if (layout !== "matrix" && layout !== "grid" && layout !== "kanban" && layout !== "freeform") {
    return null;
  }
  const cols = Array.isArray(raw.cols)
    ? raw.cols.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim())
    : [];
  const rows = Array.isArray(raw.rows)
    ? raw.rows.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.trim())
    : [];
  const rationale = typeof raw.rationale === "string" ? raw.rationale.trim() : "";
  const vsDefault = typeof raw.vsDefault === "string" ? raw.vsDefault.trim() : "";
  if (!rationale || !vsDefault) return null;
  const chrome = typeof raw.chrome === "string" ? raw.chrome.trim() : undefined;
  const density = typeof raw.density === "string" ? raw.density.trim() : undefined;
  const structuralNotes = typeof raw.structuralNotes === "string" ? raw.structuralNotes.trim() : undefined;
  const regions = Array.isArray(raw.regions)
    ? raw.regions.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.trim())
    : undefined;
  const regionLayout = typeof raw.regionLayout === "string" ? raw.regionLayout.trim() : undefined;
  return {
    layout,
    cols,
    rows,
    chrome: chrome && chrome !== "none" ? chrome : undefined,
    rationale,
    vsDefault,
    density,
    structuralNotes,
    regions,
    regionLayout,
  };
}

const SHAPE_PLAN_TOOL = {
  name: "propose_shape",
  description:
    "Propose one opinionated shape that fits THIS specific subject. Must reject the category default and justify why.",
  input_schema: {
    type: "object",
    required: ["layout", "cols", "rows", "rationale", "vsDefault"],
    additionalProperties: false,
    properties: {
      layout: {
        type: "string",
        enum: ["matrix", "grid", "kanban", "freeform"],
      },
      cols: {
        type: "array",
        items: { type: "string" },
        description:
          "Col labels in order. Must be subject-specific (not 'Category 1, 2'). Use [] only for pure freeform with no columnar structure.",
      },
      rows: {
        type: "array",
        items: { type: "string" },
        description:
          "Row labels in order. Must be subject-specific. Use [] for kanban (single implicit row) or pure freeform.",
      },
      chrome: {
        type: "string",
        description:
          "Optional visual chrome: double-diamond, venn, kano-curve, funnel, concentric-rings, or 'none'. Only use when the subject genuinely calls for this visual identity.",
      },
      rationale: {
        type: "string",
        description:
          "Why this shape fits THIS subject. Must reference concrete features of the subject — named entities, temporal structure, causal relationships.",
      },
      vsDefault: {
        type: "string",
        description:
          "Name the shape this subject would default to, and why your proposal is better. Forces a self-check against lazy category-based picks.",
      },
      density: {
        type: "string",
        description:
          "Card density hint: 'sparse: 2-3 per cell', 'medium: 4-6 per col', 'dense: 6-8 per col', 'headline cards only', etc.",
      },
      structuralNotes: {
        type: "string",
        description:
          "How rows/cols should be READ. E.g. 'cols are dates in chronological order; rows are actor bands' or 'rows are depth levels of why?'",
      },
      regions: {
        type: "array",
        items: { type: "string" },
        description:
          "REQUIRED when layout is 'freeform'. Named thematic clusters — e.g. for an SVB post-mortem: ['Root Causes', 'Warning Signs', 'Founder Decisions', 'Regulatory Response', 'Market Changes', 'Lessons for 2026']. Each becomes a labeled rectangle shape card that wraps its content cards. Without regions, freeform boards become chaotic.",
      },
      regionLayout: {
        type: "string",
        description:
          "How to arrange the regions on the canvas. E.g. '3x2 grid' (cols × rows), 'central + 5 petals', 'horizontal strip of 4', 'L-shape with anchor on left'. Only set when layout is freeform.",
      },
    },
  },
} as const;
