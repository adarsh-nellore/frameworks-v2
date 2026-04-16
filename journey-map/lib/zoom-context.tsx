"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;
export const STEP = 1.25;

export type ZoomState = { scale: number; x: number; y: number };

type ZoomContextValue = {
  scale: number;
  x: number;
  y: number;
  setScale: (next: number) => void;
  setPan: (next: { x: number; y: number }) => void;
  zoomBy: (factor: number, anchor?: { x: number; y: number }) => void;
  reset: () => void;
  fitToContent: (
    contentSize: { width: number; height: number },
    viewportSize: { width: number; height: number },
    margin?: number
  ) => void;
  /** Read latest scale synchronously, useful for dnd modifiers that capture stale closures. */
  getScale: () => number;
};

const ZoomContext = createContext<ZoomContextValue | null>(null);

export function ZoomProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  const setScale = useCallback((next: number) => {
    setState((s) => ({ ...s, scale: clamp(next, MIN_SCALE, MAX_SCALE) }));
  }, []);

  const setPan = useCallback((next: { x: number; y: number }) => {
    setState((s) => ({ ...s, x: next.x, y: next.y }));
  }, []);

  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setState((s) => {
        const newScale = clamp(s.scale * factor, MIN_SCALE, MAX_SCALE);
        if (newScale === s.scale) return s;
        const ratio = newScale / s.scale;
        if (!anchor) return { ...s, scale: newScale };
        // Anchor zoom around the cursor: keep the world point under the cursor stationary.
        return {
          scale: newScale,
          x: anchor.x - (anchor.x - s.x) * ratio,
          y: anchor.y - (anchor.y - s.y) * ratio,
        };
      });
    },
    []
  );

  const reset = useCallback(() => {
    setState({ scale: 1, x: 0, y: 0 });
  }, []);

  const fitToContent = useCallback(
    (
      content: { width: number; height: number },
      viewport: { width: number; height: number },
      margin = 0.92
    ) => {
      const cw = content.width;
      const ch = content.height;
      const vw = viewport.width;
      const vh = viewport.height;
      if (
        !Number.isFinite(cw) ||
        !Number.isFinite(ch) ||
        !Number.isFinite(vw) ||
        !Number.isFinite(vh) ||
        cw <= 0 ||
        ch <= 0 ||
        vw <= 0 ||
        vh <= 0
      ) {
        return;
      }
      const fit = Math.min(vw / cw, vh / ch, 1) * margin;
      if (!Number.isFinite(fit) || fit <= 0) return;
      const scale = clamp(fit, MIN_SCALE, MAX_SCALE);
      if (!Number.isFinite(scale) || scale <= 0) return;
      const x = (vw - cw * scale) / 2;
      const y = (vh - ch * scale) / 2;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      setState({ scale, x, y });
    },
    []
  );

  const getScale = useCallback(() => stateRef.current.scale, []);

  const value = useMemo<ZoomContextValue>(
    () => ({
      scale: state.scale,
      x: state.x,
      y: state.y,
      setScale,
      setPan,
      zoomBy,
      reset,
      fitToContent,
      getScale,
    }),
    [state.scale, state.x, state.y, setScale, setPan, zoomBy, reset, fitToContent, getScale]
  );

  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>;
}

export function useZoom(): ZoomContextValue {
  const ctx = useContext(ZoomContext);
  if (!ctx) throw new Error("useZoom must be used inside <ZoomProvider>");
  return ctx;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
