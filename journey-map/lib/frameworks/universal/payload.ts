import type { UniversalMap, UniversalSelection } from "./types";
import type { FrameworkConfig } from "./config";

// Render the map as a compact DSL the agent can read efficiently.
// Format is the same across all frameworks since the schema is universal.
export function renderMapDSL(map: UniversalMap): string {
  const lines: string[] = [];

  // Title and meta
  lines.push(`title: ${map.title}`);
  if (Object.keys(map.meta).length > 0) {
    lines.push(`meta:`);
    for (const [k, v] of Object.entries(map.meta)) {
      lines.push(`  ${k} = ${JSON.stringify(v)}`);
    }
  }
  lines.push("");

  // Cols
  lines.push(`cols (left→right):`);
  map.cols.forEach((c, i) => {
    const letter = String.fromCharCode(65 + i);
    const kind = c.kind ? ` kind=${c.kind}` : "";
    lines.push(`  ${letter}  id=${c.id}  label=${JSON.stringify(c.label)}${kind}`);
  });
  lines.push("");

  // Rows
  lines.push(`rows (top→bottom):`);
  map.rows.forEach((r, i) => {
    const num = (i + 1).toString();
    const kind = r.kind ? ` kind=${r.kind}` : "";
    lines.push(`  ${num}  id=${r.id}  label=${JSON.stringify(r.label)}${kind}`);
  });
  lines.push("");

  // Cards (grouped by col, then row; children rendered indented under their parent).
  lines.push(`cards (col·row = cardId  text  [meta]):`);
  if (map.cards.length === 0) {
    lines.push("  (none — map is empty)");
  } else {
    const colIdx = new Map(map.cols.map((c, i) => [c.id, i]));
    const rowIdx = new Map(map.rows.map((r, i) => [r.id, i]));

    const topLevel = map.cards.filter((c) => !c.parentCardId);
    const childrenByParent = new Map<string, typeof map.cards>();
    for (const c of map.cards) {
      if (!c.parentCardId) continue;
      const arr = childrenByParent.get(c.parentCardId);
      if (arr) arr.push(c);
      else childrenByParent.set(c.parentCardId, [c]);
    }

    const sortedTop = [...topLevel].sort((a, b) => {
      const ca = colIdx.get(a.colId) ?? 99;
      const cb = colIdx.get(b.colId) ?? 99;
      if (ca !== cb) return ca - cb;
      const ra = rowIdx.get(a.rowId) ?? 99;
      const rb = rowIdx.get(b.rowId) ?? 99;
      if (ra !== rb) return ra - rb;
      return a.order - b.order;
    });

    function fmtMeta(meta: Record<string, string> | undefined): string {
      if (!meta || Object.keys(meta).length === 0) return "";
      return `  [${Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(" ")}]`;
    }

    for (const card of sortedTop) {
      const ci = colIdx.get(card.colId);
      const ri = rowIdx.get(card.rowId);
      const colLetter = ci !== undefined ? String.fromCharCode(65 + ci) : "?";
      const rowNum = ri !== undefined ? (ri + 1).toString() : "?";
      lines.push(
        `  ${colLetter}·${rowNum} = ${card.id}  ${JSON.stringify(card.text)}${fmtMeta(card.meta)}`
      );
      const kids = childrenByParent.get(card.id);
      if (kids && kids.length > 0) {
        const sortedKids = [...kids].sort((a, b) => a.order - b.order);
        for (const child of sortedKids) {
          lines.push(
            `         └ ${child.id}  ${JSON.stringify(child.text)}${fmtMeta(child.meta)}`
          );
        }
      }
    }
  }

  // Connectors — only rendered when the map actually has them. Empty/absent
  // connectors are elided to keep the DSL compact for frameworks that don't
  // use the feature.
  if (map.connectors && map.connectors.length > 0) {
    lines.push("");
    lines.push("connectors (sourceCardId → targetCardId  kind  [label]):");
    for (const e of map.connectors) {
      const kind = e.kind ? `  ${e.kind}` : "";
      const label = e.label ? `  "${e.label}"` : "";
      lines.push(`  ${e.id}:  ${e.sourceCardId} → ${e.targetCardId}${kind}${label}`);
    }
  }

  return lines.join("\n");
}

export function renderUserPayload(
  map: UniversalMap,
  config: FrameworkConfig,
  instruction: string,
  focus?: unknown
): string {
  const sections: string[] = [];

  sections.push(`Framework: ${config.label}`);
  sections.push(`Col vocabulary: "${config.colNoun}"  Row vocabulary: "${config.rowNoun}"  Card vocabulary: "${config.cardNoun}"`);
  if (config.fixedCols) sections.push(`(Cols are FIXED — do not add or remove cols.)`);
  if (config.fixedRows) sections.push(`(Rows are FIXED — do not add or remove rows.)`);
  sections.push("");

  sections.push("Current map:");
  sections.push(renderMapDSL(map));
  sections.push("");

  if (focus) {
    sections.push("Selection focus:");
    sections.push(JSON.stringify(focus, null, 2));
    sections.push("(Scope your changes to this selection unless the instruction explicitly asks for a broader rebuild.)");
    sections.push("");
  }

  sections.push("User instruction:");
  sections.push(instruction);

  return sections.join("\n");
}

// Validate a UniversalSelection-shaped focus object.
export function parseFocus(
  u: unknown
): { ok: true; focus: UniversalSelection } | { ok: false; reason: string } {
  if (!u || typeof u !== "object") return { ok: false, reason: "focus must be an object" };
  const o = u as Record<string, unknown>;
  if (typeof o.type !== "string") return { ok: false, reason: "focus.type missing" };
  if (o.type === "cards") {
    if (!Array.isArray(o.ids) || !o.ids.every((x) => typeof x === "string")) {
      return { ok: false, reason: "focus.ids must be string[]" };
    }
    return { ok: true, focus: { type: "cards", ids: o.ids as string[] } };
  }
  if (o.type === "col") {
    if (typeof o.id !== "string") return { ok: false, reason: "focus.id must be string" };
    return { ok: true, focus: { type: "col", id: o.id } };
  }
  if (o.type === "row") {
    if (typeof o.id !== "string") return { ok: false, reason: "focus.id must be string" };
    return { ok: true, focus: { type: "row", id: o.id } };
  }
  if (o.type === "connector") {
    if (!Array.isArray(o.ids) || !o.ids.every((x) => typeof x === "string")) {
      return { ok: false, reason: "focus.ids must be string[]" };
    }
    return { ok: true, focus: { type: "connector", ids: o.ids as string[] } };
  }
  return { ok: false, reason: `Unknown focus.type: ${o.type}` };
}
