"use client";

import { useMemo } from "react";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";

// ──────────────────────────────────────────────────────────────────────────────
// FrameworkThumbnail — a tiny, low-fi SVG that shows the *shape* of a
// framework (journey-map grid, 2×2 matrix, kanban columns, etc.) without any
// actual content. Used in the template picker cards so users can recognize a
// framework by its geometry at a glance.
//
// Palette is deliberately muted: all frameworks look coherent next to each
// other — the picker reads like a sheet of blueprints, not a crayon box.
// ──────────────────────────────────────────────────────────────────────────────

const VB_W = 120;
const VB_H = 80;
const PAD = 6;

// Hashes a string to a deterministic integer — used as a per-framework seed
// so the "random" scatter in freeform layouts is stable across renders and
// session reloads. Tiny FNV-1a; no deps, good enough distribution for this.
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type FrameworkThumbnailProps = {
  id: string;
  config: FrameworkConfig;
  seed: UniversalMap;
  className?: string;
};

export function FrameworkThumbnail({
  id,
  config,
  seed,
  className,
}: FrameworkThumbnailProps) {
  const shape = useMemo(() => {
    const rng = mulberry32(hashSeed(id));
    switch (config.layout) {
      case "matrix":
        return renderMatrix(seed);
      case "kanban":
        return renderKanban(seed);
      case "freeform":
        return renderFreeform(seed, rng);
      case "grid":
      default:
        return renderGrid(seed);
    }
  }, [id, config.layout, seed]);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${config.label} preview`}
      className={className}
    >
      {/* Background frame — soft cream tint matching the glass surface */}
      <rect
        x={0.5}
        y={0.5}
        width={VB_W - 1}
        height={VB_H - 1}
        rx={4}
        ry={4}
        fill="rgba(255,255,255,0.6)"
        stroke="var(--border-soft, rgba(12,10,8,0.12))"
      />
      {shape}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout renderers
// ─────────────────────────────────────────────────────────────────────────────

/** Cap counts so "big" seeds (6×6 journey maps) stay legible at 120×80. */
const MAX_COLS = 8;
const MAX_ROWS = 6;

function renderGrid(seed: UniversalMap) {
  const cols = Math.min(Math.max(seed.cols.length, 2), MAX_COLS);
  const rows = Math.min(Math.max(seed.rows.length, 2), MAX_ROWS);
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - 2 * PAD;
  const cellW = innerW / cols;
  const cellH = innerH / rows;

  // Card density per (col, row) — count from the seed, capped at 1 so the
  // preview renders at most one mini-card per cell.
  const occupied = new Set<string>();
  for (const c of seed.cards) {
    const ci = seed.cols.findIndex((x) => x.id === c.colId);
    const ri = seed.rows.findIndex((x) => x.id === c.rowId);
    if (ci < 0 || ri < 0) continue;
    if (ci >= cols || ri >= rows) continue;
    occupied.add(`${ci}:${ri}`);
  }

  const lines: React.ReactNode[] = [];
  // Vertical grid lines
  for (let i = 1; i < cols; i++) {
    const x = PAD + i * cellW;
    lines.push(
      <line
        key={`v${i}`}
        x1={x}
        y1={PAD}
        x2={x}
        y2={VB_H - PAD}
        stroke="var(--border-soft, rgba(12,10,8,0.10))"
        strokeWidth={0.6}
      />
    );
  }
  // Horizontal grid lines
  for (let j = 1; j < rows; j++) {
    const y = PAD + j * cellH;
    lines.push(
      <line
        key={`h${j}`}
        x1={PAD}
        y1={y}
        x2={VB_W - PAD}
        y2={y}
        stroke="var(--border-soft, rgba(12,10,8,0.10))"
        strokeWidth={0.6}
      />
    );
  }

  const cards: React.ReactNode[] = [];
  for (let ci = 0; ci < cols; ci++) {
    for (let ri = 0; ri < rows; ri++) {
      if (!occupied.has(`${ci}:${ri}`)) continue;
      const cx = PAD + ci * cellW + cellW * 0.18;
      const cy = PAD + ri * cellH + cellH * 0.3;
      const cw = cellW * 0.64;
      const ch = cellH * 0.4;
      cards.push(
        <rect
          key={`c${ci}-${ri}`}
          x={cx}
          y={cy}
          width={cw}
          height={ch}
          rx={1.2}
          ry={1.2}
          fill="rgba(12,10,8,0.18)"
        />
      );
    }
  }

  return (
    <>
      {/* Column header strip — a slim bar along the top row so the eye reads
          this as a journey-map/table structure. */}
      <rect
        x={PAD}
        y={PAD}
        width={VB_W - 2 * PAD}
        height={Math.min(cellH * 0.55, 8)}
        fill="rgba(12,10,8,0.05)"
      />
      {lines}
      {cards}
    </>
  );
}

function renderKanban(seed: UniversalMap) {
  const cols = Math.min(Math.max(seed.cols.length, 2), MAX_COLS);
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - 2 * PAD;
  const gap = 2;
  const colW = (innerW - gap * (cols - 1)) / cols;
  // Cards per column (capped).
  const countsPerCol = seed.cols.slice(0, cols).map((col) => {
    const n = seed.cards.filter((c) => c.colId === col.id && !c.parentCardId).length;
    return Math.min(Math.max(n, 1), 4);
  });

  const elements: React.ReactNode[] = [];
  for (let i = 0; i < cols; i++) {
    const x = PAD + i * (colW + gap);
    const y = PAD;
    // Column background strip
    elements.push(
      <rect
        key={`col${i}`}
        x={x}
        y={y}
        width={colW}
        height={innerH}
        rx={2}
        ry={2}
        fill="rgba(12,10,8,0.04)"
      />
    );
    // Column header bar
    elements.push(
      <rect
        key={`ch${i}`}
        x={x + 2}
        y={y + 2}
        width={colW - 4}
        height={3}
        rx={0.8}
        ry={0.8}
        fill="rgba(12,10,8,0.18)"
      />
    );
    // Stacked cards
    const n = countsPerCol[i];
    const cardH = 6;
    const cardGap = 2;
    const start = y + 9;
    for (let k = 0; k < n; k++) {
      const cy = start + k * (cardH + cardGap);
      if (cy + cardH > y + innerH - 2) break;
      elements.push(
        <rect
          key={`c${i}-${k}`}
          x={x + 3}
          y={cy}
          width={colW - 6}
          height={cardH}
          rx={1}
          ry={1}
          fill="rgba(255,255,255,0.9)"
          stroke="rgba(12,10,8,0.12)"
          strokeWidth={0.5}
        />
      );
    }
  }
  return <>{elements}</>;
}

function renderMatrix(seed: UniversalMap) {
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - 2 * PAD;
  const cx = PAD + innerW / 2;
  const cy = PAD + innerH / 2;

  // Count cards per quadrant (col index 0/1 × row index 0/1) — used for dot
  // density so the reader can tell a populated 2×2 from an empty one.
  const quadCounts: Record<string, number> = {};
  for (const c of seed.cards) {
    const ci = seed.cols.findIndex((x) => x.id === c.colId);
    const ri = seed.rows.findIndex((x) => x.id === c.rowId);
    if (ci < 0 || ri < 0) continue;
    const key = `${ci < 1 ? 0 : 1}:${ri < 1 ? 0 : 1}`;
    quadCounts[key] = (quadCounts[key] ?? 0) + 1;
  }

  const dots: React.ReactNode[] = [];
  for (const key of ["0:0", "1:0", "0:1", "1:1"]) {
    const [cQ, rQ] = key.split(":").map(Number);
    const n = Math.min(quadCounts[key] ?? 1, 3);
    const qx0 = PAD + cQ * (innerW / 2);
    const qy0 = PAD + rQ * (innerH / 2);
    for (let i = 0; i < n; i++) {
      const dx = qx0 + innerW / 4 + (i - (n - 1) / 2) * 6;
      const dy = qy0 + innerH / 4;
      dots.push(
        <circle
          key={`${key}-${i}`}
          cx={dx}
          cy={dy}
          r={2}
          fill="rgba(12,10,8,0.35)"
        />
      );
    }
  }

  return (
    <>
      {/* Axis cross */}
      <line
        x1={cx}
        y1={PAD}
        x2={cx}
        y2={VB_H - PAD}
        stroke="rgba(12,10,8,0.18)"
        strokeWidth={0.8}
      />
      <line
        x1={PAD}
        y1={cy}
        x2={VB_W - PAD}
        y2={cy}
        stroke="rgba(12,10,8,0.18)"
        strokeWidth={0.8}
      />
      {/* Axis ticks at the ends to suggest arrows */}
      <line
        x1={PAD}
        y1={cy}
        x2={PAD + 3}
        y2={cy - 3}
        stroke="rgba(12,10,8,0.18)"
        strokeWidth={0.8}
      />
      <line
        x1={PAD}
        y1={cy}
        x2={PAD + 3}
        y2={cy + 3}
        stroke="rgba(12,10,8,0.18)"
        strokeWidth={0.8}
      />
      <line
        x1={cx}
        y1={VB_H - PAD}
        x2={cx - 3}
        y2={VB_H - PAD - 3}
        stroke="rgba(12,10,8,0.18)"
        strokeWidth={0.8}
      />
      <line
        x1={cx}
        y1={VB_H - PAD}
        x2={cx + 3}
        y2={VB_H - PAD - 3}
        stroke="rgba(12,10,8,0.18)"
        strokeWidth={0.8}
      />
      {dots}
    </>
  );
}

function renderFreeform(seed: UniversalMap, rng: () => number) {
  // Scatter N rounded rectangles across the panel — N derived from the seed's
  // card count but clamped so sparse frameworks still look alive and dense
  // ones don't overflow.
  const N = Math.min(Math.max(seed.cards.length, 4), 10);
  const notes: React.ReactNode[] = [];
  const w = 18;
  const h = 12;
  for (let i = 0; i < N; i++) {
    const x = PAD + rng() * (VB_W - 2 * PAD - w);
    const y = PAD + rng() * (VB_H - 2 * PAD - h);
    const rot = (rng() - 0.5) * 10;
    notes.push(
      <g
        key={`n${i}`}
        transform={`rotate(${rot.toFixed(2)} ${(x + w / 2).toFixed(2)} ${(y + h / 2).toFixed(2)})`}
      >
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={1.5}
          ry={1.5}
          fill="rgba(255,255,255,0.95)"
          stroke="rgba(12,10,8,0.18)"
          strokeWidth={0.6}
        />
        <line
          x1={x + 2.5}
          y1={y + 4}
          x2={x + w - 2.5}
          y2={y + 4}
          stroke="rgba(12,10,8,0.18)"
          strokeWidth={0.6}
        />
        <line
          x1={x + 2.5}
          y1={y + 7}
          x2={x + w - 5}
          y2={y + 7}
          stroke="rgba(12,10,8,0.12)"
          strokeWidth={0.6}
        />
      </g>
    );
  }
  return <>{notes}</>;
}
