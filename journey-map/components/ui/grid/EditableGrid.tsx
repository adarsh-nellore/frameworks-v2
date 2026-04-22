"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

// ──────────────────────────────────────────────────────────────────────────────
// EditableGrid — interactive cell grid with live-Claude agent actions.
//
// Cells carry stable ids, so connectors reference ids (not coordinates) and
// auto-follow when cells move. Grid config (cellW / cellH / gap / cols / rows)
// is state — sliders rewrap the layout live. Drag to move a cell to another
// grid slot; if the slot is occupied the two cells swap. Click to select,
// Delete/Backspace or the panel button removes the cell and any incident
// edges.
//
// Pure v1: no inline text editing, no edge creation, no new cells. Those are
// trivial follow-ups once the drag/config loop feels right.
// ──────────────────────────────────────────────────────────────────────────────

export type EditableCell = {
  id: string;
  row: number;
  col: number;
  text: string;
};

export type EditableEdge = {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  routing?: "orthogonal" | "straight";
};

export type ClusterTone = "neutral" | "warn" | "success" | "info" | "accent";

export type EditableCluster = {
  id: string;
  label?: string;
  cellIds: string[];
  tone?: ClusterTone;
};

export type EditableGridConfig = {
  cellW: number;
  cellH: number;
  gap: number;
  cols: number;
  rows: number;
};

/** Framework-specific action — invokes the 3-agent reasoning pipeline at
 *  /api/preview/reason instead of the single-shot /api/preview/rearrange. */
export type CustomAction = {
  key: string;
  label: string;
  hint?: string;
  /** Directive passed to the Theorist stage. What does "doing this well on
   *  THIS framework" mean? E.g., "Identify the 3-5 moments of truth..." */
  task: string;
  allowNewCells?: boolean;
  allowNewEdges?: boolean;
  allowClusters?: boolean;
  allowLabels?: boolean;
};

type Props = {
  initialCells: EditableCell[];
  initialEdges?: EditableEdge[];
  initialClusters?: EditableCluster[];
  initialConfig?: Partial<EditableGridConfig>;
  rowLabels?: string[];
  colLabels?: string[];
  /** Tells the agent what kind of framework this is so it can preserve
   *  load-bearing structure (swimlanes in processes, hierarchy levels, etc.). */
  structureHint?: "process-flow" | "hierarchy" | "brainstorm-dump" | "matrix" | "timeline";
  /** When set, replaces the 5 generic context-based buttons with framework-
   *  specific ones. Each one invokes the 3-stage reasoning pipeline. */
  customActions?: CustomAction[];
  /** Framework identity for the Theorist stage (e.g. "service-blueprint"). */
  frameworkName?: string;
  /** Instance description for the Theorist (e.g. "Telemedicine visit, 5 swimlanes × 6 phases"). */
  instanceContext?: string;
  /** When true, replace both the generic context-based buttons and custom
   *  framework actions with a freeform prompt textarea + permission toggles.
   *  The user's typed text is passed to the same `/api/preview/reason` pipeline
   *  as the `task` field, so every prompt runs the framework-aware agent. */
  promptMode?: boolean;
};

type ExecutorResultPayload = {
  cells: Array<{ id: string; row: number; col: number; text?: string }>;
  rows: number;
  cols: number;
  rowLabels?: string[];
  colLabels?: string[];
  newEdges?: Array<{ fromId: string; toId: string; label?: string }>;
  clusters?: Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>;
  warnings?: string[];
};

type Side = "left" | "right" | "top" | "bottom";

const DEFAULT_CONFIG: EditableGridConfig = {
  cellW: 150,
  cellH: 90,
  gap: 22,
  cols: 5,
  rows: 4,
};

