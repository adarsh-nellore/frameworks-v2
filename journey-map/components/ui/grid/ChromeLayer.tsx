"use client";

import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

// ──────────────────────────────────────────────────────────────────────────────
// ChromeLayer — decorative SVG banner rendered BEHIND the column headers of a
// kanban/grid layout. Signals the framework's identity (Double Diamond, Venn,
// Kano curve, Funnel, Concentric rings) without interfering with the tabular
// card organization underneath.
//
// The chrome is geometry-aware: given the column count + widths + gutter, it
// draws SVG that aligns with the columns. Chrome has no interactive behavior
// beyond rendering — selecting, editing, and moving still happen on the
// columns and cards below.
//
// Chrome kind + optional params live on config.chrome; the agent can rewrite
// these via setMapMeta (stored in map.meta.chromeKind / chromeLeftLabel /
// chromeRightLabel / chromeCircles) when the user asks "change the chrome".
// ──────────────────────────────────────────────────────────────────────────────

const CHROME_H = 220;

type Props = {
  config: FrameworkConfig;
  /** Dynamic chrome overrides read from map.meta (lets the agent rewrite chrome
   *  without forcing a new framework config). */
  metaOverrides?: {
    chromeKind?: string;
    chromeLeftLabel?: string;
    chromeRightLabel?: string;
    chromeCircles?: string;
  };
  /** Total width of the column row in pixels (cols * colWidth + gutters). */
  totalWidth: number;
  /** Number of columns laid out below the chrome. */
  colCount: number;
};

export function ChromeLayer({ config, metaOverrides, totalWidth, colCount }: Props) {
  const chrome = resolveChrome(config, metaOverrides);
  if (!chrome) return null;

  return (
    <div
      className="relative w-full pointer-events-none"
      style={{ width: totalWidth, height: CHROME_H }}
      aria-hidden
    >
      <svg
        className="absolute inset-0"
        width={totalWidth}
        height={CHROME_H}
        viewBox={`0 0 ${totalWidth} ${CHROME_H}`}
        preserveAspectRatio="none"
      >
        {renderChrome(chrome, totalWidth, CHROME_H, colCount)}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution: config.chrome is the default, map.meta.* overrides are applied
// on top. This lets the agent rewrite chrome via setMapMeta without needing
// to mutate the immutable config.
// ─────────────────────────────────────────────────────────────────────────────

type ResolvedChrome = NonNullable<FrameworkConfig["chrome"]>;

function resolveChrome(
  config: FrameworkConfig,
  meta?: Props["metaOverrides"]
): ResolvedChrome | null {
  const overrideKind = meta?.chromeKind;
  if (overrideKind === "none") return null;
  const base = config.chrome;
  const kind = (overrideKind as ResolvedChrome["kind"]) || base?.kind;
  if (!kind) return null;

  if (kind === "double-diamond") {
    const defaultLabels =
      base?.kind === "double-diamond"
        ? { left: base.leftLabel, right: base.rightLabel }
        : { left: undefined, right: undefined };
    return {
      kind: "double-diamond",
      leftLabel: meta?.chromeLeftLabel ?? defaultLabels.left,
      rightLabel: meta?.chromeRightLabel ?? defaultLabels.right,
    };
  }
  if (kind === "venn") {
    const circles = meta?.chromeCircles
      ? meta.chromeCircles.split("|").map((s) => s.trim()).filter(Boolean)
      : base?.kind === "venn"
        ? base.circles
        : undefined;
    return { kind: "venn", circles };
  }
  if (kind === "kano-curve" || kind === "funnel" || kind === "concentric") {
    return { kind };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG renderers
// ─────────────────────────────────────────────────────────────────────────────

const STROKE = "rgb(var(--accent) / 0.5)";
const FILL = "rgb(var(--accent) / 0.05)";
const FILL_STRONG = "rgb(var(--accent) / 0.08)";
const LABEL_FILL = "rgb(var(--accent))";

function renderChrome(
  chrome: ResolvedChrome,
  w: number,
  h: number,
  colCount: number
): React.ReactNode {
  switch (chrome.kind) {
    case "double-diamond":
      return <DoubleDiamondChrome w={w} h={h} left={chrome.leftLabel} right={chrome.rightLabel} />;
    case "venn":
      return <VennChrome w={w} h={h} labels={chrome.circles ?? []} colCount={colCount} />;
    case "kano-curve":
      return <KanoCurveChrome w={w} h={h} />;
    case "funnel":
      return <FunnelChrome w={w} h={h} />;
    case "concentric":
      return <ConcentricChrome w={w} h={h} />;
  }
}

function DoubleDiamondChrome({
  w,
  h,
  left,
  right,
}: {
  w: number;
  h: number;
  left?: string;
  right?: string;
}) {
  const gap = 20;
  const half = (w - gap) / 2;
  const cy = h / 2;
  const leftRhombus = diamondPoints(0, 0, half, h);
  const rightRhombus = diamondPoints(half + gap, 0, half, h);
  return (
    <g>
      <polygon points={leftRhombus} fill={FILL} stroke={STROKE} strokeWidth="1.5" />
      <polygon points={rightRhombus} fill={FILL} stroke={STROKE} strokeWidth="1.5" />
      {/* Dashed flow line between the two rhombi */}
      <line
        x1={half}
        y1={cy}
        x2={half + gap}
        y2={cy}
        stroke={STROKE}
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <ChromeLabel text={left ?? "Problem Space"} cx={half / 2} cy={16} />
      <ChromeLabel text={right ?? "Solution Space"} cx={half + gap + half / 2} cy={16} />
    </g>
  );
}

function VennChrome({
  w,
  h,
  labels,
  colCount,
}: {
  w: number;
  h: number;
  labels: string[];
  colCount: number;
}) {
  // One circle per column, each centered over its column's midpoint. Circles
  // are sized to overlap modestly so the Venn metaphor reads. With 3 cols the
  // classic trefoil emerges naturally.
  const count = Math.max(2, Math.min(colCount || 3, 5));
  const spacing = w / count;
  const radius = Math.min(spacing * 0.7, h * 0.45);
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => {
        const cx = spacing * (i + 0.5);
        const cy = h / 2;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill={FILL}
            stroke={STROKE}
            strokeWidth="1.5"
          />
        );
      })}
      {labels.slice(0, count).map((label, i) => {
        const cx = spacing * (i + 0.5);
        return <ChromeLabel key={i} text={label} cx={cx} cy={16} />;
      })}
    </g>
  );
}

