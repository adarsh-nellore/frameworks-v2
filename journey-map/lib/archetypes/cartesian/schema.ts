// ---------------------------------------------------------------------------
// Cartesian plot archetype: points placed on continuous x/y axes. The "2D
// decision space" frameworks — effort × impact, magic quadrant, roadmap by
// horizon, positioning maps. Not a matrix of cards; a real plot.
// ---------------------------------------------------------------------------

export type Axis = {
  label: string;
  min: number;
  max: number;
  unit?: string;
  /** Optional discrete tick labels rendered along the axis (e.g. ["Q1","Q2",…]). */
  tickLabels?: string[];
  /** Friendly names for the axis ends, rendered in small text at min and max. */
  lowAnchor?: string;
  highAnchor?: string;
};

export type QuadrantLocation = "ll" | "lh" | "hl" | "hh"; // x,y: low/high

export type Quadrant = {
  id: string; // q1, q2, q3, q4
  location: QuadrantLocation;
  label: string;
  description?: string;
};

export type Category = {
  id: string; // k1, k2, …
  label: string;
  /** Hex without leading #. */
  color?: string;
};

export type Point = {
  id: string; // p1, p2, …
  label: string;
  x: number;
  y: number;
  /** Bubble size, 0–10. Optional. */
  size?: number;
  categoryId?: string;
  tagline?: string;
  note?: string;
};

export type CartesianDoc = {
  id: string;
  title: string;
  subject?: string;
  xAxis: Axis;
  yAxis: Axis;
  quadrants?: Quadrant[];
  categories?: Category[];
  points: Point[];
};

export type CartesianSelection =
  | { type: "point"; id: string }
  | { type: "points"; ids: string[] }
  | { type: "quadrant"; id: string }
  | null;

const POINT_ID = /^p\d+$/;
const QUAD_ID = /^q[1-4]$/;
const CAT_ID = /^k\d+$/;
const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

export function validateCartesianDoc(
  doc: unknown
): { ok: true; doc: CartesianDoc } | { ok: false; reason: string } {
  if (!doc || typeof doc !== "object") {
    return { ok: false, reason: "doc is not an object" };
  }
  const d = doc as CartesianDoc;
  if (typeof d.id !== "string" || !d.id)
    return { ok: false, reason: "missing id" };
  if (typeof d.title !== "string" || !d.title)
    return { ok: false, reason: "missing title" };
  if (d.subject !== undefined && typeof d.subject !== "string")
    return { ok: false, reason: "subject must be string when present" };

  for (const side of ["xAxis", "yAxis"] as const) {
    const ax = d[side];
    if (!ax || typeof ax !== "object")
      return { ok: false, reason: `${side} missing` };
    if (typeof ax.label !== "string" || !ax.label.trim())
      return { ok: false, reason: `${side}.label missing` };
    if (typeof ax.min !== "number" || !Number.isFinite(ax.min))
      return { ok: false, reason: `${side}.min must be number` };
    if (typeof ax.max !== "number" || !Number.isFinite(ax.max))
      return { ok: false, reason: `${side}.max must be number` };
    if (ax.max <= ax.min)
      return { ok: false, reason: `${side}.max must be > ${side}.min` };
    if (ax.tickLabels !== undefined) {
      if (!Array.isArray(ax.tickLabels))
        return { ok: false, reason: `${side}.tickLabels must be array` };
      for (const t of ax.tickLabels) {
        if (typeof t !== "string")
          return { ok: false, reason: `${side}.tickLabels entries must be strings` };
      }
    }
  }

  if (d.quadrants !== undefined) {
    if (!Array.isArray(d.quadrants))
      return { ok: false, reason: "quadrants must be array when present" };
    const seen = new Set<string>();
    const seenLoc = new Set<QuadrantLocation>();
    for (const q of d.quadrants) {
      if (!q || typeof q !== "object")
        return { ok: false, reason: "quadrant is not an object" };
      if (typeof q.id !== "string" || !QUAD_ID.test(q.id))
        return { ok: false, reason: `quadrant id "${q.id}" must match ^q[1-4]$` };
      if (seen.has(q.id))
        return { ok: false, reason: `duplicate quadrant id "${q.id}"` };
      seen.add(q.id);
      if (
        q.location !== "ll" &&
        q.location !== "lh" &&
        q.location !== "hl" &&
        q.location !== "hh"
      )
        return { ok: false, reason: `quadrant ${q.id} bad location "${q.location}"` };
      if (seenLoc.has(q.location))
        return {
          ok: false,
          reason: `quadrant location "${q.location}" used twice`,
        };
      seenLoc.add(q.location);
      if (typeof q.label !== "string" || !q.label.trim())
        return { ok: false, reason: `quadrant ${q.id} missing label` };
    }
  }

  const categoryIds = new Set<string>();
  if (d.categories !== undefined) {
    if (!Array.isArray(d.categories))
      return { ok: false, reason: "categories must be array when present" };
    const seenLabels = new Set<string>();
    for (const cat of d.categories) {
      if (!cat || typeof cat !== "object")
        return { ok: false, reason: "category is not an object" };
      if (typeof cat.id !== "string" || !CAT_ID.test(cat.id))
        return { ok: false, reason: `category id "${cat.id}" must match ^k\\d+$` };
      if (categoryIds.has(cat.id))
        return { ok: false, reason: `duplicate category id "${cat.id}"` };
      categoryIds.add(cat.id);
      if (typeof cat.label !== "string" || !cat.label.trim())
        return { ok: false, reason: `category ${cat.id} missing label` };
      const lk = cat.label.trim().toLowerCase();
      if (seenLabels.has(lk))
        return { ok: false, reason: `duplicate category label "${cat.label}"` };
      seenLabels.add(lk);
      if (cat.color !== undefined && !HEX_COLOR.test(cat.color))
        return {
          ok: false,
          reason: `category ${cat.id} color must be 6-char hex without leading #`,
        };
    }
  }

  if (!Array.isArray(d.points))
    return { ok: false, reason: "points must be array" };
  const seenPointIds = new Set<string>();
  const seenPointLabels = new Set<string>();
  for (const p of d.points) {
    if (!p || typeof p !== "object")
      return { ok: false, reason: "point is not an object" };
    if (typeof p.id !== "string" || !POINT_ID.test(p.id))
      return { ok: false, reason: `point id "${p.id}" must match ^p\\d+$` };
    if (seenPointIds.has(p.id))
      return { ok: false, reason: `duplicate point id "${p.id}"` };
    seenPointIds.add(p.id);
    if (typeof p.label !== "string" || !p.label.trim())
      return { ok: false, reason: `point ${p.id} missing label` };
    const lk = p.label.trim().toLowerCase();
    if (seenPointLabels.has(lk))
      return { ok: false, reason: `duplicate point label "${p.label}"` };
    seenPointLabels.add(lk);
    if (typeof p.x !== "number" || !Number.isFinite(p.x))
      return { ok: false, reason: `point ${p.id} x must be number` };
    if (typeof p.y !== "number" || !Number.isFinite(p.y))
      return { ok: false, reason: `point ${p.id} y must be number` };
    if (p.x < d.xAxis.min || p.x > d.xAxis.max)
      return {
        ok: false,
        reason: `point ${p.id} x=${p.x} out of xAxis range [${d.xAxis.min}, ${d.xAxis.max}]`,
      };
    if (p.y < d.yAxis.min || p.y > d.yAxis.max)
      return {
        ok: false,
        reason: `point ${p.id} y=${p.y} out of yAxis range [${d.yAxis.min}, ${d.yAxis.max}]`,
      };
    if (p.size !== undefined) {
      if (typeof p.size !== "number" || p.size < 0 || p.size > 10)
        return { ok: false, reason: `point ${p.id} size must be in [0, 10]` };
    }
    if (p.categoryId !== undefined && !categoryIds.has(p.categoryId))
      return {
        ok: false,
        reason: `point ${p.id} references unknown category "${p.categoryId}"`,
      };
  }

  return { ok: true, doc: d };
}

