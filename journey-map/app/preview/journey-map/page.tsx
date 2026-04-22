"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { EditableGrid } from "@/components/ui/grid/EditableGrid";
import {
  JM_CELLS,
  JM_EDGES,
  JM_CLUSTERS,
  JM_ACTIONS,
  JM_ROW_LABELS,
  JM_COL_LABELS,
  JM_CONFIG,
  JM_FRAMEWORK_NAME,
  JM_STRUCTURE_HINT,
  JM_INSTANCE_CONTEXT,
} from "@/lib/preview-data/journey-map";

// ──────────────────────────────────────────────────────────────────────────────
// /preview/journey-map — B2B founder opening business banking (post-SVB era).
// Seeds + framework-specific agent actions live in lib/preview-data.
// ──────────────────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

export default function JourneyMapPreview() {
  const [scale, setScale] = useState(0.55);
  const [tx, setTx] = useState(40);
  const [ty, setTy] = useState(40);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el!.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        const delta = -e.deltaY * 0.0015;
        setScale((prev) => {
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * (1 + delta)));
          const ratio = next / prev;
          setTx((ptx) => ox - ratio * (ox - ptx));
          setTy((pty) => oy - ratio * (oy - pty));
          return next;
        });
      } else {
        e.preventDefault();
        setTx((v) => v - e.deltaX);
        setTy((v) => v - e.deltaY);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-eg-interactive]")) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    const s = dragState.current;
    if (!s) return;
    setTx(s.startTx + (e.clientX - s.startX));
    setTy(s.startTy + (e.clientY - s.startY));
  }
  function onPointerUp(e: ReactPointerEvent) {
    dragState.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "0") { setScale(0.55); setTx(40); setTy(40); }
      else if (e.key === "=" || e.key === "+") setScale((s) => Math.min(MAX_SCALE, s * 1.15));
      else if (e.key === "-" || e.key === "_") setScale((s) => Math.max(MIN_SCALE, s / 1.15));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="fixed inset-0 bg-surface overflow-hidden select-none">
      <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur rounded-lg ring-1 ring-border-soft px-4 py-3 max-w-md" data-eg-interactive>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          Preview · journey map · 18 × 22
        </div>
        <h1 className="text-base font-semibold text-ink-primary mt-0.5">
          Founder opening business banking (post-SVB)
        </h1>
        <p className="text-[11px] text-ink-muted mt-1">
          6 aspects × 7 stages. ~{JM_CELLS.length} cells, {JM_EDGES.length} pain→opportunity edges. Framework-specific buttons invoke a 3-agent reasoning pipeline (Theorist → Critic → Executor). ⌘/Ctrl+scroll to zoom · 0 resets.
        </p>
      </div>

      <div className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur rounded-md ring-1 ring-border-soft px-2 py-1" data-eg-interactive>
        <span className="text-[11px] font-mono tabular-nums text-ink-secondary">
          {Math.round(scale * 100)}%
        </span>
      </div>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        >
          <div className="p-8" data-eg-interactive>
            <EditableGrid
              initialCells={JM_CELLS}
              initialEdges={JM_EDGES}
              initialClusters={JM_CLUSTERS}
              initialConfig={JM_CONFIG}
              rowLabels={JM_ROW_LABELS}
              colLabels={JM_COL_LABELS}
              structureHint={JM_STRUCTURE_HINT}
              frameworkName={JM_FRAMEWORK_NAME}
              instanceContext={JM_INSTANCE_CONTEXT}
              customActions={JM_ACTIONS}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