function KanoCurveChrome({ w, h }: { w: number; h: number }) {
  // Rising sigmoid: satisfaction grows slowly for Basics, linearly for
  // Performance, shoots up for Delighters. Drawn as a smooth SVG path across
  // the full width.
  const p = (x: number, y: number) => `${x},${y}`;
  const baseline = h * 0.85;
  const path =
    `M ${p(10, baseline - 10)} ` +
    `C ${p(w * 0.25, baseline - 15)} ${p(w * 0.45, h * 0.55)} ${p(w * 0.55, h * 0.45)} ` +
    `C ${p(w * 0.7, h * 0.3)} ${p(w * 0.85, h * 0.12)} ${p(w - 10, h * 0.15)}`;
  return (
    <g>
      {/* Shaded area under the curve */}
      <path
        d={path + ` L ${w - 10},${baseline} L 10,${baseline} Z`}
        fill={FILL}
        stroke="none"
      />
      <path d={path} fill="none" stroke={STROKE} strokeWidth="1.8" />
      {/* Zone labels */}
      <ChromeLabel text="Basics" cx={w * 0.16} cy={16} />
      <ChromeLabel text="Performance" cx={w * 0.5} cy={16} />
      <ChromeLabel text="Delighters" cx={w * 0.84} cy={16} />
    </g>
  );
}

function FunnelChrome({ w, h }: { w: number; h: number }) {
  // Trapezoid wide-left, narrow-right. Suggests conversion / filtering.
  const topLeft = `10,${h * 0.2}`;
  const topRight = `${w - 10},${h * 0.35}`;
  const botRight = `${w - 10},${h * 0.65}`;
  const botLeft = `10,${h * 0.8}`;
  return (
    <g>
      <polygon
        points={`${topLeft} ${topRight} ${botRight} ${botLeft}`}
        fill={FILL_STRONG}
        stroke={STROKE}
        strokeWidth="1.5"
      />
    </g>
  );
}

function ConcentricChrome({ w, h }: { w: number; h: number }) {
  // Three nested circles centered on the canvas.
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w / 2 - 10, h / 2 - 10);
  return (
    <g>
      <circle cx={cx} cy={cy} r={base} fill={FILL} stroke={STROKE} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={base * 0.7} fill="none" stroke={STROKE} strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r={base * 0.4} fill="none" stroke={STROKE} strokeWidth="1" />
    </g>
  );
}

function ChromeLabel({ text, cx, cy }: { text: string; cx: number; cy: number }) {
  if (!text) return null;
  // Estimate a label box width/height for the rect backing the text.
  const approxW = Math.max(90, Math.min(260, text.length * 7 + 20));
  const x = cx - approxW / 2;
  const y = cy - 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={approxW}
        height={20}
        rx={10}
        fill="white"
        stroke={STROKE}
        strokeWidth="1"
        opacity={0.95}
      />
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fill={LABEL_FILL}
        fontSize="11"
        fontWeight="500"
        style={{ fontFamily: "var(--font-sans, sans-serif)" }}
      >
        {text}
      </text>
    </g>
  );
}

function diamondPoints(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `${x},${cy} ${cx},${y} ${x + w},${cy} ${cx},${y + h}`;
}
