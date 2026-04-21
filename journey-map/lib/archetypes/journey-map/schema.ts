// JSONSchema for the apply_operations tool input: { summary, ops: Op[] }.
// Discriminated union via oneOf on the `op` field.

const opSchemas = [
  {
    type: "object",
    properties: {
      op: { const: "moveRow" },
      rowId: { type: "string" },
      toIndex: { type: "integer", minimum: 0 },
    },
    required: ["op", "rowId", "toIndex"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "moveStage" },
      stageId: { type: "string" },
      toIndex: { type: "integer", minimum: 0 },
    },
    required: ["op", "stageId", "toIndex"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "swapCells" },
      aCellId: { type: "string" },
      bCellId: { type: "string" },
    },
    required: ["op", "aCellId", "bCellId"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "moveCell" },
      cellId: { type: "string" },
      toRowId: { type: "string" },
      toStageId: { type: "string" },
    },
    required: ["op", "cellId", "toRowId", "toStageId"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "createCell" },
      rowId: { type: "string" },
      stageId: { type: "string" },
      text: { type: "string" },
    },
    required: ["op", "rowId", "stageId"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "removeCell" },
      cellId: { type: "string" },
    },
    required: ["op", "cellId"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "setCellText" },
      cellId: { type: "string" },
      text: { type: "string" },
    },
    required: ["op", "cellId", "text"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "renameRow" },
      rowId: { type: "string" },
      label: { type: "string" },
    },
    required: ["op", "rowId", "label"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "renameStage" },
      stageId: { type: "string" },
      label: { type: "string" },
    },
    required: ["op", "stageId", "label"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "addRow" },
      label: { type: "string" },
      kind: {
        type: "string",
        description:
          "Short snake_case kind for theming. Classic kinds: actions, touchpoints, thoughts, emotions, pain_points, opportunities. You may invent new ones (e.g. metrics, stakeholders, systems, channels, decisions, artifacts).",
      },
      toIndex: { type: "integer", minimum: 0 },
    },
    required: ["op", "label", "kind"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "addStage" },
      label: { type: "string" },
      toIndex: { type: "integer", minimum: 0 },
    },
    required: ["op", "label"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "removeRow" },
      rowId: { type: "string" },
    },
    required: ["op", "rowId"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      op: { const: "removeStage" },
      stageId: { type: "string" },
    },
    required: ["op", "stageId"],
    additionalProperties: false,
  },
];

export const toolSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "One short, human-readable sentence describing what these ops collectively accomplish. No internal ids.",
    },
    ops: {
      type: "array",
      description:
        "Ordered list of operations to apply to the journey map. Apply left-to-right.",
      items: { oneOf: opSchemas },
    },
  },
  required: ["summary", "ops"],
} as const;

export const toolName = "apply_operations";
export const toolDescription =
  "Emit a minimal, ordered sequence of operations to apply to the journey map.";

import type { JourneyMap } from "./types";

// Sanity-check that a JourneyMap is structurally valid (used after applyOps).
export function validateMap(
  m: unknown
): { ok: true; map: JourneyMap } | { ok: false; reason: string } {
  if (!m || typeof m !== "object") return { ok: false, reason: "not an object" };
  const map = m as JourneyMap;
  if (!Array.isArray(map.stages) || map.stages.length === 0)
    return { ok: false, reason: "no stages" };
  if (!Array.isArray(map.rows) || map.rows.length === 0)
    return { ok: false, reason: "no rows" };
  if (!Array.isArray(map.cells))
    return { ok: false, reason: "cells is not an array" };
  const stageIds = new Set(map.stages.map((s) => s.id));
  const rowIds = new Set(map.rows.map((r) => r.id));
  const seenIds = new Set<string>();
  const seenPos = new Set<string>();
  for (const c of map.cells) {
    if (!stageIds.has(c.stageId))
      return { ok: false, reason: `cell ${c.id} references unknown stage ${c.stageId}` };
    if (!rowIds.has(c.rowId))
      return { ok: false, reason: `cell ${c.id} references unknown row ${c.rowId}` };
    if (seenIds.has(c.id))
      return { ok: false, reason: `duplicate cell id ${c.id}` };
    seenIds.add(c.id);
    const key = `${c.stageId}:${c.rowId}`;
    if (seenPos.has(key))
      return { ok: false, reason: `duplicate cell at ${key}` };
    seenPos.add(key);
  }
  return { ok: true, map };
}
