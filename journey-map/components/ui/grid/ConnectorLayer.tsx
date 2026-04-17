"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  Connector,
  ConnectorAnchor,
  ConnectorRouting,
} from "@/lib/frameworks/universal/types";

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers — compute logical (pre-transform) positions by summing
// offsetLeft/offsetTop up the offsetParent chain. This keeps connectors
// aligned even when the surrounding container has a CSS transform (zoom/pan),
// which would otherwise make getBoundingClientRect double-apply the scale.
// ─────────────────────────────────────────────────────────────────────────────

type Box = { id: string; x: number; y: number; w: number; h: number };

function docPos(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

function anchorPoint(b: Box, side: ConnectorAnchor): { x: number; y: number } {
  switch (side) {
    case "top":    return { x: b.x + b.w / 2, y: b.y };
    case "bottom": return { x: b.x + b.w / 2, y: b.y + b.h };
    case "left":   return { x: b.x,            y: b.y + b.h / 2 };
    case "right":  return { x: b.x + b.w,      y: b.y + b.h / 2 };
  }
}

function autoAnchors(source: Box, target: Box): { s: ConnectorAnchor; t: ConnectorAnchor } {
  const sCx = source.x + source.w / 2;
  const sCy = source.y + source.h / 2;
  const tCx = target.x + target.w / 2;
  const tCy = target.y + target.h / 2;
  const dx = tCx - sCx;
  const dy = tCy - sCy;
  // Pick the dominant axis. Horizontal dominance → side-to-side anchors so
  // the arrow reads like a sequence; vertical → top/bottom.
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { s: "right", t: "left" } : { s: "left", t: "right" };
  }
  return dy >= 0 ? { s: "bottom", t: "top" } : { s: "top", t: "bottom" };
}