export function EditableGrid({
  initialCells,
  initialEdges = [],
  initialClusters = [],
  initialConfig,
  rowLabels: initialRowLabels = [],
  colLabels: initialColLabels = [],
  structureHint,
  customActions,
  frameworkName,
  instanceContext,
  promptMode = false,
}: Props) {
  const [promptText, setPromptText] = useState("");
  // Default `allowNewEdges` per structure: only ON for shapes where connectors
  // carry meaning (hierarchy = parent/child tree; process-flow = handoffs).
  // Matrix / timeline / brainstorm-dump express relationships through position
  // or grouping, so edges there are visual noise by default.
  const [promptFlags, setPromptFlags] = useState(() => ({
    allowNewCells: true,
    allowNewEdges: structureHint === "hierarchy" || structureHint === "process-flow",
    allowClusters: true,
    allowLabels: true,
  }));
  const resolvedInitialConfig: EditableGridConfig = { ...DEFAULT_CONFIG, ...initialConfig };
  const [config, setConfig] = useState<EditableGridConfig>(resolvedInitialConfig);
  const [cells, setCells] = useState<EditableCell[]>(initialCells);
  const [edges, setEdges] = useState<EditableEdge[]>(initialEdges);
  const [clusters, setClusters] = useState<EditableCluster[]>(initialClusters);
  const [rowLabels, setRowLabels] = useState<string[]>(initialRowLabels);
  const [colLabels, setColLabels] = useState<string[]>(initialColLabels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Drag state — what's being dragged, and where the cursor is.
  const [drag, setDrag] = useState<{
    id: string;
    grabOffsetX: number; // cursor offset within the card when picked up
    grabOffsetY: number;
    cursorX: number;     // cursor pos relative to grid top-left
    cursorY: number;
    didMove: boolean;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);

  const { cellW, cellH, gap, cols, rows } = config;
  const S = cellH / 80;
  const CORNER_R = 8 * S;
  const STROKE_W = Math.max(1, 1.3 * Math.sqrt(S));
  const MARKER_SIZE = 7 * S;
  const CELL_TEXT_PX = 10.5 * S;
  const AXIS_TEXT_PX = 10 * S;
  const EDGE_LABEL_PX = 9 * S;
  const markerId = `eg-arrowhead-${Math.round(S * 100)}`;

  const gridW = cols * cellW + (cols - 1) * gap;
  const gridH = rows * cellH + (rows - 1) * gap;
  const LABEL_W = rowLabels.length > 0 ? Math.round(140 * S) : 0;
  const LABEL_H = colLabels.length > 0 ? Math.round(28 * S) : 0;

  // Index cells by id and by (row,col).
  const byId = useMemo(() => {
    const m = new Map<string, EditableCell>();
    for (const c of cells) m.set(c.id, c);
    return m;
  }, [cells]);
  const byPos = useMemo(() => {
    const m = new Map<string, EditableCell>();
    for (const c of cells) m.set(`${c.row}:${c.col}`, c);
    return m;
  }, [cells]);

  // Auto-responsive layout: when a cluster with a label anchors above any row
  // > 0, the label floats above the cluster's top edge and will collide with
  // cells in the row above unless `gap` has enough headroom. Compute the
  // minimum required gap from the current scale + cluster label geometry and
  // bump `gap` when we're short. This is deterministic math — no agent call
  // needed. Runs on cluster change + scale change. Never shrinks gap.
  useEffect(() => {
    if (clusters.length === 0) return;
    const hasLabelAboveRow0 = clusters.some((c) => {
      if (!c.label) return false;
      const members = c.cellIds
        .map((id) => byId.get(id))
        .filter((x): x is EditableCell => !!x);
      if (members.length === 0) return false;
      const minRow = Math.min(...members.map((m) => m.row));
      return minRow > 0;
    });
    if (!hasLabelAboveRow0) return;
    const clusterPad = Math.round(10 * S);
    const labelOffset = Math.round(11 * S);
    const labelFont = Math.max(9, 9.5 * S);
    const labelBoxH = Math.ceil(labelFont + 6 * S); // matches px-1.5 py-0.5 + font
    const buffer = Math.round(6 * S);
    const needed = clusterPad + labelOffset + labelBoxH + buffer;
    if (gap < needed) {
      setConfig((prev) => (prev.gap >= needed ? prev : { ...prev, gap: needed }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, cellH, cells]);

  // Clamp cells that fall outside the new grid bounds when config shrinks.
  useEffect(() => {
    setCells((prev) => {
      let mutated = false;
      const next = prev.map((c) => {
        if (c.row < rows && c.col < cols) return c;
        mutated = true;
        // Find first free slot within bounds.
        for (let r = 0; r < rows; r++) {
          for (let cc = 0; cc < cols; cc++) {
            const k = `${r}:${cc}`;
            if (!prev.some((p) => p !== c && p.row === r && p.col === cc && p.row < rows && p.col < cols)) {
              return { ...c, row: r, col: cc };
            }
          }
        }
        return c;
      });
      return mutated ? next : prev;
    });
  }, [rows, cols]);

  // Global pointer handlers for drag. Cursor coords are always converted to the
  // grid's UNSCALED space via rect.width/gridW so drag works under any outer
  // CSS transform (pan/zoom wrapper, accordion, etc.).
  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const grid = gridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const sx = rect.width / gridW || 1;
      const sy = rect.height / gridH || 1;
      setDrag((d) =>
        d
          ? {
              ...d,
              cursorX: (e.clientX - rect.left) / sx,
              cursorY: (e.clientY - rect.top) / sy,
              didMove: d.didMove || Math.abs(e.clientX) >= 0,
            }
          : d
      );
    }
    function onUp() {
      setDrag((d) => {
        if (!d) return null;
        const target = cellAtPoint(d.cursorX, d.cursorY);
        if (target) {
          setCells((prev) => {
            const dragged = prev.find((c) => c.id === d.id);
            if (!dragged) return prev;
            // Already there? No-op.
            if (dragged.row === target.row && dragged.col === target.col) return prev;
            const occupant = prev.find(
              (c) => c.id !== d.id && c.row === target.row && c.col === target.col
            );
            return prev.map((c) => {
              if (c.id === d.id) return { ...c, row: target.row, col: target.col };
              if (occupant && c.id === occupant.id) return { ...c, row: dragged.row, col: dragged.col };
              return c;
            });
          });
        }
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, cellW, cellH, gap, cols, rows]);

  // Translate a pixel point inside the grid to a (row,col) cell, or null if
  // the cursor is in a gutter.
  function cellAtPoint(px: number, py: number): { row: number; col: number } | null {
    if (px < 0 || py < 0) return null;
    const colF = px / (cellW + gap);
    const rowF = py / (cellH + gap);
    const col = Math.floor(colF);
    const row = Math.floor(rowF);
    if (row < 0 || col < 0 || row >= rows || col >= cols) return null;
    const localX = px - col * (cellW + gap);
    const localY = py - row * (cellH + gap);
    if (localX > cellW || localY > cellH) return null;
    return { row, col };
  }

  // Keyboard: delete selected cell.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteCell(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function deleteCell(id: string) {
    setCells((prev) => prev.filter((c) => c.id !== id));
    setEdges((prev) => prev.filter((e) => e.fromId !== id && e.toId !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // ── Agent actions ──────────────────────────────────────────────────────────
  // Every action dispatches to a live Claude call. Each action key has its own
  // prompt + temperature on the server so the behavior MATCHES the old
  // deterministic version (tree → tree, compact → compact, etc.) — the model
  // just does the reasoning instead of hardcoded JS. Temperature drives
  // variance, so repeat clicks can produce different-but-valid arrangements.
  async function runAgentAction(key: string, label: string) {
    if (cells.length === 0) return;
    setLoadingAction(label);
    setLastAction(null);
    setWarnings([]);
    setSelectedId(null);
    try {
      const res = await fetch("/api/preview/rearrange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: key,
          cells: cells.map((c) => ({ id: c.id, row: c.row, col: c.col, text: c.text })),
          edges: edges.map((e) => ({
            id: e.id,
            fromId: e.fromId,
            toId: e.toId,
            label: e.label,
          })),
          clusters: clusters.map((c) => ({
            id: c.id,
            label: c.label,
            cellIds: c.cellIds,
            tone: c.tone,
          })),
          rows: config.rows,
          cols: config.cols,
          structureHint,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        cells?: Array<{ id: string; row: number; col: number; text?: string }>;
        rows?: number;
        cols?: number;
        rowLabels?: string[];
        colLabels?: string[];
        newEdges?: Array<{ fromId: string; toId: string; label?: string }>;
        clusters?: Array<{ id: string; label?: string; cellIds: string[]; tone?: string }>;
        warnings?: string[];
      };
      if (!data.ok || !data.cells || typeof data.rows !== "number" || typeof data.cols !== "number") {
        throw new Error(data.error ?? "Malformed agent response");
      }
      // Merge back into full cell objects. New cells (id not in current state)
      // come in with text from the server; existing cells keep their text.
      const byIdLocal = new Map(cells.map((c) => [c.id, c]));
      const next: EditableCell[] = data.cells.map((c) => {
        const base = byIdLocal.get(c.id);
        if (!base) {
          return { id: c.id, row: c.row, col: c.col, text: c.text ?? "" };
        }
        return { ...base, row: c.row, col: c.col };
      });
      setCells(next);
      setConfig((prev) => ({ ...prev, rows: data.rows!, cols: data.cols! }));
      if (data.rowLabels !== undefined) setRowLabels(data.rowLabels);
      if (data.colLabels !== undefined) setColLabels(data.colLabels);
      if (data.newEdges && data.newEdges.length > 0) {
        setEdges((prev) => {
          const next = [...prev];
          let counter = prev.length;
          for (const e of data.newEdges!) {
            next.push({
              id: `agent-edge-${++counter}-${Date.now()}`,
              fromId: e.fromId,
              toId: e.toId,
              label: e.label,
            });
          }
          return next;
        });
      }
      if (data.clusters !== undefined) {
        // Full replacement — form-clusters semantics say "here is the new clustering"
        setClusters(
          data.clusters.map((c) => ({
            id: c.id,
            label: c.label,
            cellIds: c.cellIds,
            tone: (c.tone as ClusterTone | undefined) ?? "neutral",
          }))
        );
      }
      setLastAction(`${label} · claude`);
      setWarnings(data.warnings ?? []);
      window.setTimeout(() => setLastAction((a) => (a === `${label} · claude` ? null : a)), 3500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setLastAction(`Error · ${message}`);
      window.setTimeout(() => setLastAction((a) => (a?.startsWith("Error") ? null : a)), 5000);
    } finally {
      setLoadingAction(null);
    }
  }

  // ── Framework-specific reasoning (parallel-agent friendly) ─────────────────
  // Each click fires one framework-aware Sonnet call. Runs end-to-end in ~5-10s.
  // Multiple clicks (or a future "recreate" button) can fire these in parallel;
  // the orchestrator script already does this with Promise.all.
  async function runReasoningAction(action: CustomAction) {
    if (cells.length === 0) return;
    if (!frameworkName) {
      console.warn("EditableGrid: customActions require frameworkName");
      return;
    }
    setLoadingAction(action.label);
    setLastAction(null);
    setWarnings([]);
    setSelectedId(null);

    try {
      const res = await fetch("/api/preview/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameworkName,
          instanceContext: instanceContext ?? "",
          task: action.task,
          structureHint,
          cells: cells.map((c) => ({ id: c.id, row: c.row, col: c.col, text: c.text })),
          edges: edges.map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId, label: e.label })),
          clusters: clusters.map((c) => ({ id: c.id, label: c.label, cellIds: c.cellIds, tone: c.tone })),
          rows: config.rows,
          cols: config.cols,
          rowLabels,
          colLabels,
          flags: {
            allowNewCells: action.allowNewCells,
            allowNewEdges: action.allowNewEdges,
            allowClusters: action.allowClusters,
            allowLabels: action.allowLabels,
          },
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
      } & ExecutorResultPayload;

      if (!data.ok || !data.cells || typeof data.rows !== "number" || typeof data.cols !== "number") {
        throw new Error(data.error ?? "Malformed agent response");
      }

      applyExecutorResult(data);
      setLastAction(`${action.label} · claude`);
      window.setTimeout(
        () => setLastAction((a) => (a === `${action.label} · claude` ? null : a)),
        4000
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setLastAction(`Error · ${message}`);
      window.setTimeout(() => setLastAction((a) => (a?.startsWith("Error") ? null : a)), 5000);
    } finally {
      setLoadingAction(null);
    }
  }

  function applyExecutorResult(result: ExecutorResultPayload) {
    const byIdLocal = new Map(cells.map((c) => [c.id, c]));
    const next: EditableCell[] = result.cells.map((c) => {
      const base = byIdLocal.get(c.id);
      if (!base) return { id: c.id, row: c.row, col: c.col, text: c.text ?? "" };
      return { ...base, row: c.row, col: c.col };
    });
    setCells(next);
    setConfig((prev) => ({ ...prev, rows: result.rows, cols: result.cols }));
    if (result.rowLabels !== undefined) setRowLabels(result.rowLabels);
    if (result.colLabels !== undefined) setColLabels(result.colLabels);
    if (result.newEdges && result.newEdges.length > 0) {
      setEdges((prev) => {
        const list = [...prev];
        let counter = prev.length;
        for (const e of result.newEdges!) {
          list.push({
            id: `reason-edge-${++counter}-${Date.now()}`,
            fromId: e.fromId,
            toId: e.toId,
            label: e.label,
          });
        }
        return list;
      });
    }
    if (result.clusters !== undefined) {
      setClusters(
        result.clusters.map((c) => ({
          id: c.id,
          label: c.label,
          cellIds: c.cellIds,
          tone: (c.tone as ClusterTone | undefined) ?? "neutral",
        }))
      );
    }
    setWarnings(result.warnings ?? []);
  }

  function onCellPointerDown(e: ReactPointerEvent<HTMLDivElement>, cell: EditableCell) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = rect.width / gridW || 1;
    const sy = rect.height / gridH || 1;
    const cursorX = (e.clientX - rect.left) / sx;
    const cursorY = (e.clientY - rect.top) / sy;
    const cellLeft = cell.col * (cellW + gap);
    const cellTop = cell.row * (cellH + gap);
    setDrag({
      id: cell.id,
      grabOffsetX: cursorX - cellLeft,
      grabOffsetY: cursorY - cellTop,
      cursorX,
      cursorY,
      didMove: false,
    });
    setSelectedId(cell.id);
  }

  function onCellClick(e: ReactMouseEvent<HTMLDivElement>, cell: EditableCell) {
    e.stopPropagation();
    setSelectedId(cell.id);
  }

  function onGridBackgroundClick() {
    setSelectedId(null);
  }

  // Edge routing — orthogonal step paths with rounded corners.
  function anchor(row: number, col: number, side: Side) {
    const cx = col * (cellW + gap) + cellW / 2;
    const cy = row * (cellH + gap) + cellH / 2;
    const halfW = cellW / 2;
    const halfH = cellH / 2;
    switch (side) {
      case "left":   return { x: cx - halfW, y: cy };
      case "right":  return { x: cx + halfW, y: cy };
      case "top":    return { x: cx, y: cy - halfH };
      case "bottom": return { x: cx, y: cy + halfH };
    }
  }
  function pickSides(dr: number, dc: number): { from: Side; to: Side } {
    if (dr > 0) return { from: "bottom", to: "top" };
    if (dr < 0) return { from: "top", to: "bottom" };
    if (dc > 0) return { from: "right", to: "left" };
    return { from: "left", to: "right" };
  }
  function chooseRouting(e: EditableEdge): "orthogonal" | "straight" {
    if (e.routing) return e.routing;
    return "orthogonal";
  }
  function buildPath(
    fx: number, fy: number,
    tx: number, ty: number,
    fromSide: Side,
    routing: "orthogonal" | "straight"
  ): { d: string; labelPos: { x: number; y: number } } {
    if (routing === "straight" || fx === tx || fy === ty) {
      return {
        d: `M ${fx} ${fy} L ${tx} ${ty}`,
        labelPos: { x: (fx + tx) / 2, y: (fy + ty) / 2 },
      };
    }
    const verticalFrom = fromSide === "top" || fromSide === "bottom";
    if (verticalFrom) {
      const midY = (fy + ty) / 2;
      const sx = tx > fx ? 1 : -1;
      const sy = ty > fy ? 1 : -1;
      const maxR = Math.min(Math.abs(ty - fy) / 2 - 1, Math.abs(tx - fx) / 2 - 1);
      const r = Math.max(0, Math.min(CORNER_R, maxR));
      if (r < 2) {
        return {
          d: `M ${fx} ${fy} L ${fx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`,
          labelPos: { x: (fx + tx) / 2, y: midY },
        };
      }
      return {
        d:
          `M ${fx} ${fy}` +
          ` L ${fx} ${midY - sy * r}` +
          ` Q ${fx} ${midY} ${fx + sx * r} ${midY}` +
          ` L ${tx - sx * r} ${midY}` +
          ` Q ${tx} ${midY} ${tx} ${midY + sy * r}` +
          ` L ${tx} ${ty}`,
        labelPos: { x: (fx + tx) / 2, y: midY },
      };
    }
    const midX = (fx + tx) / 2;
    const sx = tx > fx ? 1 : -1;
    const sy = ty > fy ? 1 : -1;
    const maxR = Math.min(Math.abs(tx - fx) / 2 - 1, Math.abs(ty - fy) / 2 - 1);
    const r = Math.max(0, Math.min(CORNER_R, maxR));
    if (r < 2) {
      return {
        d: `M ${fx} ${fy} L ${midX} ${fy} L ${midX} ${ty} L ${tx} ${ty}`,
        labelPos: { x: midX, y: (fy + ty) / 2 },
      };
    }
    return {
      d:
        `M ${fx} ${fy}` +
        ` L ${midX - sx * r} ${fy}` +
        ` Q ${midX} ${fy} ${midX} ${fy + sy * r}` +
        ` L ${midX} ${ty - sy * r}` +
        ` Q ${midX} ${ty} ${midX + sx * r} ${ty}` +
        ` L ${tx} ${ty}`,
      labelPos: { x: midX, y: (fy + ty) / 2 },
    };
  }

  // Compute drop-target highlight during drag.
  const dropTarget = drag ? cellAtPoint(drag.cursorX, drag.cursorY) : null;

  return (
    <div className="flex items-start gap-6 select-none">
      {/* ── Config panel ──────────────────────────────────────────────────── */}
      <aside className="w-[240px] shrink-0 bg-canvas rounded-xl ring-1 ring-border-soft p-4 flex flex-col gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">Layout</div>
          <Slider label="Cell width" value={cellW} min={80} max={260} step={2}
            onChange={(v) => setConfig((c) => ({ ...c, cellW: v }))} unit="px" />
          <Slider label="Cell height" value={cellH} min={40} max={200} step={2}
            onChange={(v) => setConfig((c) => ({ ...c, cellH: v }))} unit="px" />
          <Slider label="Gap" value={gap} min={0} max={60} step={1}
            onChange={(v) => setConfig((c) => ({ ...c, gap: v }))} unit="px" />
          <Slider label="Columns" value={cols} min={1} max={12} step={1}
            onChange={(v) => setConfig((c) => ({ ...c, cols: v }))} />
          <Slider label="Rows" value={rows} min={1} max={12} step={1}
            onChange={(v) => setConfig((c) => ({ ...c, rows: v }))} />
        </div>

        <div className="border-t border-border-soft pt-3">
          <Slider
            label="Density (gap ÷ cellH)"
            value={Math.round((gap / Math.max(1, cellH)) * 100) / 100}
            min={0}
            max={0.5}
            step={0.01}
            onChange={(v) =>
              setConfig((c) => ({ ...c, gap: Math.round(c.cellH * v) }))
            }
          />
        </div>

        <div className="border-t border-border-soft pt-3">
          {promptMode ? (
            <PromptPanel
              value={promptText}
              onChange={setPromptText}
              flags={promptFlags}
              onFlagsChange={setPromptFlags}
              loading={loadingAction === "Custom prompt"}
              disabled={!!loadingAction || !frameworkName}
              onRun={() => {
                const task = promptText.trim();
                if (!task) return;
                runReasoningAction({
                  key: "prompt",
                  label: "Custom prompt",
                  task,
                  allowNewCells: promptFlags.allowNewCells,
                  allowNewEdges: promptFlags.allowNewEdges,
                  allowClusters: promptFlags.allowClusters,
                  allowLabels: promptFlags.allowLabels,
                });
              }}
            />
          ) : (
          <>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2 flex items-center justify-between">
            <span>Agent actions</span>
            <span className="text-ink-muted/70 normal-case tracking-normal font-sans">live claude</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <AgentButton
              label="Auto-arrange as tree"
              hint="BFS by edges, layered by depth"
              loading={loadingAction === "Auto-arrange as tree"}
              disabled={!!loadingAction}
              onClick={() => runAgentAction("auto-tree", "Auto-arrange as tree")}
            />
            <AgentButton
              label="Compact"
              hint="Remove empty rows + cols between cells"
              loading={loadingAction === "Compact"}
              disabled={!!loadingAction}
              onClick={() => runAgentAction("compact", "Compact")}
            />
            <AgentButton
              label="Spread out"
              hint="Insert breathing room between every cell"
              loading={loadingAction === "Spread out"}
              disabled={!!loadingAction}
              onClick={() => runAgentAction("spread", "Spread out")}
            />
            <AgentButton
              label="Flip orientation"
              hint="Rotate 90° — rows ↔ cols"
              loading={loadingAction === "Flip orientation"}
              disabled={!!loadingAction}
              onClick={() => runAgentAction("flip", "Flip orientation")}
            />
            <AgentButton
              label="Shuffle"
              hint="Scatter cells — high temperature"
              loading={loadingAction === "Shuffle"}
              disabled={!!loadingAction}
              onClick={() => runAgentAction("shuffle", "Shuffle")}
            />
            <AgentButton
              label="Reset"
              hint="Fresh layout — agent picks a natural arrangement"
              variant="ghost"
              loading={loadingAction === "Reset"}
              disabled={!!loadingAction}
              onClick={() => runAgentAction("reset", "Reset")}
            />
          </div>

          {customActions && customActions.length > 0 ? (
            <>
              <div className="mt-3 mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted flex items-center justify-between gap-2">
                <span>Framework actions</span>
                <span className="normal-case tracking-normal font-sans text-ink-muted/70">3-agent · opus+sonnet</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {customActions.map((a) => (
                  <AgentButton
                    key={a.key}
                    label={a.label}
                    hint={a.hint}
                    loading={loadingAction === a.label}
                    disabled={!!loadingAction}
                    onClick={() => runReasoningAction(a)}
                  />
                ))}
                {clusters.length > 0 && (
                  <button
                    onClick={() => setClusters([])}
                    className="w-full text-[10.5px] text-ink-muted hover:text-ink-secondary underline underline-offset-2 py-0.5"
                  >
                    Clear {clusters.length} cluster{clusters.length === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Context-based
              </div>
              <div className="flex flex-col gap-1.5">
                <AgentButton
                  label="Group by theme"
                  hint="Cluster related cells; generate column labels"
                  loading={loadingAction === "Group by theme"}
                  disabled={!!loadingAction}
                  onClick={() => runAgentAction("group-by-theme", "Group by theme")}
                />
                <AgentButton
                  label="Prioritize"
                  hint="Rank by urgency; columns = priority tiers"
                  loading={loadingAction === "Prioritize"}
                  disabled={!!loadingAction}
                  onClick={() => runAgentAction("prioritize", "Prioritize")}
                />
                <AgentButton
                  label="Label sections"
                  hint="Infer row/col labels from current layout (no moves)"
                  loading={loadingAction === "Label sections"}
                  disabled={!!loadingAction}
                  onClick={() => runAgentAction("label-sections", "Label sections")}
                />
                <AgentButton
                  label="Add related ideas"
                  hint="Introduce 3–5 new cells to fill gaps"
                  loading={loadingAction === "Add related ideas"}
                  disabled={!!loadingAction}
                  onClick={() => runAgentAction("add-related", "Add related ideas")}
                />
                <AgentButton
                  label="Form clusters"
                  hint="Draw bounding boxes around related cell groups"
                  loading={loadingAction === "Form clusters"}
                  disabled={!!loadingAction}
                  onClick={() => runAgentAction("form-clusters", "Form clusters")}
                />
                {clusters.length > 0 && (
                  <button
                    onClick={() => setClusters([])}
                    className="w-full text-[10.5px] text-ink-muted hover:text-ink-secondary underline underline-offset-2 py-0.5"
                  >
                    Clear {clusters.length} cluster{clusters.length === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            </>
          )}
          </>
          )}
          {lastAction && (
            <div
              className={[
                "mt-2 text-[10.5px] font-mono rounded px-2 py-1 ring-1",
                lastAction.startsWith("Error")
                  ? "text-red-700 bg-red-50 ring-red-200"
                  : "text-indigo-700 bg-indigo-50 ring-indigo-200",
              ].join(" ")}
            >
              {lastAction.startsWith("Error") ? "✕ " : "↺ "}
              {lastAction}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="mt-2 text-[10px] text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded px-2 py-1 leading-[1.4]">
              {warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border-soft pt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2">Selection</div>
          {selectedId ? (
            <>
              <div className="text-[11px] text-ink-secondary mb-2">
                <span className="font-mono">{selectedId}</span>
                {byId.get(selectedId) && <span className="text-ink-muted"> — “{byId.get(selectedId)!.text}”</span>}
              </div>
              <button
                onClick={() => deleteCell(selectedId)}
                className="w-full text-[11px] font-medium bg-red-50 text-red-700 ring-1 ring-red-200 rounded-md py-1.5 hover:bg-red-100"
              >
                Delete cell (⌫)
              </button>
            </>
          ) : (
            <div className="text-[11px] text-ink-muted">Click a cell to select.</div>
          )}
        </div>

        <div className="border-t border-border-soft pt-3 text-[10.5px] text-ink-muted leading-[1.5]">
          <div className="font-mono uppercase tracking-[0.18em] text-ink-muted mb-2 text-[10px]">Tips</div>
          Drag a cell to move. Drop on another cell to swap. Connectors follow ids, so they stay attached.
        </div>
      </aside>

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div
        className="inline-block bg-canvas rounded-xl ring-1 ring-border-soft"
        style={{ padding: 16 }}
        onPointerDown={onGridBackgroundClick}
      >
        {colLabels.length > 0 && (
          <div className="flex items-end" style={{ gap, marginBottom: Math.round(8 * S) }}>
            {LABEL_W > 0 && <div className="shrink-0" style={{ width: LABEL_W }} />}
            {Array.from({ length: cols }, (_, c) => (
              <div
                key={c}
                className="font-mono uppercase text-ink-muted text-center border-b border-border-medium"
                style={{
                  width: cellW,
                  height: LABEL_H,
                  fontSize: AXIS_TEXT_PX,
                  letterSpacing: "0.16em",
                  paddingBottom: Math.round(4 * S),
                }}
              >
                {colLabels[c] ?? ""}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start" style={{ gap }}>
          {rowLabels.length > 0 && (
            <div className="shrink-0 flex flex-col" style={{ gap, width: LABEL_W }}>
              {Array.from({ length: rows }, (_, r) => (
                <div
                  key={r}
                  className="flex items-center justify-end text-right font-mono uppercase text-ink-muted"
                  style={{
                    height: cellH,
                    fontSize: AXIS_TEXT_PX,
                    letterSpacing: "0.16em",
                    paddingRight: Math.round(8 * S),
                  }}
                >
                  {rowLabels[r] ?? ""}
                </div>
              ))}
            </div>
          )}

          <div
            ref={gridRef}
            className="relative"
            style={{ width: gridW, height: gridH }}
          >
            {/* Empty grid slots (so user can see where cells land) */}
            <div
              className="absolute inset-0 grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, ${cellW}px)`,
                gridTemplateRows: `repeat(${rows}, ${cellH}px)`,
                gap,
              }}
            >
              {Array.from({ length: rows * cols }, (_, idx) => {
                const r = Math.floor(idx / cols);
                const c = idx % cols;
                const isDropTarget = dropTarget && dropTarget.row === r && dropTarget.col === c;
                return (
                  <div
                    key={idx}
                    className={[
                      "rounded-md ring-1 ring-border-soft/40",
                      isDropTarget ? "bg-indigo-50 ring-indigo-300 ring-[1.5px]" : "bg-white/30",
                    ].join(" ")}
                    style={{ borderRadius: Math.round(6 * S) }}
                  />
                );
              })}
            </div>

            {/* Cluster overlay — bounding boxes behind cells. Computed from live
                cell positions so clusters follow cells through drags + agent
                rearrangements. */}
            {clusters.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {clusters.map((cluster) => {
                  const members = cluster.cellIds
                    .map((id) => byId.get(id))
                    .filter((c): c is EditableCell => !!c);
                  if (members.length === 0) return null;
                  const minRow = Math.min(...members.map((c) => c.row));
                  const maxRow = Math.max(...members.map((c) => c.row));
                  const minCol = Math.min(...members.map((c) => c.col));
                  const maxCol = Math.max(...members.map((c) => c.col));
                  const padding = Math.round(10 * S);
                  const left = minCol * (cellW + gap) - padding;
                  const top = minRow * (cellH + gap) - padding;
                  const width =
                    (maxCol - minCol + 1) * cellW + (maxCol - minCol) * gap + padding * 2;
                  const height =
                    (maxRow - minRow + 1) * cellH + (maxRow - minRow) * gap + padding * 2;
                  const tone = clusterToneStyle(cluster.tone);
                  return (
                    <div
                      key={cluster.id}
                      className={`absolute rounded-xl ring-[1.5px] ring-dashed ${tone.bg} ${tone.ring}`}
                      style={{ left, top, width, height, borderRadius: Math.round(12 * S) }}
                    >
                      {cluster.label && (
                        <div
                          className={`absolute font-mono uppercase tracking-[0.14em] rounded-md ring-1 bg-white px-1.5 py-0.5 ${tone.labelRing} ${tone.labelText}`}
                          style={{
                            top: -Math.round(11 * S),
                            left: Math.round(10 * S),
                            fontSize: Math.max(9, 9.5 * S),
                          }}
                        >
                          {cluster.label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cells (absolute-positioned so they can drag) */}
            {cells.map((cell) => {
              const isDragging = drag?.id === cell.id;
              const isSelected = selectedId === cell.id;
              const baseLeft = cell.col * (cellW + gap);
              const baseTop = cell.row * (cellH + gap);
              const left = isDragging ? drag!.cursorX - drag!.grabOffsetX : baseLeft;
              const top = isDragging ? drag!.cursorY - drag!.grabOffsetY : baseTop;
              return (
                <div
                  key={cell.id}
                  onPointerDown={(e) => onCellPointerDown(e, cell)}
                  onClick={(e) => onCellClick(e, cell)}
                  className={[
                    "absolute rounded-md ring-1 flex items-center overflow-hidden bg-white cursor-grab active:cursor-grabbing transition-shadow",
                    isSelected
                      ? "ring-indigo-500 ring-[1.5px] shadow-md"
                      : "ring-border-medium",
                    isDragging ? "opacity-90 shadow-xl" : "",
                  ].join(" ")}
                  style={{
                    left,
                    top,
                    width: cellW,
                    height: cellH,
                    padding: `${6 * S}px ${8 * S}px`,
                    borderRadius: Math.round(6 * S),
                    transform: isDragging ? "rotate(-1deg) scale(1.02)" : "none",
                    transition: isDragging ? "none" : "left 120ms ease, top 120ms ease",
                    zIndex: isDragging ? 10 : isSelected ? 5 : 1,
                    touchAction: "none",
                  }}
                >
                  <span
                    className="text-ink-primary line-clamp-4 pointer-events-none"
                    style={{ fontSize: CELL_TEXT_PX, lineHeight: 1.3 }}
                  >
                    {cell.text}
                  </span>
                </div>
              );
            })}

            {/* Edge overlay */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={gridW}
              height={gridH}
              style={{ overflow: "visible" }}
            >
              <defs>
                <marker
                  id={markerId}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth={MARKER_SIZE}
                  markerHeight={MARKER_SIZE}
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--ink-secondary))" />
                </marker>
              </defs>
              {edges.map((e) => {
                const fromCell = byId.get(e.fromId);
                const toCell = byId.get(e.toId);
                if (!fromCell || !toCell) return null;
                // Use LIVE position of the dragged cell so connectors track the cursor.
                const fr = drag?.id === fromCell.id
                  ? livePosition(drag!, fromCell, cellW, cellH, gap)
                  : { row: fromCell.row, col: fromCell.col };
                const tr = drag?.id === toCell.id
                  ? livePosition(drag!, toCell, cellW, cellH, gap)
                  : { row: toCell.row, col: toCell.col };
                const dr = tr.row - fr.row;
                const dc = tr.col - fr.col;
                const sides = pickSides(dr, dc);
                const from = anchor(fr.row, fr.col, sides.from);
                const to = anchor(tr.row, tr.col, sides.to);
                const routing = chooseRouting(e);
                const { d, labelPos } = buildPath(from.x, from.y, to.x, to.y, sides.from, routing);
                const labelW = e.label ? e.label.length * (EDGE_LABEL_PX * 0.6) + 10 * S : 0;
                const labelH = e.label ? EDGE_LABEL_PX + 6 * S : 0;
                return (
                  <g key={e.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke="rgb(var(--ink-secondary))"
                      strokeWidth={STROKE_W}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.65}
                      markerEnd={`url(#${markerId})`}
                    />
                    {e.label && (
                      <>
                        <rect
                          x={labelPos.x - labelW / 2}
                          y={labelPos.y - labelH / 2}
                          width={labelW}
                          height={labelH}
                          rx={3 * S}
                          fill="white"
                          stroke="rgb(var(--ink-secondary))"
                          strokeWidth={0.5 * S}
                          opacity={0.95}
                        />
                        <text
                          x={labelPos.x}
                          y={labelPos.y + EDGE_LABEL_PX * 0.35}
                          textAnchor="middle"
                          fontSize={EDGE_LABEL_PX}
                          fill="rgb(var(--ink-secondary))"
                          style={{ fontFamily: "var(--font-mono, monospace)" }}
                        >
                          {e.label}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// Live "row/col" of a dragged cell based on cursor position — fractional, so
// the connector tracks smoothly instead of snapping during the drag.
function livePosition(
  drag: { cursorX: number; cursorY: number; grabOffsetX: number; grabOffsetY: number },
  cell: EditableCell,
  cellW: number,
  cellH: number,
  gap: number
): { row: number; col: number } {
  const pixelX = drag.cursorX - drag.grabOffsetX;
  const pixelY = drag.cursorY - drag.grabOffsetY;
  const col = pixelX / (cellW + gap);
  const row = pixelY / (cellH + gap);
  return { row, col };
}

// ── Slider control (compact, matches panel typography) ───────────────────────
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <label className="block mt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-ink-secondary">{label}</span>
        <span className="text-[11px] font-mono tabular-nums text-ink-muted">
          {value}
          {unit ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-indigo-600"
      />
    </label>
  );
}

function AgentButton({
  label,
  hint,
  onClick,
  variant = "solid",
  loading = false,
  disabled = false,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  variant?: "solid" | "ghost";
  loading?: boolean;
  disabled?: boolean;
}) {
  const base =
    variant === "solid"
      ? "bg-white hover:bg-indigo-50 ring-border-medium hover:ring-indigo-300 text-ink-primary"
      : "bg-transparent hover:bg-ink-primary/[0.04] ring-border-soft text-ink-secondary";
  const busy =
    loading
      ? "bg-indigo-50 ring-indigo-300 text-indigo-800"
      : disabled
        ? "opacity-40 cursor-not-allowed"
        : "";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-md ring-1 px-2.5 py-1.5 transition-colors ${base} ${busy}`}
    >
      <div className="text-[11px] font-medium flex items-center justify-between gap-2">
        <span>{label}</span>
        {loading && <Spinner />}
      </div>
      {hint && <div className="text-[10px] text-ink-muted mt-0.5 leading-tight">{hint}</div>}
    </button>
  );
}

type PromptFlags = {
  allowNewCells: boolean;
  allowNewEdges: boolean;
  allowClusters: boolean;
  allowLabels: boolean;
};

function PromptPanel({
  value,
  onChange,
  flags,
  onFlagsChange,
  loading,
  disabled,
  onRun,
}: {
  value: string;
  onChange: (v: string) => void;
  flags: PromptFlags;
  onFlagsChange: (f: PromptFlags) => void;
  loading: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  function toggle(k: keyof PromptFlags) {
    onFlagsChange({ ...flags, [k]: !flags[k] });
  }
  const canRun = !disabled && value.trim().length > 0;
  return (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2 flex items-center justify-between">
        <span>Agent prompt</span>
        <span className="text-ink-muted/70 normal-case tracking-normal font-sans">framework-aware</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) {
            e.preventDefault();
            onRun();
          }
        }}
        placeholder={'Ask the agent to do something — e.g. "surface the 3 biggest tensions and mark them", "cluster by buying committee", or "add what a sharper practitioner would notice".'}
        rows={6}
        className="w-full text-[11px] leading-[1.45] text-ink-primary bg-white ring-1 ring-border-medium rounded-md px-2.5 py-2 focus:outline-none focus:ring-indigo-400 focus:ring-[1.5px] placeholder:text-ink-muted resize-none"
        data-eg-interactive
      />
      <div className="mt-2 grid grid-cols-2 gap-1">
        <FlagToggle label="New cells" active={flags.allowNewCells} onClick={() => toggle("allowNewCells")} />
        <FlagToggle label="New edges" active={flags.allowNewEdges} onClick={() => toggle("allowNewEdges")} />
        <FlagToggle label="Clusters" active={flags.allowClusters} onClick={() => toggle("allowClusters")} />
        <FlagToggle label="Labels" active={flags.allowLabels} onClick={() => toggle("allowLabels")} />
      </div>
      <button
        onClick={onRun}
        disabled={!canRun}
        className={[
          "w-full mt-2 rounded-md py-1.5 text-[11px] font-medium transition-colors flex items-center justify-center gap-2",
          canRun
            ? "bg-indigo-600 text-white hover:bg-indigo-700"
            : "bg-indigo-600/40 text-white cursor-not-allowed",
        ].join(" ")}
      >
        {loading ? <Spinner /> : null}
        {loading ? "Running…" : "Run prompt"}
        {!loading && (
          <span className="opacity-60 font-mono text-[9.5px] tracking-wider">⌘↵</span>
        )}
      </button>
    </>
  );
}

function FlagToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "text-[10.5px] rounded ring-1 py-1 transition-colors",
        active
          ? "bg-indigo-50 text-indigo-800 ring-indigo-300"
          : "bg-white text-ink-muted ring-border-soft hover:ring-border-medium",
      ].join(" ")}
    >
      {active ? "● " : "○ "}
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24">
      <circle
        cx="12" cy="12" r="10"
        fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      />
    </svg>
  );
}

function clusterToneStyle(tone: ClusterTone | undefined) {
  switch (tone) {
    case "warn":
      return { bg: "bg-amber-50/50",   ring: "ring-amber-300/70",   labelRing: "ring-amber-300",   labelText: "text-amber-800" };
    case "success":
      return { bg: "bg-emerald-50/50", ring: "ring-emerald-300/70", labelRing: "ring-emerald-300", labelText: "text-emerald-800" };
    case "info":
      return { bg: "bg-sky-50/50",     ring: "ring-sky-300/70",     labelRing: "ring-sky-300",     labelText: "text-sky-800" };
    case "accent":
      return { bg: "bg-indigo-50/50",  ring: "ring-indigo-300/70",  labelRing: "ring-indigo-300",  labelText: "text-indigo-800" };
    default:
      return { bg: "bg-slate-50/40",   ring: "ring-slate-300/70",   labelRing: "ring-slate-300",   labelText: "text-slate-700" };
  }
}

