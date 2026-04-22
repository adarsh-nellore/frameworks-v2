// ──────────────────────────────────────────────────────────────────────────────
// Shared post-processor for the `arrange_grid` tool output.
//
// Both /api/preview/rearrange (single-shot) and /api/preview/reason (3-agent)
// run their executor's output through this. Keeps validation, collision
// resolution, cluster checks, edge filtering, and no-op detection in one place
// so the two routes can't drift.
// ──────────────────────────────────────────────────────────────────────────────

export type ExecutorOutput = {
  cells?: Array<{ id: string; row: number; col: number; text?: string }>;
  rows?: number;
  cols?: number;
  rowLabels?: string[];
  colLabels?: string[];
  newEdges?: Array<{ fromId: string; toId: string; label?: string }>;
  clusters?: Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>;
};

export type ActionFlags = {
  allowNewCells?: boolean;
  allowNewEdges?: boolean;
  allowLabels?: boolean;
  allowClusters?: boolean;
  preservePositions?: boolean;
};

export type ProcessInput = {
  rawOutput: ExecutorOutput;
  inputCells: Array<{ id: string; row: number; col: number; text: string }>;
  inputRows: number;
  inputCols: number;
  flags: ActionFlags;
};

export type ProcessResult = {
  cells: Array<{ id: string; row: number; col: number; text?: string }>;
  rows: number;
  cols: number;
  rowLabels?: string[];
  colLabels?: string[];
  newEdges?: Array<{ fromId: string; toId: string; label?: string }>;
  clusters?: Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>;
  warnings: string[];
};

const ALLOWED_TONES = new Set(["neutral", "warn", "success", "info", "accent"]);