function buildPath(
  from: { x: number; y: number },
  fromSide: ConnectorAnchor,
  to: { x: number; y: number },
  toSide: ConnectorAnchor,
  routing: ConnectorRouting
): string {
  if (routing === "straight") {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  // Orthogonal: drop out perpendicular to each anchor side, then meet in the
  // middle with a two-bend elbow. Small lead-out so the bend doesn't start
  // flush against the card edge.
  const LEAD = 16;
  const leadOut = (p: { x: number; y: number }, side: ConnectorAnchor) => {
    switch (side) {
      case "top":    return { x: p.x, y: p.y - LEAD };
      case "bottom": return { x: p.x, y: p.y + LEAD };
      case "left":   return { x: p.x - LEAD, y: p.y };
      case "right":  return { x: p.x + LEAD, y: p.y };
    }
  };
  const a = leadOut(from, fromSide);
  const b = leadOut(to, toSide);
  // Decide elbow orientation from the sides. If either anchor points
  // horizontally, do H→V→H (horizontal first); otherwise V→H→V.
  const horizontalFirst =
    fromSide === "left" ||
    fromSide === "right" ||
    toSide === "left" ||
    toSide === "right";
  if (horizontalFirst) {
    const midX = (a.x + b.x) / 2;
    return [
      `M ${from.x} ${from.y}`,
      `L ${a.x} ${a.y}`,
      `L ${midX} ${a.y}`,
      `L ${midX} ${b.y}`,
      `L ${b.x} ${b.y}`,
      `L ${to.x} ${to.y}`,
    ].join(" ");
  }
  const midY = (a.y + b.y) / 2;
  return [
    `M ${from.x} ${from.y}`,
    `L ${a.x} ${a.y}`,
    `L ${a.x} ${midY}`,
    `L ${b.x} ${midY}`,
    `L ${b.x} ${b.y}`,
    `L ${to.x} ${to.y}`,
  ].join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectorDraft = {
  fromCardId: string;
  fromAnchor: ConnectorAnchor;
  /** Pointer position in container-local coords. */
  toX: number;
  toY: number;
};

type Props = {
  connectors: Connector[];
  /** The card container the connectors render inside. Passed as a ref so we
   *  can query [data-card-id] descendants and compute positions. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Re-run position computation when the map changes identity. Caller passes
   *  a stable-if-unchanged reference (e.g. map.cards) so we can depend on it. */
  recomputeKey: unknown;
  defaultRouting?: ConnectorRouting;
  selectedConnectorIds?: Set<string>;
  onConnectorClick?: (id: string, additive: boolean) => void;
  /** Live-drawing ghost during drag-to-connect. */
  draft?: ConnectorDraft | null;
  /** Called when a user drags a selected connector's endpoint onto a new
   *  card. Receives which end was moved and the id of the new endpoint card. */
  onReassignEndpoint?: (
    connectorId: string,
    end: "source" | "target",
    newCardId: string
  ) => void;
};

export function ConnectorLayer({
  connectors,
  containerRef,
  recomputeKey,
  defaultRouting = "orthogonal",
  selectedConnectorIds,
  onConnectorClick,
  draft,
  onReassignEndpoint,
}: Props) {
  const [boxes, setBoxes] = useState<Map<string, Box>>(() => new Map());
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);
  // Ghost while the user is dragging one endpoint of an existing connector to
  // a new card. Holds the connector id, which end is moving, and the live
  // pointer position in container-local coords.
  const [endpointDrag, setEndpointDrag] = useState<{
    connectorId: string;
    end: "source" | "target";
    x: number;
    y: number;
  } | null>(null);

  const beginEndpointDrag = useCallback(
    (connectorId: string, end: "source" | "target", e: React.PointerEvent) => {
      const root = containerRef.current;
      if (!root) return;
      e.preventDefault();
      e.stopPropagation();
      const pointerToLocal = (cx: number, cy: number) => {
        const rect = root.getBoundingClientRect();
        return {
          x: cx - rect.left + root.scrollLeft,
          y: cy - rect.top + root.scrollTop,
        };
      };
      const start = pointerToLocal(e.clientX, e.clientY);
      setEndpointDrag({ connectorId, end, x: start.x, y: start.y });

      const onMove = (ev: PointerEvent) => {
        const p = pointerToLocal(ev.clientX, ev.clientY);
        setEndpointDrag((prev) => (prev ? { ...prev, x: p.x, y: p.y } : prev));
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };
      const onUp = (ev: PointerEvent) => {
        cleanup();
        setEndpointDrag(null);
        // Resolve drop target: topmost element carrying data-card-id.
        const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
        let targetId: string | null = null;
        for (const node of stack) {
          if (!(node instanceof HTMLElement)) continue;
          const found = node.closest<HTMLElement>("[data-card-id]");
          if (found) {
            targetId = found.getAttribute("data-card-id");
            break;
          }
        }
        if (!targetId) return;
        onReassignEndpoint?.(connectorId, end, targetId);
      };
      const onCancel = () => {
        cleanup();
        setEndpointDrag(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [containerRef, onReassignEndpoint]
  );

  const recompute = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const contPos = docPos(root);
    const next = new Map<string, Box>();
    root.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
      const id = el.getAttribute("data-card-id");
      if (!id) return;
      // Skip nested card shells (sub-items also have data-card-id) — we only
      // anchor to top-level card faces. The top-level card renders
      // data-card-face inside; sub-items render as span-like rows. For v1 we
      // accept anchoring to any data-card-id; ConnectorLayer treats them all
      // as valid endpoints.
      const p = docPos(el);
      next.set(id, {
        id,
        x: p.x - contPos.x,
        y: p.y - contPos.y,
        w: el.offsetWidth,
        h: el.offsetHeight,
      });
    });
    setBoxes(next);
    setSize({ w: root.scrollWidth, h: root.scrollHeight });
  }, [containerRef]);

  const scheduleRecompute = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recompute();
    });
  }, [recompute]);

  // Re-layout whenever the map changes (cards added/removed/moved) or the
  // connector list changes (new endpoints to measure).
  useLayoutEffect(() => {
    recompute();
  }, [recompute, recomputeKey, connectors]);

  // Observe size changes on the container + individual cards (textareas grow
  // while editing). Also listen for window resize so a browser resize shifts
  // connectors smoothly.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const ro = new ResizeObserver(scheduleRecompute);
    ro.observe(root);
    root.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => ro.observe(el));
    window.addEventListener("resize", scheduleRecompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleRecompute);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, scheduleRecompute, recomputeKey, connectors]);

  if (size.w === 0 || size.h === 0) return null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="connector-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
        <marker
          id="connector-arrow-sel"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {/* Existing connectors */}
      {connectors.map((e) => {
        const s = boxes.get(e.sourceCardId);
        const t = boxes.get(e.targetCardId);
        if (!s || !t) return null;
        const auto = autoAnchors(s, t);
        const sSide = e.sourceAnchor ?? auto.s;
        const tSide = e.targetAnchor ?? auto.t;
        const from = anchorPoint(s, sSide);
        const to = anchorPoint(t, tSide);
        const d = buildPath(from, sSide, to, tSide, e.routing ?? defaultRouting);
        const isSelected = selectedConnectorIds?.has(e.id) ?? false;
        const isEndpointDragging = endpointDrag?.connectorId === e.id;
        return (
          <g key={e.id} className={isSelected ? "text-accent" : "text-ink-muted"}>
            {/* Invisible hit target — 12px wide so clicks along the path select it. */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              className="pointer-events-auto cursor-pointer"
              onClick={(evt) => {
                evt.stopPropagation();
                onConnectorClick?.(e.id, evt.metaKey || evt.shiftKey || evt.ctrlKey);
              }}
            />
            {/* Visible stroke */}
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={isSelected ? 2.25 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={`url(#${isSelected ? "connector-arrow-sel" : "connector-arrow"})`}
              opacity={isEndpointDragging ? 0.25 : isSelected ? 1 : 0.72}
            />
            {e.label ? (
              <ConnectorLabel d={d} label={e.label} selected={isSelected} />
            ) : null}
            {/* Endpoint handles — visible when the connector is selected so
                 users can drag either end onto a different card to reroute it
                 without deleting and recreating. */}
            {isSelected && onReassignEndpoint ? (
              <>
                <EndpointHandle
                  cx={from.x}
                  cy={from.y}
                  end="source"
                  onPointerDown={(ev) => beginEndpointDrag(e.id, "source", ev)}
                />
                <EndpointHandle
                  cx={to.x}
                  cy={to.y}
                  end="target"
                  onPointerDown={(ev) => beginEndpointDrag(e.id, "target", ev)}
                />
              </>
            ) : null}
          </g>
        );
      })}

      {/* Draft ghost during drag-to-connect */}
      {draft ? <DraftGhost draft={draft} boxes={boxes} defaultRouting={defaultRouting} /> : null}

      {/* Ghost while dragging an existing connector's endpoint to a new card */}
      {endpointDrag ? (
        <EndpointDragGhost
          drag={endpointDrag}
          connector={connectors.find((c) => c.id === endpointDrag.connectorId)}
          boxes={boxes}
          defaultRouting={defaultRouting}
        />
      ) : null}
    </svg>
  );
}

