import Anthropic from "@anthropic-ai/sdk";
import { getAgentModel, getAnthropic } from "@/lib/anthropic";
import {
  validateContract,
  renderContractBlock,
  type ShapeContract,
} from "@/lib/frameworks/shape-contract";

// ──────────────────────────────────────────────────────────────────────────────
// shape-planner — the SINGLE upstream decision point for a board's shape.
//
// Runs between the clarifier/interpreter and the synth agent. Takes a
// description + optional source digest and emits a typed ShapeContract that
// every downstream stage (synth, populate, render) must honor.
//
// Why it exists: without this, every "post-mortem" becomes a 6-column kanban,
// every "competitive matrix" becomes a 2×2, every journey map becomes a
// swimlane grid. And when the user has enumerated specific entities or
// dimensions, lesser models paraphrase them into buckets of their own
// invention. The contract closes those drift surfaces by making enumerated
// content a CLOSED LIST and by typing variant/cellGroups explicitly.
//
// Critically: the variant enum is { axed | categorical | clustered } — there
// is NO freeform. Mind maps, clustered canvases, opportunity maps, SVB-style
// post-mortems — all become clustered grids (grid + CellGroupChrome). The
// freeform absolute-positioning path is deprecated for AI-generated content.
//
// Opt-out: SHAPE_PLANNER=off.
// ──────────────────────────────────────────────────────────────────────────────

export type { ShapeContract } from "@/lib/frameworks/shape-contract";
export { renderContractBlock } from "@/lib/frameworks/shape-contract";

export function shapePlannerEnabled(): boolean {
  return process.env.SHAPE_PLANNER !== "off";
}

export type ExistingBoardForPlanner = {
  title?: string;
  cols?: string[];
  rows?: string[];
  /** Top-level cards keyed by their (col label, row label) cell. Order
   *  reflects the original board so the planner can preserve narrative if
   *  the new shape keeps a temporal axis. */
  cards: Array<{ col: string; row: string; text: string }>;
};

export async function runShapePlanner(args: {
  description: string;
  sourcesSummary?: string;
  /** When the user is reshaping an existing board, pass its content so the
   *  planner treats every existing entity as enumerated (closed list) on
   *  the new shape. Without this the planner invents fresh names to match
   *  whatever new axes it picks. */
  existingBoard?: ExistingBoardForPlanner;
}): Promise<ShapeContract | null> {
  if (!shapePlannerEnabled()) return null;
  const client = getAnthropic();

  try {
    const response = await client.messages.create({
      model: process.env.SHAPE_PLANNER_MODEL || getAgentModel(),
      max_tokens: 1600,
      temperature: 0.4,
      system: SYSTEM,
      tools: [PROPOSE_CONTRACT_TOOL as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "propose_contract" },
      messages: [{ role: "user", content: buildUser(args) }],
    });
    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      console.warn("[shape-planner] no tool_use in response");
      return null;
    }
    const validation = validateContract(block.input);
    if (!validation.ok) {
      console.warn(`[shape-planner] planner produced an invalid contract: ${validation.reason}`);
      return null;
    }
    return validation.contract;
  } catch (err) {
    console.warn("[shape-planner] failed — proceeding without a plan:", err);
    return null;
  }
}

/** Back-compat alias — previous callers imported renderShapePlanBlock. The
 *  behaviour is now identical to renderContractBlock (it serialises a
 *  ShapeContract the same way). Retained so diffs are local to Phase 1. */
