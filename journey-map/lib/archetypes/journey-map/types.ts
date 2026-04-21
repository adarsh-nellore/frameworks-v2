// Freeform: any short snake_case kind. The six classic kinds below are the
// defaults, but the agent is free to invent new ones ("metrics",
// "stakeholders", "systems", etc.). UI theming falls back gracefully for
// unknown kinds.
export type RowKind = string;

export const CLASSIC_ROW_KINDS = [
  "actions",
  "touchpoints",
  "thoughts",
  "emotions",
  "pain_points",
  "opportunities",
] as const;

export type Stage = { id: string; label: string };

export type Row = { id: string; label: string; kind: RowKind };

export type Cell = {
  id: string;
  stageId: string;
  rowId: string;
  text: string;
};

export type JourneyMap = {
  id: string;
  title: string;
  persona: string;
  stages: Stage[];
  rows: Row[];
  cells: Cell[];
};

/** Canvas selection sent to the arrange agent as optional focus (blocks XOR row XOR stages). */
export type JourneyMapSelection =
  | { type: "blocks"; ids: string[] }
  | { type: "row"; id: string }
  | { type: "stages"; stageIds: string[] };

export const findCell = (
  map: JourneyMap,
  stageId: string,
  rowId: string
): Cell | undefined =>
  map.cells.find((c) => c.stageId === stageId && c.rowId === rowId);
