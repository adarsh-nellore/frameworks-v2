"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { MAX_SCALE, MIN_SCALE, useZoom } from "@/lib/zoom-context";

type Props = {
  children: ReactNode;
  /**
   * Selectors that should be treated as "interactive" — pointer-down on these
   * does NOT start a canvas pan. Cells, rows, stages, and empty-slot drop
   * targets fall under this. Everything else is empty space → drag-to-pan.
   */
  interactiveSelector?: string;
  /**
   * When true, all canvas interaction is disabled — wheel, pan, and pointer
   * events on empty space are no-ops. Used during long-running generation
   * so the canvas can't be panned/zoomed while the agent pipeline runs.
   * The Generation overlay sits above the canvas and provides its own UI.
   */
  locked?: boolean;
};

const DEFAULT_INTERACTIVE_SELECTOR =
  "[data-block],[data-row],[data-stage],[data-empty-slot],[data-row-shell],[data-floating],[data-edge-zone],[data-board-frame],[data-board-header],[data-board-map-root]";

/** How aggressively a wheel turns into zoom. Smaller = gentler. */
const ZOOM_SENSITIVITY = 0.004;
/** Pan damping — 1.0 follows wheel exactly; <1 slows it. */
const PAN_DAMPING = 0.9;

export function Canvas({
  children,
  interactiveSelector = DEFAULT_INTERACTIVE_SELECTOR,
  locked = false,
}: Props) {
  const { x, y, scale, setPan, setScale, fitToContent } = useZoom();
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Live refs so the (mount-once) native wheel listener always sees fresh state.
  const xRef = useRef(x);
  const yRef = useRef(y);
  const scaleRef = useRef(scale);
  const lockedRef = useRef(locked);
  xRef.current = x;
  yRef.current = y;
  scaleRef.current = scale;
  lockedRef.current = locked;

  // Auto-fit content to viewport on mount.
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const stage = stageRef.current;
    if (!outer || !stage) return;
    const id = requestAnimationFrame(() => {
      const cw = stage.scrollWidth;
      const ch = stage.scrollHeight;
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      if (
        !Number.isFinite(cw) ||
        !Number.isFinite(ch) ||
        !Number.isFinite(ow) ||
        !Number.isFinite(oh) ||
        cw <= 0 ||
        ch <= 0 ||
        ow <= 0 ||
        oh <= 0
      ) {
        return;
      }
      fitToContent({ width: cw, height: ch }, { width: ow, height: oh }, 0.86);
    });
    return () => cancelAnimationFrame(id);
  }, [fitToContent]);

  // Single native wheel listener. We need it native because React's synthetic
  // wheel handler is passive by default (cannot preventDefault), and a duplicate
  // React+native pair caused a stale-closure race that made pan jitter.
  useEffect(() => {
    const node = outerRef.current;
    if (!node) return;

    function onWheel(e: WheelEvent) {
      const outer = outerRef.current;
      if (!outer) return;
      if (lockedRef.current) return; // locked → no preventDefault, no pan/zoom
      e.preventDefault();

      // Cmd/Ctrl + wheel → zoom, anchored at cursor.
      if (e.ctrlKey || e.metaKey) {
        const rect = outer.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const oldScale = scaleRef.current;
        // Exponential mapping: smooth, sign-preserving, deltaY-magnitude-aware.
        const newScale = clamp(
          oldScale * Math.exp(-e.deltaY * ZOOM_SENSITIVITY),
          MIN_SCALE,
          MAX_SCALE
        );
        if (newScale === oldScale) return;
        const ratio = newScale / oldScale;
        setPan({
          x: cx - (cx - xRef.current) * ratio,
          y: cy - (cy - yRef.current) * ratio,
        });
        setScale(newScale);
        return;
      }

      // Plain wheel → pan. Damped so trackpad inertia isn't overwhelming.
      setPan({
        x: xRef.current - e.deltaX * PAN_DAMPING,
        y: yRef.current - e.deltaY * PAN_DAMPING,
      });
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
    // Intentionally mount-once: handlers read from refs to avoid stale closures.
  }, [setPan, setScale]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (locked) return;
      if (e.button !== 0 && e.pointerType !== "touch") return;
      const target = e.target as HTMLElement;
      if (target.closest(interactiveSelector)) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const originX = xRef.current;
      const originY = yRef.current;
      setIsPanning(true);
      const node = outerRef.current;
      const onMove = (ev: PointerEvent) => {
        setPan({
          x: originX + (ev.clientX - startX),
          y: originY + (ev.clientY - startY),
        });
      };
      const onUp = () => {
        setIsPanning(false);
        node?.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      node?.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [interactiveSelector, setPan, locked]
  );

  return (
    <div
      ref={outerRef}
      onPointerDown={handlePointerDown}
      className={[
        "absolute inset-0 overflow-hidden touch-none select-none",
        isPanning ? "cursor-grabbing" : "cursor-grab",
      ].join(" ")}
      data-canvas-root
    >
      <div
        ref={innerRef}
        className="absolute top-0 left-0"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        <div ref={stageRef} className="inline-block">
          {children}
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
