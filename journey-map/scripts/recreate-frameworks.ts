/**
 * scripts/recreate-frameworks.ts
 *
 * Parallel agent orchestration. For each framework, fires all 4 framework-
 * specific actions CONCURRENTLY (Promise.all) against the seed board, then
 * union-merges their outputs into a single final board. Both frameworks run
 * in parallel too — so total wall-clock ≈ slowest single agent (~10-15 s).
 *
 * Run with:
 *   npx tsx scripts/recreate-frameworks.ts            (both, parallel)
 *   npx tsx scripts/recreate-frameworks.ts sb         (service-blueprint only)
 *   npx tsx scripts/recreate-frameworks.ts jm         (journey-map only)
 *
 * Writes final state to /tmp/{sb,jm}-recreated.json.
 */

import { writeFileSync } from "node:fs";
import {
  SB_CELLS, SB_EDGES, SB_ACTIONS, SB_ROW_LABELS, SB_COL_LABELS, SB_CONFIG,
  SB_FRAMEWORK_NAME, SB_INSTANCE_CONTEXT, SB_STRUCTURE_HINT,
} from "../lib/preview-data/service-blueprint";
import {
  JM_CELLS, JM_EDGES, JM_ACTIONS, JM_ROW_LABELS, JM_COL_LABELS, JM_CONFIG,
  JM_FRAMEWORK_NAME, JM_INSTANCE_CONTEXT, JM_STRUCTURE_HINT,
} from "../lib/preview-data/journey-map";
import type { EditableCell, EditableEdge, CustomAction } from "../components/ui/grid/EditableGrid";

type Cluster = { id: string; label?: string; cellIds: string[]; tone?: string };

type Board = {
  cells: EditableCell[];
  edges: EditableEdge[];
  clusters: Cluster[];
  rows: number;
  cols: number;
  rowLabels?: string[];
  colLabels?: string[];
};

type ActionResult = {
  cells: Array<{ id: string; row: number; col: number; text?: string }>;
  rows: number;
  cols: number;
  rowLabels?: string[];
  colLabels?: string[];
  newEdges?: Array<{ fromId: string; toId: string; label?: string }>;
  clusters?: Cluster[];
  warnings?: string[];
};

const PORT = Number(process.env.PORT ?? 3002);
const BASE = `http://localhost:${PORT}`;