export function postProcessExecutorOutput(input: ProcessInput): ProcessResult {
  const { rawOutput, inputCells, inputRows, inputCols, flags } = input;

  if (!Array.isArray(rawOutput.cells) || typeof rawOutput.rows !== "number" || typeof rawOutput.cols !== "number") {
    throw new Error("Malformed tool output — missing cells / rows / cols.");
  }

  const warnings: string[] = [];
  const rows = Math.max(1, Math.min(30, Math.round(rawOutput.rows)));
  const cols = Math.max(1, Math.min(30, Math.round(rawOutput.cols)));

  const inputIds = new Set(inputCells.map((c) => c.id));

  // Split the model's cells into existing updates vs new-cell introductions.
  const outputByExistingId = new Map<string, { id: string; row: number; col: number; text?: string }>();
  const newCells: Array<{ id: string; row: number; col: number; text: string }> = [];
  for (const c of rawOutput.cells) {
    if (inputIds.has(c.id)) {
      outputByExistingId.set(c.id, c);
    } else if (flags.allowNewCells && typeof c.text === "string" && c.text.trim().length > 0) {
      newCells.push({
        id: c.id,
        row: Math.max(0, Math.min(rows - 1, Math.round(c.row))),
        col: Math.max(0, Math.min(cols - 1, Math.round(c.col))),
        text: c.text.trim(),
      });
    }
    // Otherwise: silently drop hallucinated ids on actions that don't allow introductions.
  }

  if (outputByExistingId.size !== inputIds.size) {
    warnings.push(
      `Model omitted ${inputIds.size - outputByExistingId.size} existing cells — keeping their original positions.`
    );
  }

  // Merge existing cells (preserving positions if the action requires it).
  type Placed = { id: string; row: number; col: number; text?: string };
  const placed: Placed[] = inputCells.map((c) => {
    if (flags.preservePositions) {
      return { id: c.id, row: c.row, col: c.col };
    }
    const o = outputByExistingId.get(c.id);
    if (!o) return { id: c.id, row: c.row, col: c.col };
    return {
      id: c.id,
      row: Math.max(0, Math.min(rows - 1, Math.round(o.row))),
      col: Math.max(0, Math.min(cols - 1, Math.round(o.col))),
    };
  });
  for (const n of newCells) placed.push(n);

  // Collision resolution for the combined set.
  const occupied = new Set<string>();
  let collisionCount = 0;
  for (const p of placed) {
    const key = `${p.row}:${p.col}`;
    if (!occupied.has(key)) {
      occupied.add(key);
      continue;
    }
    collisionCount++;
    outer: for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = `${r}:${c}`;
        if (!occupied.has(k)) {
          p.row = r;
          p.col = c;
          occupied.add(k);
          break outer;
        }
      }
    }
  }
  if (collisionCount > 0) {
    warnings.push(`Resolved ${collisionCount} position collisions by nudging to free slots.`);
  }

  // Section labels (only when the action asked for them).
  let rowLabels: string[] | undefined;
  let colLabels: string[] | undefined;
  if (flags.allowLabels) {
    if (Array.isArray(rawOutput.rowLabels)) {
      rowLabels = Array.from({ length: rows }, (_, i) => String(rawOutput.rowLabels![i] ?? ""));
    }
    if (Array.isArray(rawOutput.colLabels)) {
      colLabels = Array.from({ length: cols }, (_, i) => String(rawOutput.colLabels![i] ?? ""));
    }
  }

  if (newCells.length > 0) {
    warnings.push(`Agent introduced ${newCells.length} new cell${newCells.length === 1 ? "" : "s"}.`);
  }

  // Clusters: every cellId must resolve to a known cell; a cell can appear in
  // at most one cluster (later memberships drop); minimum 2 members.
  let clusters:
    | Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>
    | undefined;
  if (flags.allowClusters && Array.isArray(rawOutput.clusters)) {
    const knownIds = new Set<string>([...inputIds, ...newCells.map((c) => c.id)]);
    const claimed = new Set<string>();
    let dropped = 0;
    const validated: typeof clusters = [];
    for (const c of rawOutput.clusters) {
      const validMembers: string[] = [];
      for (const cid of c.cellIds ?? []) {
        if (!knownIds.has(cid) || claimed.has(cid)) continue;
        validMembers.push(cid);
        claimed.add(cid);
      }
      if (validMembers.length < 2) {
        dropped++;
        continue;
      }
      validated.push({
        id: c.id,
        label: c.label,
        cellIds: validMembers,
        tone: ALLOWED_TONES.has(c.tone ?? "neutral") ? c.tone : "neutral",
      });
    }
    clusters = validated;
    if (dropped > 0) {
      warnings.push(
        `Dropped ${dropped} cluster${dropped === 1 ? "" : "s"} with fewer than 2 valid members.`
      );
    }
    if (clusters.length > 0) {
      warnings.push(
        `Agent formed ${clusters.length} cluster${clusters.length === 1 ? "" : "s"}.`
      );
    }
  }

  // New edges: only keep those where both endpoints resolve to known cells.
  let newEdges: Array<{ fromId: string; toId: string; label?: string }> | undefined;
  if (flags.allowNewEdges && Array.isArray(rawOutput.newEdges)) {
    const knownIds = new Set<string>([...inputIds, ...newCells.map((c) => c.id)]);
    const filtered = rawOutput.newEdges.filter(
      (e) => knownIds.has(e.fromId) && knownIds.has(e.toId) && e.fromId !== e.toId
    );
    if (filtered.length) {
      newEdges = filtered.map((e) => ({
        fromId: e.fromId,
        toId: e.toId,
        label: e.label,
      }));
    }
    if (filtered.length < rawOutput.newEdges.length) {
      warnings.push(
        `Dropped ${rawOutput.newEdges.length - filtered.length} edges referencing unknown cell ids.`
      );
    }
    if (newEdges?.length) {
      warnings.push(`Agent introduced ${newEdges.length} new edge${newEdges.length === 1 ? "" : "s"}.`);
    }
  }

  // No-op detection: if nothing moved, no new cells, no new labels, no new
  // clusters, no new edges, no grid resize — the action didn't land.
  const inputPosById = new Map(inputCells.map((c) => [c.id, `${c.row}:${c.col}`]));
  const moved = placed.filter((p) => {
    if (!inputPosById.has(p.id)) return false; // new cells don't count
    return inputPosById.get(p.id) !== `${p.row}:${p.col}`;
  });
  const labelsChanged =
    (rawOutput.rowLabels !== undefined && rawOutput.rowLabels.some((s) => s && s.length > 0)) ||
    (rawOutput.colLabels !== undefined && rawOutput.colLabels.some((s) => s && s.length > 0));
  const gridResized = rows !== inputRows || cols !== inputCols;
  const clustersReturned =
    Array.isArray(rawOutput.clusters) && rawOutput.clusters.length > 0 && !!flags.allowClusters;
  const edgesReturned =
    Array.isArray(rawOutput.newEdges) && rawOutput.newEdges.length > 0 && !!flags.allowNewEdges;
  if (
    moved.length === 0 &&
    newCells.length === 0 &&
    !labelsChanged &&
    !gridResized &&
    collisionCount === 0 &&
    !clustersReturned &&
    !edgesReturned
  ) {
    warnings.push(`Action didn't apply cleanly to this framework — agent returned it unchanged.`);
  }

  return {
    cells: placed,
    rows,
    cols,
    rowLabels,
    colLabels,
    newEdges,
    clusters,
    warnings,
  };
}
