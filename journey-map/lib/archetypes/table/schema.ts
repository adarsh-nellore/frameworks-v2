// ---------------------------------------------------------------------------
// Table archetype: the "spreadsheet" output. Typed columns, keyed rows. Not
// cards-on-a-grid — this is a real data table. Intended for inventories,
// rosters, comparison lists, and anything where the user's mental model is
// "rows of records with defined fields".
// ---------------------------------------------------------------------------

export type ColumnType = "text" | "number" | "enum" | "date";

export type ColumnDef = {
  id: string; // c1, c2, ...
  label: string;
  type: ColumnType;
  description?: string;
  /** Required when type === "enum". Non-empty string set. */
  options?: string[];
};

export type CellValue = string | number | null;

export type TableRow = {
  id: string; // r1, r2, ...
  values: Record<string, CellValue>;
};

export type TableDoc = {
  id: string;
  title: string;
  subtitle?: string;
  columns: ColumnDef[];
  rows: TableRow[];
};

export type TableSelection =
  | { type: "rows"; ids: string[] }
  | { type: "column"; id: string }
  | null;

const COL_ID = /^c\d+$/;
const ROW_ID = /^r\d+$/;
const COLUMN_TYPES: ReadonlySet<ColumnType> = new Set([
  "text",
  "number",
  "enum",
  "date",
]);

export function validateTableDoc(
  doc: unknown
): { ok: true; doc: TableDoc } | { ok: false; reason: string } {
  if (!doc || typeof doc !== "object") {
    return { ok: false, reason: "doc is not an object" };
  }
  const d = doc as TableDoc;

  if (typeof d.id !== "string" || !d.id)
    return { ok: false, reason: "missing id" };
  if (typeof d.title !== "string" || !d.title)
    return { ok: false, reason: "missing title" };
  if (d.subtitle !== undefined && typeof d.subtitle !== "string")
    return { ok: false, reason: "subtitle must be string when present" };

  if (!Array.isArray(d.columns) || d.columns.length === 0)
    return { ok: false, reason: "columns must be a non-empty array" };

  const seenColIds = new Set<string>();
  const seenColLabels = new Set<string>();
  for (const col of d.columns) {
    if (!col || typeof col !== "object")
      return { ok: false, reason: "column is not an object" };
    if (typeof col.id !== "string" || !COL_ID.test(col.id))
      return { ok: false, reason: `column id "${col.id}" must match ^c\\d+$` };
    if (seenColIds.has(col.id))
      return { ok: false, reason: `duplicate column id "${col.id}"` };
    seenColIds.add(col.id);

    if (typeof col.label !== "string" || !col.label.trim())
      return { ok: false, reason: `column ${col.id} missing label` };
    const labelKey = col.label.trim().toLowerCase();
    if (seenColLabels.has(labelKey))
      return { ok: false, reason: `duplicate column label "${col.label}"` };
    seenColLabels.add(labelKey);

    if (!COLUMN_TYPES.has(col.type))
      return {
        ok: false,
        reason: `column ${col.id} has invalid type "${col.type}"`,
      };
    if (col.type === "enum") {
      if (!Array.isArray(col.options) || col.options.length === 0)
        return {
          ok: false,
          reason: `column ${col.id} is enum but missing options`,
        };
      const dupes = new Set<string>();
      for (const o of col.options) {
        if (typeof o !== "string" || !o.trim())
          return {
            ok: false,
            reason: `column ${col.id} has empty enum option`,
          };
        if (dupes.has(o))
          return {
            ok: false,
            reason: `column ${col.id} has duplicate enum option "${o}"`,
          };
        dupes.add(o);
      }
    } else if (col.options !== undefined) {
      return {
        ok: false,
        reason: `column ${col.id} type ${col.type} must not include options`,
      };
    }
  }

  if (!Array.isArray(d.rows)) return { ok: false, reason: "rows not an array" };

  const seenRowIds = new Set<string>();
  for (const row of d.rows) {
    if (!row || typeof row !== "object")
      return { ok: false, reason: "row is not an object" };
    if (typeof row.id !== "string" || !ROW_ID.test(row.id))
      return { ok: false, reason: `row id "${row.id}" must match ^r\\d+$` };
    if (seenRowIds.has(row.id))
      return { ok: false, reason: `duplicate row id "${row.id}"` };
    seenRowIds.add(row.id);

    if (!row.values || typeof row.values !== "object")
      return { ok: false, reason: `row ${row.id} missing values` };

    for (const [key, value] of Object.entries(row.values)) {
      if (!seenColIds.has(key))
        return {
          ok: false,
          reason: `row ${row.id} references unknown column "${key}"`,
        };
      const col = d.columns.find((c) => c.id === key);
      if (!col) continue; // unreachable but satisfies TS
      if (value === null) continue;
      switch (col.type) {
        case "number":
          if (typeof value !== "number" || Number.isNaN(value))
            return {
              ok: false,
              reason: `row ${row.id} column ${key} expects number, got ${typeof value}`,
            };
          break;
        case "enum":
          if (typeof value !== "string")
            return {
              ok: false,
              reason: `row ${row.id} column ${key} expects string (enum), got ${typeof value}`,
            };
          if (!col.options?.includes(value))
            return {
              ok: false,
              reason: `row ${row.id} column ${key} value "${value}" not in options`,
            };
          break;
        case "text":
        case "date":
          if (typeof value !== "string")
            return {
              ok: false,
              reason: `row ${row.id} column ${key} expects string, got ${typeof value}`,
            };
          break;
      }
    }
  }

  return { ok: true, doc: d };
}

// JSON Schema for the build_table tool — the pipeline's single output boundary.
export const BUILD_TABLE_TOOL_NAME = "build_table";
export const BUILD_TABLE_TOOL_DESCRIPTION =
  "Emit a complete table with columns and rows. Columns define the schema; rows hold records keyed by column id. Return empty rows array if no sources are available.";

export const buildTableToolSchema = {
  type: "object",
  required: ["title", "columns", "rows"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    subtitle: { type: "string", maxLength: 200 },
    columns: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        required: ["id", "label", "type"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^c\\d+$" },
          label: { type: "string", minLength: 1, maxLength: 60 },
          type: { type: "string", enum: ["text", "number", "enum", "date"] },
          description: { type: "string", maxLength: 200 },
          options: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 60 },
            minItems: 1,
          },
        },
      },
    },
    rows: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        required: ["id", "values"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^r\\d+$" },
          values: {
            type: "object",
            additionalProperties: {
              oneOf: [
                { type: "string" },
                { type: "number" },
                { type: "null" },
              ],
            },
          },
        },
      },
    },
  },
} as const;

export function makeEmptyTableDoc(title = "Untitled table"): TableDoc {
  return {
    id: `table-${Date.now()}`,
    title,
    columns: [],
    rows: [],
  };
}