export const BUILD_CARTESIAN_TOOL_NAME = "build_cartesian_plot";
export const BUILD_CARTESIAN_TOOL_DESCRIPTION =
  "Emit a complete cartesian plot: xAxis + yAxis configuration, optional labeled quadrants, optional color categories, and a list of points placed at (x, y).";

export const buildCartesianToolSchema = {
  type: "object",
  required: ["title", "xAxis", "yAxis", "points"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    subject: { type: "string", maxLength: 200 },
    xAxis: axisSchema(),
    yAxis: axisSchema(),
    quadrants: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        required: ["id", "location", "label"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^q[1-4]$" },
          location: {
            type: "string",
            enum: ["ll", "lh", "hl", "hh"],
            description:
              "Which half of each axis: ll = low-x/low-y, lh = low-x/high-y, hl = high-x/low-y, hh = high-x/high-y.",
          },
          label: { type: "string", maxLength: 60 },
          description: { type: "string", maxLength: 200 },
        },
      },
    },
    categories: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        required: ["id", "label"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^k\\d+$" },
          label: { type: "string", maxLength: 40 },
          color: { type: "string", pattern: "^[0-9a-fA-F]{6}$" },
        },
      },
    },
    points: {
      type: "array",
      minItems: 1,
      maxItems: 60,
      items: {
        type: "object",
        required: ["id", "label", "x", "y"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^p\\d+$" },
          label: { type: "string", maxLength: 60 },
          x: { type: "number" },
          y: { type: "number" },
          size: { type: "number", minimum: 0, maximum: 10 },
          categoryId: { type: "string", pattern: "^k\\d+$" },
          tagline: { type: "string", maxLength: 140 },
          note: { type: "string", maxLength: 280 },
        },
      },
    },
  },
} as const;

function axisSchema() {
  return {
    type: "object",
    required: ["label", "min", "max"],
    additionalProperties: false,
    properties: {
      label: { type: "string", minLength: 1, maxLength: 60 },
      min: { type: "number" },
      max: { type: "number" },
      unit: { type: "string", maxLength: 20 },
      tickLabels: { type: "array", items: { type: "string" } },
      lowAnchor: { type: "string", maxLength: 40 },
      highAnchor: { type: "string", maxLength: 40 },
    },
  } as const;
}
