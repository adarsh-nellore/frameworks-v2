"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FrameworkGrid } from "@/components/ui/FrameworkGrid";
import { applyOps, type Op } from "@/lib/frameworks/universal/ops";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

// ──────────────────────────────────────────────────────────────────────────────
// FrameworkGridStage — when the generated UniversalMap has multi-card cells
// or a grid layout with meaningful swimlanes, we render it through the real
// product's `FrameworkGrid` instead of flattening onto EditableGrid. The
// custom-prompt sidebar dispatches to the product's existing /api/arrange
// endpoint (same path the real Copilot uses) so iteration stays wired through
// the product's own reasoning pipeline.
// ──────────────────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.25;
const MAX_SCALE = 1.8;
const DEFAULT_SCALE = 0.75;

type Props = {
  map: UniversalMap;
  config: FrameworkConfig;
  /** True when the config was synthesized at runtime. We forward it as
   *  `customConfig` so the serverless /api/arrange route can resolve it
   *  (the server has no access to the client-side dynamic registry). */
  isDynamic: boolean;
  summary: string;
  onReset: () => void;
  /** Optional — parent can provide a full-regenerate path. The sidebar
   *  surfaces a "Regenerate with new shape" button when the arrange agent
   *  refuses with a NEEDS_RELAYOUT summary (layout change requested but not
   *  possible via universal ops). The callback receives the user's prompt
   *  so the parent can seed /api/generate with the subject + reshape text. */
  onRegenerate?: (userPrompt: string) => void;
};

