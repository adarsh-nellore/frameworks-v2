// JSON Schema for the propose_framework tool.
//
// This is a tool-call boundary enforcement: Claude's structured output is
// shape-checked against this schema before we see the result. The runtime
// validator in validate.ts adds semantic checks on top (layout-specific rules,
// op-name regex on structuringPrompt, id collision auto-suffix, etc.).

export const proposeFrameworkToolName = "propose_framework";

export const proposeFrameworkToolDescription =
  "Propose a FrameworkConfig for a new custom framework based on the user's description. " +
  "Return the full config (id, label, layout, nouns, structure, structuringPrompt, examples) " +
  "with an empty seed (seed.cards = []). The system will populate the seed with content in a second step.";

export const proposeFrameworkToolSchema = {
  type: "object",
  required: [
    "id",
    "label",
    "layout",
    "colNoun",
    "rowNoun",
    "cardNoun",
    "structuringPrompt",
    "exampleInstructions",
    "renderingPlan",
    "seed",
  ],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      minLength: 3,
      maxLength: 80,
      description:
        "Kebab-case slug, preferably starting with 'custom-' (e.g. 'custom-swot-analysis'). The server will normalize to lowercase, strip invalid chars, and prepend 'custom-' if missing, so don't fail on this field.",
    },
    label: {
      type: "string",
      maxLength: 40,
      description: "Human-readable framework name shown in the switcher (e.g. 'SWOT Analysis').",
    },
    layout: {
      type: "string",
      enum: ["grid", "kanban", "matrix", "freeform"],
      description:
        "grid = sparse 2D (both axes dynamic, e.g. journey map). kanban = 1-axis categorization (1 row), use with optional chrome for spatial frameworks like Double Diamond/Venn/Kano. matrix = fixed NxM dense (both axes meaningful, e.g. 2x2 priority). freeform = unstructured Miro-style canvas — only for mind maps / brainstorms, NOT for structured frameworks (those should be kanban+chrome).",
    },
    chrome: {
      type: "object",
      description:
        "Optional decorative SVG chrome rendered above/behind the grid. Use for frameworks with a recognizable visual identity: Double Diamond (chrome.kind='double-diamond'), Venn (circles=[labels]), Kano Model ('kano-curve'), conversion funnels ('funnel'), concentric ring models ('concentric'), or a cartesian-style coordinate system with double-sided arrows on both axes ('coordinate-cross'). Pick 'coordinate-cross' when the user explicitly asks for axes with double-sided arrows, a coordinate system, an origin cross, or a cartesian-style plot — the chrome draws a centered cross with arrowheads at both ends on each axis.",
      required: ["kind"],
      additionalProperties: true,
      properties: {
        kind: {
          type: "string",
          enum: [
            "double-diamond",
            "venn",
            "kano-curve",
            "funnel",
            "concentric",
            "coordinate-cross",
          ],
        },
        leftLabel: { type: "string" },
        rightLabel: { type: "string" },
        circles: { type: "array", items: { type: "string" } },
      },
    },
    colNoun: { type: "string", maxLength: 20, description: "Singular noun for a column (e.g. 'Stage', 'Competitor', 'Quadrant')." },
    rowNoun: { type: "string", maxLength: 20, description: "Singular noun for a row (e.g. 'Lane', 'Criterion', 'Dimension')." },
    cardNoun: { type: "string", maxLength: 20, description: "Singular noun for a card (e.g. 'Item', 'Assessment', 'Quote')." },
    fixedCols: {
      type: "boolean",
      description: "True if the number of cols should NOT change (e.g. fixed 2x2 quadrants). Required true for matrix layout.",
    },
    fixedRows: {
      type: "boolean",
      description: "True if the number of rows should NOT change (e.g. kanban single row, fixed card types). Required true for matrix and kanban.",
    },
    structuringPrompt: {
      type: "string",
      minLength: 40,
      maxLength: 2000,
      description:
        "Short framework-specific guidance appended to the universal system prompt. Explain what col, row, and card mean in THIS framework. 3-6 sentences. Do NOT mention ops (addCard, moveCol, etc.) — the universal prompt handles that. This is the SEMANTIC layer — what the framework MEANS. The renderingPlan field (below) is the separate VISUAL layer.",
    },
    renderingPlan: {
      type: "object",
      required: ["cardOrientation", "spatialContinuity", "density", "summary"],
      additionalProperties: false,
      description:
        "How the framework should visually RENDER — separate from what it semantically means. This is the bridge between the structuringPrompt (semantic) and the populate step's per-card placement (execution). Tells the renderer whether cards are stacked notes, horizontal bars along a time axis, or dots at continuous (x, y) positions.",
      properties: {
        cardOrientation: {
          type: "string",
          enum: ["stacked", "horizontal-bar", "dot", "mixed"],
          description:
            "'stacked' = cards flow vertically in each (col,row) cell. Default for discrete frameworks: SWOT, journey map, service blueprint, kanban, affinity, Venn, Double Diamond, RACI, business model canvas. " +
            "'horizontal-bar' = cards render as horizontal pills at meta.x with width meta.width. Use for Gantt charts, roadmaps, timelines, any framework where duration along ONE axis is load-bearing. Convention: a card with meta.width === \"0\" renders as a diamond marker (milestone). " +
            "'dot' = cards render as small markers at continuous meta.x and meta.y. Use for scatter plots, cartesian positioning, magic quadrants, 2D maps — frameworks where the position of each entity carries the analytical insight. " +
            "'mixed' = framework combines orientations (e.g. shape cards as background + content cards as dots on top).",
        },
        spatialContinuity: {
          type: "string",
          enum: ["cell-discrete", "axis-continuous", "xy-continuous"],
          description:
            "'cell-discrete' = cards belong to a single (col, row) cell and stack within it. Pairs with cardOrientation 'stacked'. " +
            "'axis-continuous' = ONE axis is continuous (usually time). Cards carry meta.x (pixel offset inside their col) and optional meta.width (pixel span). Pairs with 'horizontal-bar'. " +
            "'xy-continuous' = BOTH axes continuous. Cards carry meta.x AND meta.y within the overall plot area. Pairs with 'dot'.",
        },
        density: {
          type: "string",
          enum: ["sparse", "moderate", "dense"],
          description:
            "'sparse' = clusters with negative space (mind map, scatter plot, some roadmaps). " +
            "'moderate' = most cells have 1–3 cards (journey map, SWOT, Gantt). " +
            "'dense' = every cell populated (competitive map, RACI, service blueprint).",
        },
        summary: {
          type: "string",
          minLength: 20,
          maxLength: 400,
          description:
            "1–3 sentences in plain English describing how the framework should read at a glance. This becomes the top-priority directive for the populate step — it reads this to decide how to set meta.x, meta.y, meta.width on each card. Example for Gantt: 'Swimlanes stack vertically; each task renders as a horizontal bar anchored at meta.x (start month) and stretching meta.width (duration in months). Milestones use meta.width = 0 and render as diamond markers.'",
        },
      },
    },
    exampleInstructions: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string", maxLength: 120 },
      description: "Suggestion pills shown in the copilot when the user hasn't typed anything yet. Each is a concrete, actionable instruction.",
    },
    chatPlaceholder: {
      type: "string",
      maxLength: 80,
      description: "Placeholder for the copilot textarea (e.g. 'Reshape the priority matrix…').",
    },
    chatSubtitle: {
      type: "string",
      maxLength: 80,
      description: "One-line subtitle next to the framework label in the copilot (e.g. 'Editing quadrants by impact and effort').",
    },
    cardMetaFields: {
      type: "array",
      description:
        "Optional per-card select fields (priority chips, type tags, etc.). Each renders as a cycling button on every card.",
      items: {
        type: "object",
        required: ["key", "label", "type", "options"],
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["select"] },
          options: { type: "array", items: { type: "string" }, minItems: 2 },
          nullable: { type: "boolean" },
        },
      },
    },
    heroMetaFields: {
      type: "array",
      description:
        "Optional top-level text fields rendered as a hero banner above the grid (e.g. 'Persona' for journey map, 'X Axis' for 2x2).",
      items: {
        type: "object",
        required: ["key", "label", "placeholder"],
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          placeholder: { type: "string" },
        },
      },
    },
    connectors: {
      type: "object",
      description:
        "Optional — ONLY include for frameworks whose meaning depends on arrows/relationships between cards: process maps, flowcharts, service blueprints, workflows, dependency diagrams, causal loops, state diagrams. When enabled, the renderer shows edge handles on cards and the populate step can emit addConnector ops. Do NOT include for plain tabular frameworks (SWOT, JTBD, affinity, journey map, 2x2, etc.) — connectors would be visual noise.",
      required: ["enabled"],
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        allowedKinds: {
          type: "array",
          description:
            "Semantic connector kinds the framework uses. Common: 'sequence' (normal flow), 'handoff' (between swimlanes), 'decision-yes' / 'decision-no' (branches), 'dependency', 'feedback-loop'.",
          items: { type: "string" },
        },
        defaultRouting: {
          type: "string",
          enum: ["straight", "orthogonal"],
          description: "Default path style. 'orthogonal' (right-angle elbows) reads best for swimlane/process maps; 'straight' is better for sparse dependency graphs.",
        },
      },
    },
    seed: {
      type: "object",
      required: ["id", "title", "cols", "rows", "cards", "meta"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        meta: { type: "object", additionalProperties: { type: "string" } },
        cols: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "label"],
            additionalProperties: false,
            properties: {
              id: { type: "string", pattern: "^c\\d+$" },
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
            required: ["id", "label"],
            additionalProperties: false,
            properties: {
              id: { type: "string", pattern: "^r\\d+$" },
              label: { type: "string" },
              kind: { type: "string" },
            },
          },
        },
        // Seed cards are always empty — populate step fills them after validation.
        cards: { type: "array", maxItems: 0 },
      },
    },
  },
} as const;
