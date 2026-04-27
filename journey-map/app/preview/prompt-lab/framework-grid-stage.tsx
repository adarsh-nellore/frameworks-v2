"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EditableGrid } from "@/components/ui/grid/EditableGrid";
import { applyOps, type Op } from "@/lib/frameworks/universal/ops";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import {
  universalMapToCells,
  structureHintForConfig,
} from "@/lib/preview-data/universal-to-cells";

// ──────────────────────────────────────────────────────────────────────────────
// FrameworkGridStage — universal canvas + agent sidebar. Every generated
// board renders through the same EditableGrid cell substrate (same component
// /preview/strategy-board uses), with chrome (coordinate-cross / venn /
// kano-curve / etc.) drawn as a background SVG sized to the cell grid, and
// cellGroup regions overlaid as labeled rectangles. There is no longer a
// layout-specific renderer fork — every framework variant is a layout on top
// of the same substrate.
//
// The sidebar's prompt → clarifier → arrange flow remains intact. When
// arrange refuses with NEEDS_RELAYOUT, we auto-call onRegenerate so a
// structural reshape goes straight through /api/generate without the user
// having to click a separate button.
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
   *  triggers this automatically when the arrange agent refuses with a
   *  NEEDS_RELAYOUT summary (layout change requested but not possible via
   *  universal ops). The callback receives the composed instruction
   *  (prompt + clarifier constraints) plus the typed shape contract from
   *  the clarifier (when one was produced) so the regen pipeline can skip
   *  re-planning. */
  onRegenerate?: (userPrompt: string, contract?: unknown) => void;
};

