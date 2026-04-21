"use client";

import { useMemo } from "react";
import type {
  EdgeKind,
  ProcessEdge,
  ProcessMapDoc,
  ProcessMapSelection,
  ProcessNode,
} from "../schema";

type Props = {
  doc: ProcessMapDoc;
  onChange: (next: ProcessMapDoc) => void;
  busy?: boolean;
  selection: ProcessMapSelection;
  onSelectionChange: (next: ProcessMapSelection) => void;
};

type LaidOutNode = ProcessNode & {
  x: number;
  y: number;
  w: number;
  h: number;
};

const LANE_H = 140;
const PHASE_W = 220;
const LANE_LABEL_W = 160;
const PHASE_LABEL_H = 40;
const NODE_W_TASK = 150;
const NODE_H_TASK = 48;
const NODE_W_DECISION = 130;
const NODE_H_DECISION = 80;
const NODE_W_TERMINAL = 120;
const NODE_H_TERMINAL = 42;

export function ProcessMapView({
  doc,
  busy: _busy,
  selection,
  onSelectionChange,
}: Props) {
  const laidOut = useMemo(() => layoutNodes(doc), [doc]);
  const nodeById = useMemo(() => {
    const m = new Map<string, LaidOutNode>();
    for (const n of laidOut) m.set(n.id, n);
    return m;
  }, [laidOut]);

  const canvasW = Math.max(
    LANE_LABEL_W + Math.max(1, doc.phases.length) * PHASE_W,
    laidOut.length ? Math.max(...laidOut.map((n) => n.x + n.w)) + 40 : 400
  );
  const canvasH =
    PHASE_LABEL_H +
    Math.max(1, doc.lanes.length || 1) * LANE_H +
    40;

  const isNodeSelected = (id: string) =>
    selection?.type === "node" && selection.id === id;
  const isEdgeSelected = (id: string) =>
    selection?.type === "edge" && selection.id === id;
  const isLaneSelected = (id: string) =>
    selection?.type === "lane" && selection.id === id;
  const isPhaseSelected = (id: string) =>
    selection?.type === "phase" && selection.id === id;

  return (
    <div className="p-6 overflow-auto">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">{doc.title}</h2>
        {doc.subject && (
          <p className="text-sm text-neutral-500">{doc.subject}</p>
        )}
        <p className="text-xs text-neutral-400 mt-1">
          {doc.lanes.length} lane{doc.lanes.length === 1 ? "" : "s"} ·{" "}
          {doc.phases.length} phase{doc.phases.length === 1 ? "" : "s"} ·{" "}
          {doc.nodes.length} node{doc.nodes.length === 1 ? "" : "s"} ·{" "}
          {doc.edges.length} edge{doc.edges.length === 1 ? "" : "s"}
        </p>
      </header>

      <svg
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        className="w-full max-w-[1200px] h-auto border border-neutral-200 rounded-lg bg-white"
        role="img"
        aria-label={`Process map: ${doc.title}`}
      >
        <defs>
          {edgeArrowDefs()}
        </defs>

        {/* Lane bands */}
        {doc.lanes.map((lane, i) => {
          const y = PHASE_LABEL_H + i * LANE_H;
          const fill = i % 2 === 0 ? "#fafafa" : "#ffffff";
          return (
            <g key={lane.id}>
              <rect
                x={0}
                y={y}
                width={canvasW}
                height={LANE_H}
                fill={isLaneSelected(lane.id) ? "#fef3c7" : fill}
                onClick={() =>
                  onSelectionChange(
                    isLaneSelected(lane.id)
                      ? null
                      : { type: "lane", id: lane.id }
                  )
                }
                className="cursor-pointer"
              />
              <text
                x={12}
                y={y + LANE_H / 2}
                dominantBaseline="middle"
                className="fill-neutral-700 text-xs font-medium uppercase tracking-wide"
              >
                {lane.label}
              </text>
            </g>
          );
        })}

        {/* Phase columns */}
        {doc.phases.map((phase, i) => {
          const x = LANE_LABEL_W + i * PHASE_W;
          return (
            <g key={phase.id}>
              <line
                x1={x}
                y1={0}
                x2={x}
                y2={canvasH}
                stroke="#e5e7eb"
              />
              <rect
                x={x}
                y={0}
                width={PHASE_W}
                height={PHASE_LABEL_H}
                fill={isPhaseSelected(phase.id) ? "#fef3c7" : "#f9fafb"}
                onClick={() =>
                  onSelectionChange(
                    isPhaseSelected(phase.id)
                      ? null
                      : { type: "phase", id: phase.id }
                  )
                }
                className="cursor-pointer"
              />
              <text
                x={x + PHASE_W / 2}
                y={PHASE_LABEL_H / 2}
                dominantBaseline="middle"
                textAnchor="middle"
                className="fill-neutral-700 text-xs font-medium uppercase tracking-wide"
              >
                {phase.label}
              </text>
            </g>
          );
        })}

        {/* Edges */}
        {doc.edges.map((e) => {
          const from = nodeById.get(e.fromId);
          const to = nodeById.get(e.toId);
          if (!from || !to) return null;
          const selected = isEdgeSelected(e.id);
          return (
            <EdgeRender
              key={e.id}
              edge={e}
              from={from}
              to={to}
              selected={selected}
              onClick={() =>
                onSelectionChange(
                  selected ? null : { type: "edge", id: e.id }
                )
              }
            />
          );
        })}

        {/* Nodes */}
        {laidOut.map((n) => {
          const selected = isNodeSelected(n.id);
          return (
            <g
              key={n.id}
              onClick={() =>
                onSelectionChange(
                  selected ? null : { type: "node", id: n.id }
                )
              }
              className="cursor-pointer"
            >
              <NodeShape node={n} selected={selected} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function layoutNodes(doc: ProcessMapDoc): LaidOutNode[] {
  const laneIndex = new Map<string, number>();
  doc.lanes.forEach((l, i) => laneIndex.set(l.id, i));
  const phaseIndex = new Map<string, number>();
  doc.phases.forEach((p, i) => phaseIndex.set(p.id, i));

  // Group nodes by (laneIdx, phaseIdx) for stacking offsets
  const groups = new Map<string, ProcessNode[]>();
  for (const n of doc.nodes) {
    const li = n.laneId !== undefined ? (laneIndex.get(n.laneId) ?? 0) : 0;
    const pi = n.phaseId !== undefined ? (phaseIndex.get(n.phaseId) ?? 0) : 0;
    const key = `${li}:${pi}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  const laid: LaidOutNode[] = [];
  for (const [key, list] of groups) {
    const [liStr, piStr] = key.split(":");
    const li = Number(liStr);
    const pi = Number(piStr);
    list.forEach((n, idx) => {
      const dim = nodeDimensions(n.kind);
      const cellX = LANE_LABEL_W + pi * PHASE_W;
      const cellY = PHASE_LABEL_H + li * LANE_H;
      const perRow = Math.max(1, Math.floor((PHASE_W - 20) / (dim.w + 20)));
      const col = idx % perRow;
      const row = Math.floor(idx / perRow);
      const x = cellX + 10 + col * (dim.w + 20);
      const y =
        cellY +
        (LANE_H - dim.h) / 2 +
        (row - Math.floor(Math.max(0, list.length - 1) / perRow) / 2) *
          (dim.h + 12);
      laid.push({ ...n, x, y, w: dim.w, h: dim.h });
    });
  }
  return laid;
}

function nodeDimensions(kind: ProcessNode["kind"]) {
  if (kind === "decision") return { w: NODE_W_DECISION, h: NODE_H_DECISION };
  if (kind === "start" || kind === "end")
    return { w: NODE_W_TERMINAL, h: NODE_H_TERMINAL };
  return { w: NODE_W_TASK, h: NODE_H_TASK };
}

function NodeShape({
  node,
  selected,
}: {
  node: LaidOutNode;
  selected: boolean;
}) {
  const stroke = selected ? "#111827" : "#d1d5db";
  const strokeWidth = selected ? 2 : 1;
  const fill = NODE_FILL[node.kind];

  if (node.kind === "decision") {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const points = [
      `${cx},${node.y}`,
      `${node.x + node.w},${cy}`,
      `${cx},${node.y + node.h}`,
      `${node.x},${cy}`,
    ].join(" ");
    return (
      <>
        <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <foreignObject
          x={node.x + 8}
          y={node.y + 8}
          width={node.w - 16}
          height={node.h - 16}
        >
          <div className="h-full w-full flex items-center justify-center text-[11px] font-medium text-neutral-800 text-center leading-tight">
            {node.label}
          </div>
        </foreignObject>
      </>
    );
  }

  if (node.kind === "start" || node.kind === "end") {
    const rx = node.h / 2;
    return (
      <>
        <rect
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={rx}
          ry={rx}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <text
          x={node.x + node.w / 2}
          y={node.y + node.h / 2}
          dominantBaseline="middle"
          textAnchor="middle"
          className="fill-neutral-800 text-xs font-medium"
        >
          {node.label}
        </text>
      </>
    );
  }

  // task
  return (
    <>
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={6}
        ry={6}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <foreignObject
        x={node.x + 8}
        y={node.y + 4}
        width={node.w - 16}
        height={node.h - 8}
      >
        <div className="h-full w-full flex items-center text-[11px] font-medium text-neutral-800 leading-tight">
          {node.label}
        </div>
      </foreignObject>
    </>
  );
}

const NODE_FILL: Record<ProcessNode["kind"], string> = {
  start: "#dcfce7",
  end: "#fee2e2",
  decision: "#fef3c7",
  task: "#eff6ff",
};

function EdgeRender({
  edge,
  from,
  to,
  selected,
  onClick,
}: {
  edge: ProcessEdge;
  from: LaidOutNode;
  to: LaidOutNode;
  selected: boolean;
  onClick: () => void;
}) {
  const { startX, startY, endX, endY } = edgeEndpoints(from, to);
  const midX = (startX + endX) / 2;
  // Orthogonal routing: start → midX → midX,endY → endX,endY
  const path = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
  const style = EDGE_STYLE[edge.kind];
  return (
    <g onClick={onClick} className="cursor-pointer">
      <path
        d={path}
        stroke={selected ? "#111827" : style.stroke}
        strokeWidth={selected ? 2 : 1.4}
        fill="none"
        strokeDasharray={style.dash}
        markerEnd={`url(#arrow-${edge.kind})`}
      />
      {edge.label && (
        <text
          x={midX}
          y={startY < endY ? startY - 6 : startY + 12}
          textAnchor="middle"
          className="fill-neutral-600 text-[10px]"
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

function edgeEndpoints(from: LaidOutNode, to: LaidOutNode) {
  const fromRight = from.x + from.w;
  const toLeft = to.x;
  const fromCenterY = from.y + from.h / 2;
  const toCenterY = to.y + to.h / 2;
  if (toLeft >= fromRight) {
    return {
      startX: fromRight,
      startY: fromCenterY,
      endX: toLeft,
      endY: toCenterY,
    };
  }
  // Target is to the left — connect from node left to target right (back-loop)
  return {
    startX: from.x,
    startY: fromCenterY,
    endX: to.x + to.w,
    endY: toCenterY,
  };
}

const EDGE_STYLE: Record<EdgeKind, { stroke: string; dash?: string }> = {
  sequence: { stroke: "#6b7280" },
  handoff: { stroke: "#6366f1" },
  "decision-yes": { stroke: "#10b981" },
  "decision-no": { stroke: "#ef4444" },
  "feedback-loop": { stroke: "#d97706", dash: "4 3" },
};

function edgeArrowDefs() {
  const defs: JSX.Element[] = [];
  for (const [kind, style] of Object.entries(EDGE_STYLE)) {
    defs.push(
      <marker
        key={`arrow-${kind}`}
        id={`arrow-${kind}`}
        viewBox="0 0 10 10"
        refX={9}
        refY={5}
        markerWidth={6}
        markerHeight={6}
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={style.stroke} />
      </marker>
    );
  }
  return defs;
}