function EndpointHandle({
  cx,
  cy,
  end,
  onPointerDown,
}: {
  cx: number;
  cy: number;
  end: "source" | "target";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <g>
      {/* Outer hit area — generous so the handle is easy to grab at any zoom */}
      <circle
        cx={cx}
        cy={cy}
        r={9}
        fill="transparent"
        className="pointer-events-auto cursor-grab"
        onPointerDown={onPointerDown}
        aria-label={end === "source" ? "Drag source endpoint" : "Drag target endpoint"}
      />
      {/* Visible dot */}
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="white"
        stroke="currentColor"
        strokeWidth={1.5}
        className="pointer-events-none"
      />
    </g>
  );
}

function EndpointDragGhost({
  drag,
  connector,
  boxes,
  defaultRouting,
}: {
  drag: { connectorId: string; end: "source" | "target"; x: number; y: number };
  connector: Connector | undefined;
  boxes: Map<string, Box>;
  defaultRouting: ConnectorRouting;
}) {
  if (!connector) return null;
  const fixedCardId =
    drag.end === "source" ? connector.targetCardId : connector.sourceCardId;
  const fixedBox = boxes.get(fixedCardId);
  if (!fixedBox) return null;
  const fixedSide: ConnectorAnchor =
    drag.end === "source"
      ? connector.targetAnchor ?? "left"
      : connector.sourceAnchor ?? "right";
  const fixedPt = anchorPoint(fixedBox, fixedSide);
  const d = buildPath(
    fixedPt,
    fixedSide,
    { x: drag.x, y: drag.y },
    "left",
    connector.routing ?? defaultRouting
  );
  return (
    <g className="text-accent">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <circle cx={drag.x} cy={drag.y} r={5} fill="currentColor" />
    </g>
  );
}

// Label rendered at the midpoint of the path, in a small chip-like group.
function ConnectorLabel({ d, label, selected }: { d: string; label: string; selected: boolean }) {
  const ref = useRef<SVGPathElement | null>(null);
  const [mid, setMid] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    try {
      const len = node.getTotalLength();
      const p = node.getPointAtLength(len / 2);
      setMid({ x: p.x, y: p.y });
    } catch {
      setMid(null);
    }
  }, [d]);
  if (!mid) return <path ref={ref} d={d} fill="none" stroke="none" />;
  const pad = 4;
  const approxW = Math.max(24, label.length * 6.2);
  return (
    <>
      <path ref={ref} d={d} fill="none" stroke="none" />
      <rect
        x={mid.x - approxW / 2 - pad}
        y={mid.y - 8}
        width={approxW + pad * 2}
        height={16}
        rx={4}
        ry={4}
        fill="white"
        stroke="currentColor"
        strokeWidth={selected ? 1.25 : 1}
        opacity={selected ? 1 : 0.9}
      />
      <text
        x={mid.x}
        y={mid.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={9}
        fill="currentColor"
      >
        {label}
      </text>
    </>
  );
}

function DraftGhost({
  draft,
  boxes,
  defaultRouting,
}: {
  draft: ConnectorDraft;
  boxes: Map<string, Box>;
  defaultRouting: ConnectorRouting;
}) {
  const s = boxes.get(draft.fromCardId);
  if (!s) return null;
  const from = anchorPoint(s, draft.fromAnchor);
  const to = { x: draft.toX, y: draft.toY };
  // For the draft, auto-pick the virtual target side based on which direction
  // the pointer is moving relative to the source.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const targetSide: ConnectorAnchor =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "left" : "right") : dy >= 0 ? "top" : "bottom";
  const d = buildPath(from, draft.fromAnchor, to, targetSide, defaultRouting);
  return (
    <g className="text-accent">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        strokeLinecap="round"
        markerEnd="url(#connector-arrow-sel)"
      />
      <circle cx={to.x} cy={to.y} r={4} fill="currentColor" />
    </g>
  );
}
