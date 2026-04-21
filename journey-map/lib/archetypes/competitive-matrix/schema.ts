// ---------------------------------------------------------------------------
// Competitive matrix archetype: competitors × capabilities, where cells carry
// STRUCTURED values (presence / score / text) — not free-form cards. The
// whole point is you can scan across a row and see strengths, and scan down
// a column and see who leads on a capability.
// ---------------------------------------------------------------------------

export type CellKind = "presence" | "score" | "text";

export type PresenceValue = "yes" | "no" | "partial" | null;

export type CapabilityDef = {
  id: string; // c1, c2, ...
  label: string;
  kind: CellKind;
  description?: string;
  /** Required when kind === "score". Typical values: 3, 5, 10. */
  maxScore?: number;
};

export type CompetitorDef = {
  id: string; // r1, r2, ...
  label: string;
  tagline?: string;
};

export type CellValue = PresenceValue | number | string | null;

export type Cell = {
  competitorId: string;
  capabilityId: string;
  value: CellValue;
  note?: string;
};

export type CompetitiveMatrixDoc = {
  id: string;
  title: string;
  subject?: string;
  competitors: CompetitorDef[];
  capabilities: CapabilityDef[];
  cells: Cell[];
};

export type CompetitiveMatrixSelection =
  | { type: "competitor"; id: string }
  | { type: "capability"; id: string }
  | { type: "cell"; competitorId: string; capabilityId: string }
  | null;

const CAP_ID = /^c\d+$/;
const COMP_ID = /^r\d+$/;
const PRESENCE_VALUES: ReadonlySet<string> = new Set(["yes", "no", "partial"]);

export function validateCompetitiveMatrixDoc(
  doc: unknown
):
  | { ok: true; doc: CompetitiveMatrixDoc }
  | { ok: false; reason: string } {
  if (!doc || typeof doc !== "object") {
    return { ok: false, reason: "doc is not an object" };
  }
  const d = doc as CompetitiveMatrixDoc;
  if (typeof d.id !== "string" || !d.id) return { ok: false, reason: "missing id" };
  if (typeof d.title !== "string" || !d.title)
    return { ok: false, reason: "missing title" };
  if (d.subject !== undefined && typeof d.subject !== "string")
    return { ok: false, reason: "subject must be string when present" };

  if (!Array.isArray(d.competitors) || d.competitors.length === 0)
    return { ok: false, reason: "competitors must be a non-empty array" };
  if (!Array.isArray(d.capabilities) || d.capabilities.length === 0)
    return { ok: false, reason: "capabilities must be a non-empty array" };
  if (!Array.isArray(d.cells)) return { ok: false, reason: "cells not an array" };

  const compIds = new Set<string>();
  const compLabels = new Set<string>();
  for (const c of d.competitors) {
    if (!c || typeof c !== "object")
      return { ok: false, reason: "competitor is not an object" };
    if (typeof c.id !== "string" || !COMP_ID.test(c.id))
      return { ok: false, reason: `competitor id "${c.id}" must match ^r\\d+$` };
    if (compIds.has(c.id))
      return { ok: false, reason: `duplicate competitor id "${c.id}"` };
    compIds.add(c.id);
    if (typeof c.label !== "string" || !c.label.trim())
      return { ok: false, reason: `competitor ${c.id} missing label` };
    const lk = c.label.trim().toLowerCase();
    if (compLabels.has(lk))
      return { ok: false, reason: `duplicate competitor label "${c.label}"` };
    compLabels.add(lk);
  }

  const capIds = new Set<string>();
  const capLabels = new Set<string>();
  const capsByKind = new Map<string, CellKind>();
  const capsMaxScore = new Map<string, number>();
  for (const c of d.capabilities) {
    if (!c || typeof c !== "object")
      return { ok: false, reason: "capability is not an object" };
    if (typeof c.id !== "string" || !CAP_ID.test(c.id))
      return { ok: false, reason: `capability id "${c.id}" must match ^c\\d+$` };
    if (capIds.has(c.id))
      return { ok: false, reason: `duplicate capability id "${c.id}"` };
    capIds.add(c.id);
    if (typeof c.label !== "string" || !c.label.trim())
      return { ok: false, reason: `capability ${c.id} missing label` };
    const lk = c.label.trim().toLowerCase();
    if (capLabels.has(lk))
      return { ok: false, reason: `duplicate capability label "${c.label}"` };
    capLabels.add(lk);
    if (c.kind !== "presence" && c.kind !== "score" && c.kind !== "text")
      return { ok: false, reason: `capability ${c.id} has invalid kind "${c.kind}"` };
    capsByKind.set(c.id, c.kind);
    if (c.kind === "score") {
      if (
        typeof c.maxScore !== "number" ||
        !Number.isFinite(c.maxScore) ||
        c.maxScore <= 0
      )
        return {
          ok: false,
          reason: `capability ${c.id} kind=score requires positive numeric maxScore`,
        };
      capsMaxScore.set(c.id, c.maxScore);
    } else if (c.maxScore !== undefined) {
      return {
        ok: false,
        reason: `capability ${c.id} kind=${c.kind} must not include maxScore`,
      };
    }
  }

  const seenCells = new Set<string>();
  for (const cell of d.cells) {
    if (!cell || typeof cell !== "object")
      return { ok: false, reason: "cell is not an object" };
    if (!compIds.has(cell.competitorId))
      return {
        ok: false,
        reason: `cell references unknown competitor "${cell.competitorId}"`,
      };
    if (!capIds.has(cell.capabilityId))
      return {
        ok: false,
        reason: `cell references unknown capability "${cell.capabilityId}"`,
      };
    const key = `${cell.competitorId}:${cell.capabilityId}`;
    if (seenCells.has(key))
      return { ok: false, reason: `duplicate cell at ${key}` };
    seenCells.add(key);

    const kind = capsByKind.get(cell.capabilityId)!;
    if (cell.value !== null) {
      switch (kind) {
        case "presence":
          if (typeof cell.value !== "string" || !PRESENCE_VALUES.has(cell.value))
            return {
              ok: false,
              reason: `cell ${key} presence expects "yes"|"no"|"partial", got ${JSON.stringify(cell.value)}`,
            };
          break;
        case "score": {
          if (typeof cell.value !== "number" || !Number.isFinite(cell.value))
            return {
              ok: false,
              reason: `cell ${key} score expects number, got ${typeof cell.value}`,
            };
          const max = capsMaxScore.get(cell.capabilityId) ?? 0;
          if (cell.value < 0 || cell.value > max)
            return {
              ok: false,
              reason: `cell ${key} score ${cell.value} out of range [0, ${max}]`,
            };
          break;
        }
        case "text":
          if (typeof cell.value !== "string")
            return {
              ok: false,
              reason: `cell ${key} text expects string, got ${typeof cell.value}`,
            };
          break;
      }
    }
    if (cell.note !== undefined && typeof cell.note !== "string")
      return { ok: false, reason: `cell ${key} note must be string when present` };
  }

  return { ok: true, doc: d };
}

