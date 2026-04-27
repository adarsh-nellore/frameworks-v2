// ──────────────────────────────────────────────────────────────────────────────
// chromes.tsx — pure SVG chrome primitives. Each function takes a width +
// height (the cell-grid extent it should overlay) and returns an SVG <g> sized
// to that extent. Callers wrap them in a single absolute-positioned <svg>
// behind the cells they decorate. No CHROME_H, no marginLeft, no banner
// containers — the cell substrate owns geometry.
//
// Shared between:
//   - components/ui/grid/EditableGrid.tsx (the universal cell-substrate path
//     used by /preview/prompt-lab, /preview/strategy-board, etc.)
//   - components/ui/grid/ChromeLayer.tsx (the legacy /canvas + FrameworkGrid
//     path; remains in place until /canvas is also migrated).
//
// All renderers take {w, h} only. Labels, circle counts, and side captions
// flow as additional props per shape.
// ──────────────────────────────────────────────────────────────────────────────

const STROKE = "rgb(var(--accent) / 0.5)";
const FILL = "rgb(var(--accent) / 0.05)";
const FILL_STRONG = "rgb(var(--accent) / 0.08)";
const LABEL_FILL = "rgb(var(--accent))";

export type ChromeKind =
  | "double-diamond"
  | "venn"
  | "kano-curve"
  | "funnel"
  | "concentric"
  | "concentric-rings"
  | "coordinate-cross";

export type ChromeSpec =
  | { kind: "double-diamond"; leftLabel?: string; rightLabel?: string }
  | { kind: "venn"; circles?: string[]; colCount?: number }
  | { kind: "kano-curve" }
  | { kind: "funnel" }
  | { kind: "concentric" | "concentric-rings" }
  | { kind: "coordinate-cross"; xLabel?: string; yLabel?: string };

export function renderChromeShape(
  spec: ChromeSpec,
  w: number,
  h: number
): React.ReactNode {
  switch (spec.kind) {
    case "double-diamond":
      return (
        <DoubleDiamondChrome
          w={w}
          h={h}
          left={spec.leftLabel}
          right={spec.rightLabel}
        />
      );
    case "venn":
      return (
        <VennChrome
          w={w}
          h={h}
          labels={spec.circles ?? []}
          colCount={spec.colCount ?? 3}
        />
      );
    case "kano-curve":
      return <KanoCurveChrome w={w} h={h} />;
    case "funnel":
      return <FunnelChrome w={w} h={h} />;
    case "concentric":
    case "concentric-rings":
      return <ConcentricChrome w={w} h={h} />;
    case "coordinate-cross":
      return <CoordinateCrossChrome w={w} h={h} xLabel={spec.xLabel} yLabel={spec.yLabel} />;
  }
}

export function CoordinateCrossChrome({
  w,
  h,
  xLabel,
  yLabel,
}: {
  w: number;
  h: number;
  xLabel?: string;
  yLabel?: string;
}) {
  // Centered double-headed coordinate cross sized to the cell substrate.
  // Caller sizes the SVG to the actual gridW × gridH so the cross's center
  // sits at the geometric middle of the cell area.
  const cx = w / 2;
  const cy = h / 2;
  const inset = 16;
  return (
    <g>
      <defs>
        <marker
          id="cc-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={STROKE} />
        </marker>
      </defs>
      <line
        x1={inset}
        y1={cy}
        x2={w - inset}
        y2={cy}
        stroke={STROKE}
        strokeWidth="1.5"
        markerStart="url(#cc-arrow)"
        markerEnd="url(#cc-arrow)"
      />
      <line
        x1={cx}
        y1={inset}
        x2={cx}
        y2={h - inset}
        stroke={STROKE}
        strokeWidth="1.5"
        markerStart="url(#cc-arrow)"
        markerEnd="url(#cc-arrow)"
      />
      <circle cx={cx} cy={cy} r={2.5} fill={STROKE} />
      {xLabel && (
        <text
          x={w - inset - 4}
          y={cy - 6}
          textAnchor="end"
          fill={LABEL_FILL}
          fontSize="11"
          fontWeight="500"
          style={{ fontFamily: "var(--font-sans, sans-serif)" }}
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={cx + 6}
          y={inset + 12}
          textAnchor="start"
          fill={LABEL_FILL}
          fontSize="11"
          fontWeight="500"
          style={{ fontFamily: "var(--font-sans, sans-serif)" }}
        >
          {yLabel}
        </text>
      )}
    </g>
  );
}

export function DoubleDiamondChrome({
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

export function VennChrome({
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

export function KanoCurveChrome({ w, h }: { w: number; h: number }) {
  const p = (x: number, y: number) => `${x},${y}`;
  const baseline = h * 0.85;
  const path =
    `M ${p(10, baseline - 10)} ` +
    `C ${p(w * 0.25, baseline - 15)} ${p(w * 0.45, h * 0.55)} ${p(w * 0.55, h * 0.45)} ` +
    `C ${p(w * 0.7, h * 0.3)} ${p(w * 0.85, h * 0.12)} ${p(w - 10, h * 0.15)}`;
  return (
    <g>
      <path
        d={path + ` L ${w - 10},${baseline} L 10,${baseline} Z`}
        fill={FILL}
        stroke="none"
      />
      <path d={path} fill="none" stroke={STROKE} strokeWidth="1.8" />
      <ChromeLabel text="Basics" cx={w * 0.16} cy={16} />
      <ChromeLabel text="Performance" cx={w * 0.5} cy={16} />
      <ChromeLabel text="Delighters" cx={w * 0.84} cy={16} />
    </g>
  );
}

export function FunnelChrome({ w, h }: { w: number; h: number }) {
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

export function ConcentricChrome({ w, h }: { w: number; h: number }) {
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

export function ChromeLabel({ text, cx, cy }: { text: string; cx: number; cy: number }) {
  if (!text) return null;
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