async function callAgent(
  frameworkName: string,
  instanceContext: string,
  structureHint: string,
  board: Board,
  action: CustomAction
): Promise<ActionResult> {
  const body = {
    frameworkName,
    instanceContext,
    task: action.task,
    structureHint,
    cells: board.cells.map((c) => ({ id: c.id, row: c.row, col: c.col, text: c.text })),
    edges: board.edges.map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId, label: e.label })),
    clusters: board.clusters.map((c) => ({ id: c.id, label: c.label, cellIds: c.cellIds, tone: c.tone })),
    rows: board.rows,
    cols: board.cols,
    rowLabels: board.rowLabels,
    colLabels: board.colLabels,
    flags: {
      allowNewCells: action.allowNewCells,
      allowNewEdges: action.allowNewEdges,
      allowClusters: action.allowClusters,
      allowLabels: action.allowLabels,
    },
  };

  const res = await fetch(`${BASE}/api/preview/reason`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { ok: boolean; error?: string } & ActionResult;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

function mergeAgentOutputs(seed: Board, actionResults: Array<{ action: CustomAction; result: ActionResult }>): Board {
  // Start from seed cells (preserving original text).
  const byId = new Map<string, EditableCell>();
  for (const c of seed.cells) byId.set(c.id, c);

  // Each agent returned the full cell list — for existing cells, take seed
  // text + the latest position (later agents' positions win on conflict, but
  // usually agents don't move existing cells). For new cells (agent-* ids),
  // merge all unique ones.
  let finalRows = seed.rows;
  let finalCols = seed.cols;
  for (const { result } of actionResults) {
    finalRows = Math.max(finalRows, result.rows);
    finalCols = Math.max(finalCols, result.cols);
    for (const c of result.cells) {
      const existing = byId.get(c.id);
      if (existing) {
        // Don't let agents reshuffle existing cells aggressively.
        byId.set(c.id, { ...existing, row: existing.row, col: existing.col });
      } else if (c.text) {
        byId.set(c.id, { id: c.id, row: c.row, col: c.col, text: c.text });
      }
    }
  }

  // Edges: seed + union of newEdges (dedup by (fromId, toId, label)).
  const edgeKey = (e: { fromId: string; toId: string; label?: string }) =>
    `${e.fromId}→${e.toId}#${e.label ?? ""}`;
  const seenEdges = new Set(seed.edges.map(edgeKey));
  const mergedEdges: EditableEdge[] = [...seed.edges];
  for (const { action, result } of actionResults) {
    for (const [i, e] of (result.newEdges ?? []).entries()) {
      const k = edgeKey(e);
      if (seenEdges.has(k)) continue;
      seenEdges.add(k);
      mergedEdges.push({
        id: `agent-${action.key}-${i}-${Date.now()}`,
        fromId: e.fromId,
        toId: e.toId,
        label: e.label,
      });
    }
  }

  // Clusters: concatenate from all agents, enforce cell-in-one-cluster.
  const claimed = new Set<string>();
  const mergedClusters: Cluster[] = [];
  for (const { result } of actionResults) {
    for (const c of result.clusters ?? []) {
      const validMembers = c.cellIds.filter((id) => byId.has(id) && !claimed.has(id));
      if (validMembers.length < 2) continue;
      for (const id of validMembers) claimed.add(id);
      mergedClusters.push({
        id: c.id,
        label: c.label,
        cellIds: validMembers,
        tone: c.tone,
      });
    }
  }

  return {
    cells: [...byId.values()],
    edges: mergedEdges,
    clusters: mergedClusters,
    rows: finalRows,
    cols: finalCols,
    rowLabels: seed.rowLabels,
    colLabels: seed.colLabels,
  };
}

type FrameworkRun = {
  name: string;
  instanceContext: string;
  structureHint: string;
  seed: Board;
  actions: CustomAction[];
};

async function runFramework(run: FrameworkRun, shortName: string) {
  const tStart = Date.now();
  console.log(`[${shortName}] firing ${run.actions.length} agents in parallel against seed (${run.seed.cells.length} cells, ${run.seed.edges.length} edges)…`);

  const settled = await Promise.allSettled(
    run.actions.map(async (action) => {
      const t0 = Date.now();
      const result = await callAgent(run.name, run.instanceContext, run.structureHint, run.seed, action);
      const elapsed = Math.round((Date.now() - t0) / 100) / 10;
      return { action, result, elapsed };
    })
  );

  const successful: Array<{ action: CustomAction; result: ActionResult }> = [];
  for (const [i, s] of settled.entries()) {
    const action = run.actions[i];
    if (s.status === "fulfilled") {
      const r = s.value;
      const newCells = r.result.cells.filter((c) => !run.seed.cells.some((sc) => sc.id === c.id)).length;
      console.log(`  [${shortName}] ✓ ${action.label} (${r.elapsed}s) — +${newCells} cells, ${(r.result.newEdges ?? []).length} edges, ${(r.result.clusters ?? []).length} clusters`);
      successful.push({ action, result: r.result });
    } else {
      console.log(`  [${shortName}] ✕ ${action.label} — ${s.reason instanceof Error ? s.reason.message : s.reason}`);
    }
  }

  const finalBoard = mergeAgentOutputs(run.seed, successful);
  const totalElapsed = Math.round((Date.now() - tStart) / 100) / 10;
  const addedCells = finalBoard.cells.length - run.seed.cells.length;
  const addedEdges = finalBoard.edges.length - run.seed.edges.length;
  console.log(`[${shortName}] done in ${totalElapsed}s · final: ${finalBoard.cells.length} cells (+${addedCells}), ${finalBoard.edges.length} edges (+${addedEdges}), ${finalBoard.clusters.length} clusters`);

  return { finalBoard, history: successful.map((s) => ({ action: s.action.label, result: s.result })), elapsed: totalElapsed };
}

async function main() {
  const which = process.argv[2]?.toLowerCase();
  const doSB = !which || which === "sb" || which === "service-blueprint";
  const doJM = !which || which === "jm" || which === "journey-map";

  const tStart = Date.now();
  console.log(`\n═══ parallel framework recreation ═══`);
  console.log(`targets: ${[doSB && "sb", doJM && "jm"].filter(Boolean).join(" + ")}\n`);

  const tasks: Array<Promise<any>> = [];
  if (doSB) {
    tasks.push(
      runFramework({
        name: SB_FRAMEWORK_NAME,
        instanceContext: SB_INSTANCE_CONTEXT,
        structureHint: SB_STRUCTURE_HINT,
        seed: {
          cells: [...SB_CELLS],
          edges: [...SB_EDGES],
          clusters: [],
          rows: SB_CONFIG.rows,
          cols: SB_CONFIG.cols,
          rowLabels: [...SB_ROW_LABELS],
          colLabels: [...SB_COL_LABELS],
        },
        actions: SB_ACTIONS,
      }, "sb").then((r) => {
        writeFileSync("/tmp/sb-recreated.json", JSON.stringify(r, null, 2));
        console.log(`  [sb] → /tmp/sb-recreated.json`);
        return { name: "sb", ...r };
      })
    );
  }
  if (doJM) {
    tasks.push(
      runFramework({
        name: JM_FRAMEWORK_NAME,
        instanceContext: JM_INSTANCE_CONTEXT,
        structureHint: JM_STRUCTURE_HINT,
        seed: {
          cells: [...JM_CELLS],
          edges: [...JM_EDGES],
          clusters: [],
          rows: JM_CONFIG.rows,
          cols: JM_CONFIG.cols,
          rowLabels: [...JM_ROW_LABELS],
          colLabels: [...JM_COL_LABELS],
        },
        actions: JM_ACTIONS,
      }, "jm").then((r) => {
        writeFileSync("/tmp/jm-recreated.json", JSON.stringify(r, null, 2));
        console.log(`  [jm] → /tmp/jm-recreated.json`);
        return { name: "jm", ...r };
      })
    );
  }

  const results = await Promise.all(tasks);
  const totalElapsed = Math.round((Date.now() - tStart) / 100) / 10;

  console.log(`\n═══ summary ═══`);
  for (const r of results) {
    const c = r.finalBoard.cells.length;
    const e = r.finalBoard.edges.length;
    const cl = r.finalBoard.clusters.length;
    console.log(`  ${r.name}: cells=${c} edges=${e} clusters=${cl} (in ${r.elapsed}s)`);
  }
  console.log(`\ntotal wall-clock: ${totalElapsed}s`);
}

main().catch((err) => {
  console.error(`\n✕ fatal: ${err.message}`);
  process.exit(1);
});