export function FrameworkGridStage({ map: initialMap, config, isDynamic, summary, onReset, onRegenerate }: Props) {
  const [map, setMap] = useState<UniversalMap>(initialMap);
  useEffect(() => {
    setMap(initialMap);
  }, [initialMap]);

  // Flatten the universal map onto the EditableGrid cell substrate. Re-derive
  // on every map mutation so agent ops show up immediately. The flattener
  // owns chrome resolution + region extraction now.
  const flat = useMemo(() => universalMapToCells(map, config), [map, config]);
  const structureHint = useMemo(() => structureHintForConfig(config), [config]);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [relayoutNote, setRelayoutNote] = useState<string | null>(null);

  // Clarifier state — iteration-side conversational follow-ups. Mirror the
  // initial prompt-lab flow so users get the same chat-style drill-down when
  // they ask for something ambiguous (e.g., "make this a sliding scale").
  type TranscriptPair = { question: string; answer: string };
  type ClarifierQuestion = {
    question: string;
    rationale?: string;
    suggestions?: string[];
    allowFreeText: boolean;
  };
  const [transcript, setTranscript] = useState<TranscriptPair[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<ClarifierQuestion | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  // Contract from the most recent clarify turn. Forwarded through
  // onRegenerate so the regen pipeline doesn't replan from scratch.
  const [prefetchedContract, setPrefetchedContract] = useState<unknown>(null);
  const inClarifier = transcript.length > 0 || activeQuestion !== null;

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

  function buildBoardSnapshot(): string {
    const parts: string[] = [];
    parts.push(`Title: ${map.title || config.label}`);
    parts.push(`Layout: ${config.layout} · ${map.cols.length} cols × ${map.rows.length} rows · ${map.cards.length} cards`);
    if (map.cols.length > 0) {
      parts.push(`Cols: ${map.cols.map((c) => c.label || c.id).join(" | ")}`);
    }
    if (map.rows.length > 0) {
      parts.push(`Rows: ${map.rows.map((r) => r.label || r.id).join(" | ")}`);
    }
    // Carry every card so the clarifier + planner see the full content the
    // user is reshaping — not a thin sample. The planner needs the closed
    // list of named entities (competitors / labs / steps) to honor on the
    // new shape; the clarifier needs the same to ask grounded follow-ups.
    const allCards = map.cards
      .filter((c) => !c.parentCardId && c.text.trim().length > 0)
      .map((c) => {
        const col = map.cols.find((x) => x.id === c.colId)?.label ?? c.colId;
        const row = map.rows.find((x) => x.id === c.rowId)?.label ?? c.rowId;
        const text = c.text.replace(/\s+/g, " ");
        return `  · [${col} / ${row}] ${text}`;
      });
    if (allCards.length > 0) {
      parts.push(`Cards (${allCards.length}):`);
      parts.push(allCards.join("\n"));
    }
    return parts.join("\n");
  }

  /** Build the structured existingBoard payload that ships to
   *  `/api/preview/clarify` (and from there to runShapePlanner). The
   *  planner's enumerated-entities rule pins these names so a reshape
   *  redistributes them on the new shape rather than inventing fresh
   *  replacements. */
  function buildExistingBoardForPlanner(): {
    title?: string;
    cols?: string[];
    rows?: string[];
    cards: Array<{ col: string; row: string; text: string }>;
  } | undefined {
    const top = map.cards.filter((c) => !c.parentCardId && c.text.trim().length > 0);
    if (top.length === 0) return undefined;
    return {
      title: map.title || undefined,
      cols: map.cols.length > 0 ? map.cols.map((c) => c.label || c.id) : undefined,
      rows: map.rows.length > 0 ? map.rows.map((r) => r.label || r.id) : undefined,
      cards: top.map((c) => {
        const col = map.cols.find((x) => x.id === c.colId)?.label ?? c.colId;
        const row = map.rows.find((x) => x.id === c.rowId)?.label ?? c.rowId;
        return { col, row, text: c.text.replace(/\s+/g, " ") };
      }),
    };
  }

  /** Build the `# Existing board (preserve content; reshape only)` block
   *  appended to a reshape instruction. The planner + populate pipeline
   *  read this block as a closed list of entities/observations to honor
   *  on the new shape — they do NOT invent fresh names to fit the new
   *  layout. Mirrors the planner's existing `enumerated.entities` rule
   *  but driven by what's already on the board. */
  function buildExistingBoardBlock(): string {
    const top = map.cards.filter((c) => !c.parentCardId && c.text.trim().length > 0);
    if (top.length === 0) return "";
    const lines: string[] = [];
    lines.push("# Existing board (preserve content; reshape only)");
    lines.push(
      `The user is RESHAPING an existing board. Every entity/card listed below MUST appear in the new shape — redistributed across the new cols/rows but not invented anew. Treat names verbatim as enumerated content.`
    );
    lines.push("");
    if (map.title) lines.push(`Title: ${map.title}`);
    lines.push(
      `Current shape: ${map.cols.length} cols × ${map.rows.length} rows · ${top.length} cards`
    );
    if (map.cols.length > 0) {
      lines.push(`Original cols: ${map.cols.map((c) => c.label || c.id).join(" | ")}`);
    }
    if (map.rows.length > 0) {
      lines.push(`Original rows: ${map.rows.map((r) => r.label || r.id).join(" | ")}`);
    }
    lines.push("");
    lines.push("Cards to preserve:");
    for (const c of top) {
      const col = map.cols.find((x) => x.id === c.colId)?.label ?? c.colId;
      const row = map.rows.find((x) => x.id === c.rowId)?.label ?? c.rowId;
      const text = c.text.replace(/\s+/g, " ");
      lines.push(`- [${col} / ${row}] ${text}`);
    }
    return lines.join("\n");
  }

  function composeInstruction(userText: string, constraints: Record<string, string | string[] | undefined>): string {
    const lines: string[] = [userText];
    const keys = Object.keys(constraints).filter((k) => constraints[k] !== undefined);
    if (keys.length > 0) {
      lines.push("");
      // Match the synth pipeline's "user-confirmed" sentinel exactly so
      // /api/generate's interpreter-skip regex picks it up when this
      // composed instruction gets handed off via onRegenerate.
      lines.push("# Constraints (user-confirmed)");
      for (const k of keys) {
        const v = constraints[k];
        if (Array.isArray(v)) lines.push(`- ${k}: ${v.join(", ")}`);
        else if (typeof v === "string") lines.push(`- ${k}: ${v}`);
      }
    }
    const existing = buildExistingBoardBlock();
    if (existing) {
      lines.push("");
      lines.push(existing);
    }
    return lines.join("\n");
  }

  async function runArrangeCall(instruction: string): Promise<void> {
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
      if (summaryText.trim().startsWith("NEEDS_RELAYOUT:") || (data.ops.length === 0 && /NEEDS_RELAYOUT/i.test(summaryText))) {
        // Auto-route: when arrange refuses with NEEDS_RELAYOUT, the user's
        // intent was a structural shape change. The full /api/generate
        // pipeline can do that. Hand off the composed instruction (which
        // already includes any clarifier-confirmed constraints) and the
        // most recent typed contract so the regen pipeline skips its own
        // shape-planner call. Parent unmounts this stage and shows its
        // own generation status.
        if (onRegenerate) {
          setStatusMsg("Reshaping the whole board…");
          onRegenerate(instruction, prefetchedContract ?? undefined);
          return;
        }
        // Defensive fallback for the rare case the parent didn't supply
        // an onRegenerate — surface the original message so the user
        // isn't stuck silent.
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

  type ClarifyResponse =
    | {
        ok: true;
        ready: true;
        constraints: Record<string, string | string[] | undefined>;
        contract?: unknown;
      }
    | { ok: true; ready: false; question: ClarifierQuestion; contract?: unknown }
    | { ok: false; error?: string };

  async function handleStart() {
    const text = prompt.trim();
    if (!text || busy) return;
    setErrorMsg(null);
    setRelayoutNote(null);
    setStatusMsg(null);
    setTranscript([]);
    setActiveQuestion(null);
    setAnswerDraft("");
    setPrefetchedContract(null);
    setBusy(true);
    try {
      const res = await fetch("/api/preview/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          transcript: [],
          sourceDigest: { text: "", meta: { csvs: [], sourceCount: 0 } },
          boardSnapshot: buildBoardSnapshot(),
          existingBoard: buildExistingBoardForPlanner(),
        }),
      });
      const data = (await res.json()) as ClarifyResponse;
      if (!("ok" in data) || !data.ok) {
        // Clarifier unavailable — proceed straight to arrange.
        await runArrangeCall(text);
        return;
      }
      if ("contract" in data && data.contract) setPrefetchedContract(data.contract);
      if (data.ready) {
        await runArrangeCall(composeInstruction(text, data.constraints));
        return;
      }
      setActiveQuestion(data.question);
    } catch {
      await runArrangeCall(text);
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswer() {
    if (!activeQuestion || busy) return;
    const answer = answerDraft.trim();
    if (!answer) return;
    const next: TranscriptPair[] = [...transcript, { question: activeQuestion.question, answer }];
    setTranscript(next);
    setActiveQuestion(null);
    setAnswerDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/preview/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          transcript: next,
          sourceDigest: { text: "", meta: { csvs: [], sourceCount: 0 } },
          boardSnapshot: buildBoardSnapshot(),
          existingBoard: buildExistingBoardForPlanner(),
        }),
      });
      const data = (await res.json()) as ClarifyResponse;
      if (!("ok" in data) || !data.ok || data.ready) {
        const constraints = "ok" in data && data.ok && data.ready ? data.constraints : {};
        if ("contract" in data && data.contract) setPrefetchedContract(data.contract);
        await runArrangeCall(composeInstruction(prompt.trim(), constraints));
        return;
      }
      if ("contract" in data && data.contract) setPrefetchedContract(data.contract);
      setActiveQuestion(data.question);
    } catch {
      await runArrangeCall(prompt.trim());
    } finally {
      setBusy(false);
    }
  }

  function handleGenerateNow() {
    // Skip remaining clarifier turns — compose from whatever transcript
    // exists and fire arrange directly.
    const partial: Record<string, string | string[]> = {};
    if (transcript.length > 0) {
      partial.notes = transcript.map((p) => `${p.question} → ${p.answer}`);
    }
    void runArrangeCall(composeInstruction(prompt.trim(), partial));
    setTranscript([]);
    setActiveQuestion(null);
    setAnswerDraft("");
  }

  function handleCancelClarifier() {
    setTranscript([]);
    setActiveQuestion(null);
    setAnswerDraft("");
    setStatusMsg(null);
    setErrorMsg(null);
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
            <span className="text-ink-muted/70 normal-case tracking-normal font-sans">
              {inClarifier ? "clarifying…" : "universal ops"}
            </span>
          </div>

          {!inClarifier && (
            <>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void handleStart();
                  }
                }}
                placeholder={
                  'Ask the agent to do something — e.g. "add 3 pain points per stage", "mark the riskiest handoffs", "fill in missing opportunities for the Decision column".'
                }
                rows={7}
                className="w-full text-[11px] leading-[1.45] text-ink-primary bg-white ring-1 ring-border-medium rounded-md px-2.5 py-2 focus:outline-none focus:ring-indigo-400 focus:ring-[1.5px] placeholder:text-ink-muted resize-none"
              />
              <button
                onClick={handleStart}
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
            </>
          )}

          {inClarifier && (
            <div className="space-y-2">
              <div className="text-[11px] leading-[1.45] text-ink-primary bg-white ring-1 ring-border-soft rounded-md px-2.5 py-2">
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-indigo-700 mr-2">
                  You
                </span>
                {prompt.trim()}
              </div>
              {transcript.map((pair, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-[11px] leading-[1.45] text-ink-secondary bg-surface-hover ring-1 ring-border-soft rounded-md px-2.5 py-2">
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-muted mr-2">
                      Agent
                    </span>
                    {pair.question}
                  </div>
                  <div className="text-[11px] leading-[1.45] text-ink-primary bg-indigo-50 ring-1 ring-indigo-100 rounded-md px-2.5 py-2">
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-indigo-700 mr-2">
                      You
                    </span>
                    {pair.answer}
                  </div>
                </div>
              ))}
              {activeQuestion && !busy && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAnswer();
                  }}
                  className="space-y-2"
                >
                  <div className="text-[11px] leading-[1.45] text-ink-secondary bg-surface-hover ring-1 ring-border-soft rounded-md px-2.5 py-2">
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-muted mr-2">
                      Agent
                    </span>
                    {activeQuestion.question}
                    {activeQuestion.rationale && (
                      <div className="mt-1 text-[10.5px] text-ink-muted italic">
                        {activeQuestion.rationale}
                      </div>
                    )}
                  </div>
                  {activeQuestion.suggestions && activeQuestion.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activeQuestion.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAnswerDraft(s)}
                          className="text-[10.5px] text-ink-secondary bg-white ring-1 ring-border-soft rounded-full px-2 py-0.5 hover:ring-border-medium hover:bg-surface-hover"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void handleAnswer();
                      }
                    }}
                    rows={3}
                    autoFocus
                    placeholder="Type your answer… (⌘↵ to send)"
                    className="w-full text-[11px] leading-[1.45] text-ink-primary bg-white ring-1 ring-border-medium rounded-md px-2.5 py-2 focus:outline-none focus:ring-indigo-400 focus:ring-[1.5px] placeholder:text-ink-muted resize-none"
                  />
                  <button
                    type="submit"
                    disabled={answerDraft.trim().length === 0}
                    className={[
                      "w-full rounded-md py-1.5 text-[11px] font-medium",
                      answerDraft.trim().length === 0
                        ? "bg-indigo-600/40 text-white cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700",
                    ].join(" ")}
                  >
                    Send
                  </button>
                </form>
              )}
              {busy && !activeQuestion && (
                <div className="text-[10.5px] font-mono rounded px-2 py-1 ring-1 text-indigo-700 bg-indigo-50 ring-indigo-200">
                  <span className="text-indigo-600">●</span> Thinking…
                </div>
              )}
              <div className="flex gap-1">
                <button
                  onClick={handleGenerateNow}
                  disabled={busy}
                  className="flex-1 text-[10.5px] text-indigo-700 bg-indigo-50 ring-1 ring-indigo-200 rounded-md px-2 py-1 hover:bg-indigo-100 disabled:opacity-50"
                >
                  Run now
                </button>
                <button
                  onClick={handleCancelClarifier}
                  className="flex-1 text-[10.5px] text-ink-secondary bg-white ring-1 ring-border-medium rounded-md px-2 py-1 hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
              <EditableGrid
                key={`flat-${map.cards.length}-${flat.rows}x${flat.cols}-${flat.chrome?.kind ?? "none"}`}
                initialCells={flat.cells}
                initialConfig={{
                  cellW: 150,
                  cellH: 70,
                  gap: 16,
                  cols: flat.cols,
                  rows: flat.rows,
                }}
                rowLabels={flat.rowLabels}
                colLabels={flat.colLabels}
                chrome={flat.chrome}
                regions={flat.regions}
                structureHint={structureHint}
                frameworkName={config.label}
                instanceContext={summary || map.title || config.label}
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
