// JSON Schema for the universal apply_operations tool.
// All frameworks share this single schema — the agent learns one vocabulary.

export const toolName = "apply_operations";

export const toolDescription =
  "Apply an ordered list of operations to reshape the framework map. " +
  "Operations are applied atomically left-to-right; if any fails the entire batch is rejected. " +
  "Include a human-readable summary of what you changed and why.";

export const toolSchema = {
  type: "object",
  required: ["summary", "ops"],
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description: "A 1–2 sentence plain-English description of the changes made.",
    },
    ops: {
      type: "array",
      description: "Ordered list of operations to apply.",
      items: {
        oneOf: [
          // ── Column ops ────────────────────────────────────────────────────
          {
            type: "object",
            required: ["op", "label"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["addCol"] },
              label: { type: "string" },
              kind: { type: "string" },
              atIndex: { type: "integer", minimum: 0 },
            },
          },
          {
            type: "object",
            required: ["op", "colId"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["removeCol"] },
              colId: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["op", "colId", "label"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["renameCol"] },
              colId: { type: "string" },
              label: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["op", "colId", "toIndex"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["moveCol"] },
              colId: { type: "string" },
              toIndex: { type: "integer", minimum: 0 },
            },
          },
          // ── Row ops ───────────────────────────────────────────────────────
          {
            type: "object",
            required: ["op", "label"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["addRow"] },
              label: { type: "string" },
              kind: { type: "string" },
              atIndex: { type: "integer", minimum: 0 },
            },
          },
          {
            type: "object",
            required: ["op", "rowId"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["removeRow"] },
              rowId: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["op", "rowId", "label"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["renameRow"] },
              rowId: { type: "string" },
              label: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["op", "rowId", "toIndex"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["moveRow"] },
              rowId: { type: "string" },
              toIndex: { type: "integer", minimum: 0 },
            },
          },
          // ── Card ops ──────────────────────────────────────────────────────
          {
            type: "object",
            required: ["op", "colId", "rowId", "text"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["addCard"] },
              colId: { type: "string" },
              rowId: { type: "string" },
              text: { type: "string" },
              meta: { type: "object", additionalProperties: { type: "string" } },
              // Optional: make this card a sub-item of the given parent (same col/row).
              // One level only — parent must itself be top-level.
              parentCardId: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["op", "cardId"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["removeCard"] },
              cardId: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["op", "cardId", "text"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["editCard"] },
              cardId: { type: "string" },
              text: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["op", "cardId", "toColId", "toRowId"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["moveCard"] },
              cardId: { type: "string" },
              toColId: { type: "string" },
              toRowId: { type: "string" },
              toOrder: { type: "integer", minimum: 0 },
            },
          },
          // Reparent a card under a new parent, or promote a sub-item to top-level with null.
          {
            type: "object",
            required: ["op", "cardId", "newParentCardId"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["reparentCard"] },
              cardId: { type: "string" },
              newParentCardId: { oneOf: [{ type: "string" }, { type: "null" }] },
              toOrder: { type: "integer", minimum: 0 },
            },
          },
          // ── Meta ops ──────────────────────────────────────────────────────
          {
            type: "object",
            required: ["op", "cardId", "key"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["setCardMeta"] },
              cardId: { type: "string" },
              key: { type: "string" },
              value: { oneOf: [{ type: "string" }, { type: "null" }] },
            },
          },
          {
            type: "object",
            required: ["op", "key", "value"],
            additionalProperties: false,
            properties: {
              op: { type: "string", enum: ["setMapMeta"] },
              key: { type: "string" },
              value: { type: "string" },
            },
          },
        ],
      },
    },
  },
} as const;