export function renderShapePlanBlock(contract: ShapeContract): string {
  return renderContractBlock(contract);
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a shape planner. A user wants to build a framework board about a specific subject. Your job: emit ONE opinionated ShapeContract that tells THIS subject's story best.

The board renderer is a single structural grid. It has three variants driven by YOUR choice:

- **axed**: both cols and rows carry semantic meaning. Use for competitive grids (competitors × dimensions), journey maps (stages × lanes), service blueprints, RACI matrices, timelines-with-actors. Matrix chromes (2×2 quadrants) are a subset — axed with small symmetric dimensions.
- **categorical**: one meaningful axis (cols are categories) and a single implicit row. Use for card sorts, JTBD canvases, affinity themes, kanban-style bucketing, Ikigai/Venn, Double Diamond, Kano, concentric rings. Chrome kinds like "venn", "double-diamond", "kano-curve", "funnel", "concentric-rings" compose with this variant.
- **clustered**: cells grouped into named regions. Use for mind maps, post-mortem canvases, opportunity maps, strategy boards, stakeholder landscapes — anything where content relates BY GROUP more than by axis. You MUST populate cellGroups: a list of { id, label, cells } pairings. Axes are still present (they scaffold the grid) but colLabelsShown / rowLabelsShown typically false.

**There is no freeform variant.** Mind maps and clustered canvases all use "clustered" — the grid owns geometry; your cell-group labels become chrome.

### Your hard rules

0. **HONOR ENUMERATED CONTENT — NON-NEGOTIABLE.**
   If the user has listed specific entities (e.g. "Anthropic, OpenAI, Google DeepMind, Meta, Mistral, xAI") or dimensions (e.g. "reasoning, code, multimodal, context length, safety, enterprise distribution, pricing, ecosystem"):
   - Set \`enumerated.entities\` / \`enumerated.dimensions\` to those exact items.
   - Use them verbatim as rows or cols. DO NOT invent additional entries.
   - If the user listed N items on one axis and M on the other, the answer is an axed grid with exactly N cols × M rows (or N rows × M cols). Do not collapse N items into M buckets.

1. **SPECIFICITY OVER CATEGORY.** Do NOT pick the default shape for the framework category. A "post-mortem of SVB" is a timeline or five-whys or a clustered canvas — not a default 5-col kanban. A "competitive matrix across 8 dimensions" is an axed grid of exact size, not a 2×2.

2. **REACH FOR VARIATION.** If two variants could reasonably work, pick the LESS common one when it tells the story better.

3. **DIMENSIONS MUST MATCH CONTENT.** Count what the subject has. 4 phases → 4 cols. 11 vendors × 7 criteria → 11 × 7 axed grid.

4. **LABELS MUST BE SPECIFIC.** Not "Category 1, Category 2" — name them from the subject. For an SVB timeline: "Mar 8: bond-sale announcement", "Mar 9: $42B run", etc.

5. **STATE WHY NOT THE DEFAULT.** In \`vsDefault\`, name the shape this subject would default to, and explain why your proposal is better.

### Hard rules for common framework families

- **Mind map / concept map / idea map / brain dump**: ALWAYS \`variant: "clustered"\` with \`cellGroupLayoutHint: "radial"\`. Each branch is one cellGroup. Put the root ("My Career", "Q2 Priorities", etc.) as one cellGroup over a central cell. The other groups fan out. NEVER emit a grid with "CENTER / INNER RING / OUTER RING" cols — that's an empty table, not a mind map.
- **Ikigai / Venn / overlap**: \`variant: "categorical"\` with \`chrome: "venn"\`.
- **Double Diamond / design process**: \`variant: "categorical"\` with \`chrome: "double-diamond"\` and 4 cols (Discover / Define / Develop / Deliver).
- **Kano model / priority curve / funnel**: \`variant: "categorical"\` with chrome \`"kano-curve"\` or \`"funnel"\`.
- **Concentric rings / onion model / stakeholder map**: \`variant: "categorical"\` with \`chrome: "concentric-rings"\`. Cols = the rings (inner → outer).
- **Timeline (event-driven)**: \`variant: "axed"\`. Col labels = dates or phases; row labels = actors / categories / evidence types.
- **Five-whys cascade (causal chain)**: \`variant: "axed"\`. Col = branch; rows = why-1, why-2, why-3, depth.
- **Competitive matrix with enumerated competitors + enumerated dimensions**: \`variant: "axed"\`. Cols = exactly the enumerated dimensions. Rows = exactly the enumerated competitors. (Or vice versa, depending on which list is longer.)
- **2×2 matrix / quadrant**: \`variant: "axed"\` with 2 fixed cols and 2 fixed rows. ONLY when the user has NOT enumerated the axis contents and has genuinely asked for two tradeoff dimensions.
- **Post-mortem with thematic regions (SVB-style)**: \`variant: "clustered"\`. cellGroups = the named regions (Root Causes, Warning Signs, Founder Decisions, Regulatory Response, Lessons, etc.). cellGroupLayoutHint = "3x2 grid" or similar. Each region covers one or two adjacent cells.
- **Strategy canvas / opportunity map / exec planning board**: \`variant: "clustered"\`. cellGroups = the named sections (Users, Pains, Bets, Metrics, Risks, Capital).

### Confidence

Include \`confidence\` per field. Mark:
- \`subject: "low"\` if the prompt doesn't name what the board is ABOUT (e.g. just "post-mortem" with no event).
- \`variant: "low"\` if two variants are equally defensible and the user hasn't hinted.
- \`cellGroups: "low"\` (clustered only) if you had to guess the region names without strong evidence.
- \`density: "low"\` when the content volume is genuinely unknown.
Default to "high" when you're certain. Clarifier only asks about low-confidence fields.

### How to use sources (digest, optional)

If a CSV's columns/rows are meaningful, use them as col/row labels (not generic). If a document names people, consider actor-based rows.

Call \`propose_contract\` with one concrete, opinionated contract. Never respond with free text.`;

function buildUser(args: {
  description: string;
  sourcesSummary?: string;
  existingBoard?: ExistingBoardForPlanner;
}): string {
  const parts: string[] = [];
  parts.push(`## Description`);
  parts.push(args.description.trim());
  if (args.sourcesSummary && args.sourcesSummary.trim()) {
    parts.push(``);
    parts.push(args.sourcesSummary.trim());
  }
  if (args.existingBoard) {
    const eb = args.existingBoard;
    parts.push(``);
    parts.push(`## Existing board (the user is RESHAPING; preserve every entity verbatim)`);
    if (eb.title) parts.push(`Title: ${eb.title}`);
    if (eb.cols && eb.cols.length > 0) parts.push(`Original cols: ${eb.cols.join(" | ")}`);
    if (eb.rows && eb.rows.length > 0) parts.push(`Original rows: ${eb.rows.join(" | ")}`);
    if (eb.cards.length > 0) {
      parts.push(`Cards (${eb.cards.length}):`);
      for (const c of eb.cards) {
        parts.push(`  - [${c.col} / ${c.row}] ${c.text}`);
      }
    }
    parts.push(``);
    parts.push(
      `RULES for reshape:`
    );
    parts.push(
      `1. Every named entity from the existing cards MUST appear on the new shape. Do NOT invent replacement entities to fit a new layout. Set \`enumerated.entities\` to the actual entity list (the original rows / column entities — competitors / labs / actors / products).`
    );
    parts.push(
      `2. Every original observation should still have a home on the new shape. Set \`density.target\` and \`density.max\` HIGH enough that existing cards can be redistributed without truncation. With ${eb.cards.length} existing cards and a typical reshape, target ≈ ceil(${eb.cards.length} / cells) cards per cell; max ≈ 1.5× that. Don't pin density to 2–3 just because the new shape is small — you're preserving content, not building from scratch.`
    );
    parts.push(
      `3. If the user named NEW axes (e.g., speed × reasoning), think of the original rows as the entities being scored against those axes. Cards may extend the original text with axis-relevant detail, but the ENTITY (lab name, competitor name, etc.) must lead the card.`
    );
  }
  parts.push(``);
  parts.push(`Emit one ShapeContract via propose_contract. Be specific. Honor enumerated content verbatim. Reach for the less-common variant when it tells the story better.`);
  return parts.join("\n");
}

// ── Tool schema ───────────────────────────────────────────────────────────────

const PROPOSE_CONTRACT_TOOL = {
  name: "propose_contract",
  description:
    "Emit one opinionated ShapeContract that fits THIS specific subject. Must reject the category default and justify why. Must honor enumerated content verbatim.",
  input_schema: {
    type: "object",
    required: ["subject", "variant", "axes", "density", "enumerated", "rationale", "vsDefault"],
    additionalProperties: false,
    properties: {
      subject: { type: "string", description: "What the board is about — the named event, product, company, or concept." },
      audience: { type: "string", description: "Who reads this board (founders, VCs, operators, engineers, etc.). Leave empty if unspecified." },
      variant: {
        type: "string",
        enum: ["axed", "categorical", "clustered"],
        description:
          "axed = both axes semantic (grid / matrix). categorical = cols are categories (kanban; single implicit row). clustered = named cell groups (mind map, post-mortem canvas, opportunity map).",
      },
      chrome: {
        type: "string",
        enum: ["double-diamond", "venn", "kano-curve", "funnel", "concentric-rings", "coordinate-cross", "none"],
        description: "Decorative chrome behind the grid. Defaults to 'none'.",
      },
      axes: {
        type: "object",
        required: ["cols", "rows"],
        additionalProperties: false,
        properties: {
          cols: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["label"],
              additionalProperties: false,
              properties: {
                id: { type: "string", description: "optional; server assigns c1, c2 … if omitted." },
                label: { type: "string" },
                kind: { type: "string" },
              },
            },
          },
          rows: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["label"],
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                kind: { type: "string" },
              },
            },
          },
          colLabelsShown: { type: "boolean", description: "false for clustered variant when col labels are scaffolding, not semantics." },
          rowLabelsShown: { type: "boolean" },
        },
      },
      cellGroups: {
        type: "array",
        description: "REQUIRED when variant is 'clustered'. Named regions over cells.",
        items: {
          type: "object",
          required: ["label", "cells"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            cells: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["colId", "rowId"],
                additionalProperties: false,
                properties: {
                  colId: { type: "string" },
                  rowId: { type: "string" },
                },
              },
            },
            chromeStyle: { type: "string", enum: ["box", "region", "radial-petal", "none"] },
          },
        },
      },
      cellGroupLayoutHint: {
        type: "string",
        description: "How cell groups lay out visually: '3x2', 'radial', 'central+petals', 'horizontal-strip', etc.",
      },
      density: {
        type: "object",
        required: ["min", "target", "max"],
        additionalProperties: false,
        properties: {
          min: { type: "number", description: "Minimum cards per cell (or per group for clustered)." },
          target: { type: "number" },
          max: { type: "number" },
        },
      },
      enumerated: {
        type: "object",
        additionalProperties: false,
        properties: {
          entities: {
            type: "array",
            items: { type: "string" },
            description: "Exact named entities the user listed (competitors, labs, products, actors). Closed list.",
          },
          dimensions: {
            type: "array",
            items: { type: "string" },
            description: "Exact named dimensions the user listed (capabilities, criteria, axes). Closed list.",
          },
        },
      },
      rationale: {
        type: "string",
        description: "Why THIS shape fits THIS subject. Must reference concrete features of the subject.",
      },
      vsDefault: {
        type: "string",
        description: "Name the shape this subject would default to, and why your proposal is better.",
      },
      confidence: {
        type: "object",
        additionalProperties: false,
        properties: {
          subject: { type: "string", enum: ["high", "medium", "low"] },
          variant: { type: "string", enum: ["high", "medium", "low"] },
          axes: { type: "string", enum: ["high", "medium", "low"] },
          cellGroups: { type: "string", enum: ["high", "medium", "low"] },
          density: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
  },
} as const;