export const BUILD_MATRIX_TOOL_NAME = "build_competitive_matrix";
export const BUILD_MATRIX_TOOL_DESCRIPTION =
  "Emit a complete competitive matrix: competitors (rows), capabilities (columns with typed cell kinds), and cells carrying presence / score / text values keyed by (competitorId, capabilityId).";

export const buildMatrixToolSchema = {
  type: "object",
  required: ["title", "competitors", "capabilities", "cells"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    subject: { type: "string", maxLength: 200 },
    competitors: {
      type: "array",
      minItems: 2,
      maxItems: 15,
      items: {
        type: "object",
        required: ["id", "label"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^r\\d+$" },
          label: { type: "string", minLength: 1, maxLength: 60 },
          tagline: { type: "string", maxLength: 140 },
        },
      },
    },
    capabilities: {
      type: "array",
      minItems: 3,
      maxItems: 20,
      items: {
        type: "object",
        required: ["id", "label", "kind"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^c\\d+$" },
          label: { type: "string", minLength: 1, maxLength: 60 },
          kind: { type: "string", enum: ["presence", "score", "text"] },
          description: { type: "string", maxLength: 200 },
          maxScore: { type: "number", minimum: 1, maximum: 100 },
        },
      },
    },
    cells: {
      type: "array",
      items: {
        type: "object",
        required: ["competitorId", "capabilityId", "value"],
        additionalProperties: false,
        properties: {
          competitorId: { type: "string", pattern: "^r\\d+$" },
          capabilityId: { type: "string", pattern: "^c\\d+$" },
          value: {
            oneOf: [
              { type: "string" },
              { type: "number" },
              { type: "null" },
            ],
          },
          note: { type: "string", maxLength: 280 },
        },
      },
    },
  },
} as const;
