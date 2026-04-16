import type { JourneyMap, JourneyMapSelection } from "./types";

/** Validate JSON `focus` from POST /api/arrange (journey-map only). */
export function parseAgentFocus(
  u: unknown
):
  | { ok: true; focus: JourneyMapSelection }
  | { ok: false; reason: string } {
  if (typeof u !== "object" || u === null) {
    return { ok: false, reason: "focus must be an object" };
  }
  const o = u as Record<string, unknown>;
  const t = o.type;
  if (t === "blocks") {
    if (!Array.isArray(o.ids)) {
      return { ok: false, reason: "blocks.ids must be an array" };
    }
    if (!o.ids.length || !o.ids.every((x) => typeof x === "string")) {
      return {
        ok: false,
        reason: "blocks.ids must be a non-empty string array",
      };
    }
    return { ok: true, focus: { type: "blocks", ids: o.ids as string[] } };
  }
  if (t === "row") {
    if (typeof o.id !== "string" || !o.id) {
      return { ok: false, reason: "row.id must be a non-empty string" };
    }
    return { ok: true, focus: { type: "row", id: o.id } };
  }
  if (t === "stages") {
    if (!Array.isArray(o.stageIds)) {
      return { ok: false, reason: "stages.stageIds must be an array" };
    }
    if (
      !o.stageIds.length ||
      !o.stageIds.every((x) => typeof x === "string")
    ) {
      return {
        ok: false,
        reason: "stages.stageIds must be a non-empty string array",
      };
    }
    return {
      ok: true,
      focus: { type: "stages", stageIds: o.stageIds as string[] },
    };
  }
  return { ok: false, reason: "focus.type must be blocks, row, or stages" };
}

function toColumnLetter(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  return `C${index + 1}`;
}

function quoteCellText(text: string): string {
  const compact = (text ?? "").replace(/\s+/g, " ").trim();
  return JSON.stringify(compact);
}

function cellCoord(map: JourneyMap, cell: { rowId: string; stageId: string }) {
  const ri = map.rows.findIndex((r) => r.id === cell.rowId);
  const ci = map.stages.findIndex((s) => s.id === cell.stageId);
  if (ri < 0 || ci < 0) return "?";
  return `${toColumnLetter(ci)}${ri + 1}`;
}

function formatSelectionContext(
  map: JourneyMap,
  focus: JourneyMapSelection
): string {
  const header =
    "Selection context (user focus — prefer minimal ops touching this scope unless the instruction clearly rebuilds the whole map):";
  const lines: string[] = [header];

  if (focus.type === "blocks") {
    lines.push("- cells:");
    let any = false;
    for (const id of focus.ids) {
      const cell = map.cells.find((c) => c.id === id);
      if (!cell) continue;
      any = true;
      const coord = cellCoord(map, cell);
      lines.push(
        `  - ${coord} id=${cell.id} rowId=${cell.rowId} stageId=${cell.stageId} text=${quoteCellText(cell.text)}`
      );
    }
    if (!any) return "";
    return lines.join("\n");
  }

  if (focus.type === "row") {
    const row = map.rows.find((r) => r.id === focus.id);
    if (!row) return "";
    lines.push(
      `- row: id=${row.id} label=${quoteCellText(row.label)} kind=${row.kind}`
    );
    return lines.join("\n");
  }

  // stages
  lines.push("- stages:");
  let any = false;
  for (const sid of focus.stageIds) {
    const st = map.stages.find((s) => s.id === sid);
    if (!st) continue;
    any = true;
    lines.push(`  - id=${st.id} label=${quoteCellText(st.label)}`);
  }
  if (!any) return "";
  return lines.join("\n");
}

// Build the compact DSL describing the current map for the agent.
//
// Format:
//
//   cols (left→right):
//     A=Awareness     id=s1
//     B=Consideration id=s2
//     ...
//
//   rows (top→bottom):
//     1=Actions      id=r1 kind=actions
//     2=Touchpoints  id=r2 kind=touchpoints
//     ...
//
//   cells (coord=cellId text):
//     A1=r1-s1 ""
//     B1=r1-s2 ""
//     ...
//
//   Instruction: <user text>
//
// Optional focus appends a Selection context block.
export function renderUserPayload(
  map: JourneyMap,
  instruction: string,
  focus?: unknown
): string {
  const stageWidth = Math.max(
    ...map.stages.map((s) => (s.label || s.id).length),
    1
  );
  const rowWidth = Math.max(
    ...map.rows.map((r) => (r.label || r.id).length),
    1
  );

  const colsLines = map.stages.map((s, i) => {
    const letter = toColumnLetter(i);
    const labelPadded = (s.label || s.id).padEnd(stageWidth, " ");
    return `  ${letter}=${labelPadded} id=${s.id}`;
  });
  const rowsLines = map.rows.map((r, i) => {
    const num = i + 1;
    const labelPadded = (r.label || r.id).padEnd(rowWidth, " ");
    return `  ${num}=${labelPadded} id=${r.id} kind=${r.kind}`;
  });

  const cellsLines: string[] = [];
  for (let r = 0; r < map.rows.length; r++) {
    const row = map.rows[r];
    const parts: string[] = [];
    for (let c = 0; c < map.stages.length; c++) {
      const stage = map.stages[c];
      const cell = map.cells.find(
        (cl) => cl.rowId === row.id && cl.stageId === stage.id
      );
      const coord = `${toColumnLetter(c)}${r + 1}`;
      if (!cell) {
        parts.push(`${coord}=<empty>`);
        continue;
      }
      parts.push(`${coord}=${cell.id} ${quoteCellText(cell.text)}`);
    }
    cellsLines.push(`  ${parts.join("   ")}`);
  }

  let out = [
    "cols (left→right):",
    ...colsLines,
    "",
    "rows (top→bottom):",
    ...rowsLines,
    "",
    "cells (coord=cellId text):",
    ...cellsLines,
    "",
    `Instruction: ${instruction}`,
  ].join("\n");

  if (focus !== undefined && focus !== null) {
    const p = parseAgentFocus(focus);
    if (p.ok) {
      const block = formatSelectionContext(map, p.focus);
      if (block) out = `${out}\n\n${block}`;
    }
  }

  return out;
}
