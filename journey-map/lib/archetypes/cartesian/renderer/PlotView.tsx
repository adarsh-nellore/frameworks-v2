"use client";

import { useMemo, useState } from "react";
import type {
  CartesianDoc,
  CartesianSelection,
  Category,
  Point,
  Quadrant,
  QuadrantLocation,
} from "../schema";

type Props = {
  doc: CartesianDoc;
  onChange: (next: CartesianDoc) => void;
  busy?: boolean;
  selection: CartesianSelection;
  onSelectionChange: (next: CartesianSelection) => void;
};

const PLOT_W = 720;
const PLOT_H = 520;
const PADDING_L = 84;
const PADDING_R = 32;
const PADDING_T = 32;
const PADDING_B = 72;

export function PlotView({
  doc,
  busy: _busy,
  selection,
  onSelectionChange,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const mapX = useMemo(() => {
    const { min, max } = doc.xAxis;
    return (v: number) =>
      PADDING_L +
      ((v - min) / (max - min)) * (PLOT_W - PADDING_L - PADDING_R);
  }, [doc.xAxis]);

  const mapY = useMemo(() => {
    const { min, max } = doc.yAxis;
    return (v: number) =>
      PLOT_H -
      PADDING_B -
      ((v - min) / (max - min)) * (PLOT_H - PADDING_T - PADDING_B);
  }, [doc.yAxis]);

  const midX = (doc.xAxis.min + doc.xAxis.max) / 2;
  const midY = (doc.yAxis.min + doc.yAxis.max) / 2;

  const categoryColor = (id: string | undefined): string => {
    if (!id || !doc.categories) return "4b5563"; // neutral-600
    const cat = doc.categories.find((c) => c.id === id);
    return cat?.color ?? "4b5563";
  };

  const selectedPoint =
    selection?.type === "point"
      ? selection.id
      : selection?.type === "points" && selection.ids.length === 1
        ? selection.ids[0]
        : null;

  return (
    <div className="p-6">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">{doc.title}</h2>
        {doc.subject && (
          <p className="text-sm text-neutral-500">{doc.subject}</p>
        )}
      </header>

      <svg
        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
        className="w-full max-w-[860px] h-auto border border-neutral-200 rounded-lg bg-white"
        role="img"
        aria-label={`Cartesian plot: ${doc.title}`}
      >
        {/* Quadrant backgrounds */}
        {doc.quadrants?.map((q) => {
          const [xRange, yRange] = quadrantExtents(q.location, midX, midY, doc);
          const x1 = mapX(xRange[0]);
          const x2 = mapX(xRange[1]);
          const y1 = mapY(yRange[1]);
          const y2 = mapY(yRange[0]);
          const isSelected =
            selection?.type === "quadrant" && selection.id === q.id;
          return (
            <g
              key={q.id}
              onClick={() =>
                onSelectionChange(
                  isSelected ? null : { type: "quadrant", id: q.id }
                )
              }
              className="cursor-pointer"
            >
              <rect
                x={x1}
                y={y1}
                width={x2 - x1}
                height={y2 - y1}
                fill={quadrantFill(q.location)}
                stroke={isSelected ? "#f59e0b" : "none"}
                strokeWidth={isSelected ? 2 : 0}
              />
              <text
                x={quadrantTextX(q.location, x1, x2)}
                y={quadrantTextY(q.location, y1, y2)}
                textAnchor={quadrantTextAnchor(q.location)}
                className="fill-neutral-700 text-[11px] font-medium uppercase tracking-wide"
              >
                {q.label}
              </text>
            </g>
          );
        })}

        {/* Grid lines */}
        <line
          x1={mapX(midX)}
          y1={PADDING_T}
          x2={mapX(midX)}
          y2={PLOT_H - PADDING_B}
          stroke="#e5e7eb"
          strokeDasharray="2 4"
        />
        <line
          x1={PADDING_L}
          y1={mapY(midY)}
          x2={PLOT_W - PADDING_R}
          y2={mapY(midY)}
          stroke="#e5e7eb"
          strokeDasharray="2 4"
        />

        {/* Axes */}
        <line
          x1={PADDING_L}
          y1={PLOT_H - PADDING_B}
          x2={PLOT_W - PADDING_R}
          y2={PLOT_H - PADDING_B}
          stroke="#9ca3af"
        />
        <line
          x1={PADDING_L}
          y1={PADDING_T}
          x2={PADDING_L}
          y2={PLOT_H - PADDING_B}
          stroke="#9ca3af"
        />

        {/* X-axis labels */}
        <text
          x={(PADDING_L + (PLOT_W - PADDING_R)) / 2}
          y={PLOT_H - 20}
          textAnchor="middle"
          className="fill-neutral-700 text-sm font-medium"
        >
          {doc.xAxis.label}
          {doc.xAxis.unit ? ` (${doc.xAxis.unit})` : ""}
        </text>
        {doc.xAxis.lowAnchor && (
          <text
            x={PADDING_L}
            y={PLOT_H - PADDING_B + 18}
            textAnchor="start"
            className="fill-neutral-500 text-[10px] uppercase tracking-wide"
          >
            ← {doc.xAxis.lowAnchor}
          </text>
        )}
        {doc.xAxis.highAnchor && (
          <text
            x={PLOT_W - PADDING_R}
            y={PLOT_H - PADDING_B + 18}
            textAnchor="end"
            className="fill-neutral-500 text-[10px] uppercase tracking-wide"
          >
            {doc.xAxis.highAnchor} →
          </text>
        )}

        {/* Y-axis labels */}
        <text
          x={-((PADDING_T + (PLOT_H - PADDING_B)) / 2)}
          y={22}
          textAnchor="middle"
          transform="rotate(-90)"
          className="fill-neutral-700 text-sm font-medium"
        >
          {doc.yAxis.label}
          {doc.yAxis.unit ? ` (${doc.yAxis.unit})` : ""}
        </text>
        {doc.yAxis.lowAnchor && (
          <text
            x={PADDING_L - 10}
            y={PLOT_H - PADDING_B}
            textAnchor="end"
            className="fill-neutral-500 text-[10px] uppercase tracking-wide"
          >
            {doc.yAxis.lowAnchor}
          </text>
        )}
        {doc.yAxis.highAnchor && (
          <text
            x={PADDING_L - 10}
            y={PADDING_T + 12}
            textAnchor="end"
            className="fill-neutral-500 text-[10px] uppercase tracking-wide"
          >
            {doc.yAxis.highAnchor}
          </text>
        )}

        {/* Tick labels */}
        {doc.xAxis.tickLabels?.map((lbl, i) => {
          const frac =
            doc.xAxis.tickLabels!.length > 1
              ? i / (doc.xAxis.tickLabels!.length - 1)
              : 0.5;
          const x =
            PADDING_L + frac * (PLOT_W - PADDING_L - PADDING_R);
          return (
            <text
              key={`xt-${i}`}
              x={x}
              y={PLOT_H - PADDING_B + 32}
              textAnchor="middle"
              className="fill-neutral-500 text-[10px]"
            >
              {lbl}
            </text>
          );
        })}
        {doc.yAxis.tickLabels?.map((lbl, i) => {
          const frac =
            doc.yAxis.tickLabels!.length > 1
              ? i / (doc.yAxis.tickLabels!.length - 1)
              : 0.5;
          const y =
            PLOT_H - PADDING_B - frac * (PLOT_H - PADDING_T - PADDING_B);
          return (
            <text
              key={`yt-${i}`}
              x={PADDING_L - 10}
              y={y + 3}
              textAnchor="end"
              className="fill-neutral-500 text-[10px]"
            >
              {lbl}
            </text>
          );
        })}

        {/* Points */}
        {doc.points.map((p) => {
          const cx = mapX(p.x);
          const cy = mapY(p.y);
          const r = p.size !== undefined ? 4 + p.size * 0.8 : 6;
          const color = categoryColor(p.categoryId);
          const isSelected = selectedPoint === p.id;
          const isHovered = hover === p.id;
          return (
            <g
              key={p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
              onClick={() =>
                onSelectionChange(
                  isSelected ? null : { type: "point", id: p.id }
                )
              }
              className="cursor-pointer"
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={`#${color}`}
                fillOpacity={isSelected || isHovered ? 1 : 0.75}
                stroke={isSelected ? "#111827" : "#ffffff"}
                strokeWidth={isSelected ? 2 : 1.5}
              />
              <text
                x={cx + r + 4}
                y={cy + 3}
                className={`fill-neutral-800 text-[11px] ${
                  isSelected || isHovered ? "font-semibold" : ""
                }`}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      {doc.categories && doc.categories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-600">
          {doc.categories.map((cat) => (
            <LegendItem key={cat.id} cat={cat} />
          ))}
        </div>
      )}

      {selectedPoint && (
        <SelectedPointPanel
          point={doc.points.find((p) => p.id === selectedPoint)}
        />
      )}
    </div>
  );
}

function quadrantExtents(
  loc: QuadrantLocation,
  midX: number,
  midY: number,
  doc: CartesianDoc
): [[number, number], [number, number]] {
  const xl: [number, number] = [doc.xAxis.min, midX];
  const xh: [number, number] = [midX, doc.xAxis.max];
  const yl: [number, number] = [doc.yAxis.min, midY];
  const yh: [number, number] = [midY, doc.yAxis.max];
  if (loc === "ll") return [xl, yl];
  if (loc === "lh") return [xl, yh];
  if (loc === "hl") return [xh, yl];
  return [xh, yh];
}

function quadrantFill(loc: QuadrantLocation): string {
  return {
    ll: "#f5f3ff",
    lh: "#ecfdf5",
    hl: "#fff7ed",
    hh: "#eff6ff",
  }[loc];
}

function quadrantTextX(loc: QuadrantLocation, x1: number, x2: number): number {
  return loc === "ll" || loc === "lh" ? x1 + 8 : x2 - 8;
}

function quadrantTextY(loc: QuadrantLocation, y1: number, y2: number): number {
  return loc === "hh" || loc === "lh" ? y1 + 16 : y2 - 8;
}

function quadrantTextAnchor(loc: QuadrantLocation): "start" | "end" {
  return loc === "ll" || loc === "lh" ? "start" : "end";
}

function LegendItem({ cat }: { cat: Category }) {
  const color = cat.color ?? "4b5563";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: `#${color}` }}
      />
      <span>{cat.label}</span>
    </span>
  );
}

function SelectedPointPanel({ point }: { point: Point | undefined }) {
  if (!point) return null;
  return (
    <aside className="mt-4 border border-neutral-200 rounded p-3 bg-neutral-50 text-sm max-w-xl">
      <div className="font-medium">{point.label}</div>
      {point.tagline && (
        <div className="text-xs text-neutral-500 mt-0.5">{point.tagline}</div>
      )}
      <div className="text-xs text-neutral-600 mt-1 tabular-nums">
        x = {point.x}, y = {point.y}
        {point.size !== undefined ? ` · size ${point.size}` : ""}
      </div>
      {point.note && (
        <p className="text-xs text-neutral-600 mt-1.5">{point.note}</p>
      )}
    </aside>
  );
}
// Satisfy the narrow type import for Quadrant in the signature (kept for
// clarity). Not directly used but keeps the file's public surface stable.
export type _CartesianRendererExports = Quadrant;