export function FrameworkGridStage({ map: initialMap, config, isDynamic, summary, onReset, onRegenerate }: Props) {
  const [map, setMap] = useState<UniversalMap>(initialMap);
  useEffect(() => {
    setMap(initialMap);
  }, [initialMap]);

  // Quadrant override: the arrange agent can change cols/rows/cards but CAN'T
  // change config.layout via the universal ops. When a user asks "turn this
  // into a 2×2 / quadrants / matrix", the agent correctly produces a 2-col ×
  // 2-row structure with meaningful axis labels, but the renderer keeps using
  // `grid` chrome (tall narrow swimlanes). Detect the 2×2-with-labels shape
  // and switch chrome to `matrix` at render time. Heuristic, intentionally
  // delete-able once we add a `setLayout` op to the universal ops list.
  const effectiveConfig = useMemo<FrameworkConfig>(() => {
    const is2x2 = map.cols.length === 2 && map.rows.length === 2;
    const hasAxisLabels =
      map.cols.every((c) => c.label.trim().length > 0) &&
      map.rows.every((r) => r.label.trim().length > 0);
    if (is2x2 && hasAxisLabels && config.layout !== "matrix") {
      return { ...config, layout: "matrix" };
    }
    return config;
  }, [map.cols, map.rows, config]);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [relayoutNote, setRelayoutNote] = useState<string | null>(null);

  // Pan / zoom stage (same UX as the EditableGrid stage)
  const [scale, setScale] = useState(DEFAULT_SCALE);
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
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "0") {
        setScale(DEFAULT_SCALE);
        setTx(40);
        setTy(40);
      } else if (e.key === "=" || e.key === "+") {
        setScale((s) => Math.min(MAX_SCALE, s * 1.15));
      } else if (e.key === "-" || e.key === "_") {
        setScale((s) => Math.max(MIN_SCALE, s / 1.15));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cardCount = map.cards.length;
  const subject = useMemo(() => map.title?.trim() || summary.trim() || config.label, [map.title, summary, config.label]);

  async function runPrompt() {
    const instruction = prompt.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setStatusMsg("Asking the agent…");
    setErrorMsg(null);
    setRelayoutNote(null);
    try {
      const res = await fetch("/api/arrange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameworkId: config.id,
          map,
          instruction,
          customConfig: isDynamic ? config : undefined,
        }),
      });
      const data = (await res.json()) as
        | { summary: string; ops: Op[] }
        | { error: string; ops?: unknown[]; failedAtIndex?: number };
      if (!res.ok || !("ops" in data) || !Array.isArray(data.ops)) {
        const message = "error" in data ? data.error : `HTTP ${res.status}`;
        throw new Error(message);
      }
      const summaryText = "summary" in data ? data.summary : "";
      // The arrange agent is instructed to refuse layout-change requests with
      // a NEEDS_RELAYOUT: prefix + empty ops. Surface this as a dedicated UI
      // state that offers the Regenerate escape hatch instead of pretending
      // a no-op succeeded.
      if (summaryText.trim().startsWith("NEEDS_RELAYOUT:") || (data.ops.length === 0 && /NEEDS_RELAYOUT/i.test(summaryText))) {
        const cleaned = summaryText.replace(/^NEEDS_RELAYOUT:\s*/, "").trim();
        setRelayoutNote(cleaned || "This is a layout change and needs a fresh generation.");
        setStatusMsg(null);
        return;
      }
      const applied = applyOps(map, data.ops as Op[]);
      if (!applied.ok) {
        throw new Error(`Ops failed at index ${applied.failedAtIndex}: ${applied.reason}`);
      }
      setMap(applied.map);
      setStatusMsg(`↺ ${summaryText || "Applied"}`);
      window.setTimeout(() => setStatusMsg(null), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 bg-surface overflow-hidden select-none flex">
      {/* Sidebar — custom prompt + status */}
      <aside
        className="w-[300px] shrink-0 bg-canvas ring-1 ring-border-soft flex flex-col gap-3 p-4 overflow-y-auto z-20"
        data-eg-interactive
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            Preview · prompt lab
          </div>
          <h1 className="text-[13px] font-semibold text-ink-primary mt-0.5 leading-tight">
            {subject}
          </h1>
          <div className="text-[11px] text-ink-muted mt-1">
            {cardCount} cards · layout{" "}
            <span className="font-mono">{config.layout}</span> · {map.cols.length}×{map.rows.length}
          </div>
          <button
            onClick={onReset}
            className="mt-2 text-[10.5px] text-ink-muted hover:text-ink-secondary underline underline-offset-2"
          >
            ← Start over with a new prompt
          </button>
        </div>

        <div className="border-t border-border-soft pt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2 flex items-center justify-between">
            <span>Agent prompt</span>
            <span className="text-ink-muted/70 normal-case tracking-normal font-sans">universal ops</span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void runPrompt();
              }
            }}
            placeholder={
              'Ask the agent to do something — e.g. "add 3 pain points per stage", "mark the riskiest handoffs", "fill in missing opportunities for the Decision column".'
            }
            rows={7}
            className="w-full text-[11px] leading-[1.45] text-ink-primary bg-white ring-1 ring-border-medium rounded-md px-2.5 py-2 focus:outline-none focus:ring-indigo-400 focus:ring-[1.5px] placeholder:text-ink-muted resize-none"
          />
          <button
            onClick={runPrompt}
            disabled={busy || prompt.trim().length === 0}
            className={[
              "w-full mt-2 rounded-md py-1.5 text-[11px] font-medium transition-colors flex items-center justify-center gap-2",
              busy || prompt.trim().length === 0
                ? "bg-indigo-600/40 text-white cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700",
            ].join(" ")}
          >
            {busy ? <Spinner /> : null}
            {busy ? "Running…" : "Run prompt"}
            {!busy && (
              <span className="opacity-60 font-mono text-[9.5px] tracking-wider">⌘↵</span>
            )}
          </button>
          {statusMsg && (
            <div className="mt-2 text-[10.5px] font-mono rounded px-2 py-1 ring-1 text-indigo-700 bg-indigo-50 ring-indigo-200">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="mt-2 text-[10.5px] font-mono rounded px-2 py-1 ring-1 text-red-700 bg-red-50 ring-red-200">
              ✕ {errorMsg}
            </div>
          )}
          {relayoutNote && (
            <div className="mt-2 rounded px-2.5 py-2 ring-1 text-amber-900 bg-amber-50 ring-amber-200 text-[11px] leading-[1.45]">
              <div className="font-medium mb-1">Needs a new shape</div>
              <div className="text-amber-800/90">{relayoutNote}</div>
              {onRegenerate && (
                <button
                  onClick={() => {
                    const userPrompt = prompt.trim();
                    onRegenerate(userPrompt);
                  }}
                  className="mt-2 w-full rounded-md py-1.5 text-[11px] font-medium bg-amber-600 text-white hover:bg-amber-700"
                >
                  Regenerate with this prompt
                </button>
              )}
              <button
                onClick={() => setRelayoutNote(null)}
                className="mt-1 w-full text-[10.5px] text-amber-700 hover:text-amber-900 underline underline-offset-2"
              >
                Dismiss · keep editing in place
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border-soft pt-3 text-[10.5px] text-ink-muted leading-[1.5]">
          <div className="font-mono uppercase tracking-[0.18em] text-ink-muted mb-2 text-[10px]">
            Notes
          </div>
          This board goes through the product&apos;s real renderer and arrange
          endpoint — same path the Copilot uses on /canvas. Multi-item cells,
          sub-items, and connectors are first-class.
        </div>

        <div className="mt-auto pt-3 border-t border-border-soft">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2 flex items-center justify-between">
            <span>View</span>
            <span className="text-ink-muted/70 normal-case tracking-normal font-sans tabular-nums">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <label className="block">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-ink-secondary">Zoom</span>
              <span className="text-[11px] font-mono tabular-nums text-ink-muted">
                {Math.round(scale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.02}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full mt-1 accent-indigo-600"
            />
          </label>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <ViewButton
              label="Fit"
              onClick={() => {
                const el = stageRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const inner = el.querySelector<HTMLElement>("[data-eg-interactive]");
                const contentW = inner?.scrollWidth ?? rect.width;
                const contentH = inner?.scrollHeight ?? rect.height;
                if (contentW <= 0 || contentH <= 0) return;
                const pad = 80;
                const sx = (rect.width - pad) / contentW;
                const sy = (rect.height - pad) / contentH;
                const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(sx, sy)));
                setScale(next);
                setTx(40);
                setTy(40);
              }}
            />
            <ViewButton
              label="100%"
              onClick={() => setScale(1)}
            />
            <ViewButton
              label="Reset"
              onClick={() => {
                setScale(DEFAULT_SCALE);
                setTx(40);
                setTy(40);
              }}
            />
          </div>
          <div className="mt-2 text-[10.5px] font-mono text-ink-muted leading-[1.45]">
            ⌘/Ctrl+scroll to zoom at cursor · 0 resets · drag background to pan
          </div>
        </div>
      </aside>

      {/* Stage */}
      <div className="flex-1 relative">
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
              <FrameworkGrid
                map={map}
                config={effectiveConfig}
                onChange={(next) => setMap(next)}
                busy={busy}
                selection={null}
                onSelectionChange={() => {}}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ViewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[10.5px] rounded ring-1 ring-border-soft py-1 bg-white text-ink-secondary hover:ring-border-medium hover:bg-surface-hover transition-colors"
    >
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
