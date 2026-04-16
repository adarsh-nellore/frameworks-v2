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
    "seed",
  ],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^custom-[a-z0-9-]{3,40}$",
      description:
        "Kebab-case slug, must start with 'custom-' (e.g. 'custom-swot-analysis').",
    },
    label: {
      type: "string",
      maxLength: 40,
      description: "Human-readable framework name shown in the switcher (e.g. 'SWOT Analysis').",
    },
    layout: {
      type: "string",
      enum: ["grid", "kanban", "matrix"],
      description:
        "grid = sparse 2D (both axes dynamic, e.g. journey map). kanban = 1-axis categorization (1 row, e.g. card sort). matrix = fixed NxM dense (both axes meaningful, e.g. 2x2 priority).",
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
        "Short framework-specific guidance appended to the universal system prompt. Explain what col, row, and card mean in THIS framework. 3-6 sentences. Do NOT mention ops (addCard, moveCol, etc.) — the universal prompt handles that.",
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
