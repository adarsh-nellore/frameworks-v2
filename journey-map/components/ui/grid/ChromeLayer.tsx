"use client";

import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import {
  CoordinateCrossChrome,
  DoubleDiamondChrome,
  VennChrome,
  KanoCurveChrome,
  FunnelChrome,
  ConcentricChrome,
} from "./chromes";

// ──────────────────────────────────────────────────────────────────────────────
// ChromeLayer — legacy /canvas + FrameworkGrid wrapper. Renders chrome as a
// fixed 220px banner above the column headers (the original kanban / grid
// chrome positioning). The shape primitives live in `chromes.tsx` and are
// shared with EditableGrid's background-chrome layer (which sizes them to
// the actual cell substrate, not a fixed banner).
//
// New code should NOT add layouts here — the prompt-lab path uses
// EditableGrid's chrome layer where the SVG sits behind cells at the correct
// gridW × gridH. This file remains until /canvas migrates to EditableGrid.
// ──────────────────────────────────────────────────────────────────────────────

const CHROME_H = 220;

type Props = {
  config: FrameworkConfig;
  metaOverrides?: {
    chromeKind?: string;
    chromeLeftLabel?: string;
    chromeRightLabel?: string;
    chromeCircles?: string;
  };
  totalWidth: number;
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
  if (
    kind === "kano-curve" ||
    kind === "funnel" ||
    kind === "concentric" ||
    kind === "coordinate-cross"
  ) {
    return { kind };
  }
  return null;
}

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
    case "coordinate-cross":
      return <CoordinateCrossChrome w={w} h={h} />;
  }
}
