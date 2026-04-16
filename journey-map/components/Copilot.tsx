"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import type {
  JourneyMap,
  JourneyMapSelection,
} from "@/lib/frameworks/journey-map/types";
import type { Op } from "@/lib/frameworks/journey-map/ops";
import { applyOps } from "@/lib/frameworks/journey-map/ops";
import { renderCellText } from "@/lib/cell-text";
import { kindTheme } from "@/lib/row-kind-theme";

type Props = {
  frameworkId: string;
  map: JourneyMap;
  onMapChange: (next: JourneyMap) => void;
  exampleInstructions: string[];
  onBusyChange?: (busy: boolean) => void;
  /** Current canvas selection sent as agent focus (optional on the wire). */
  focus: JourneyMapSelection | null;
  onFocusClear: () => void;
};

type ChatMsg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; opsCount: number }
  | { id: string; role: "error"; text: string; retryFor: string };

let msgCounter = 0;
const nextId = () => `m${++msgCounter}`;

type BlockPreview = {
  cellId: string;
  text: string;
  rowKind: string;
  rowLabel: string;
  stageLabel: string;
};

function blockFocusPreviews(
  map: JourneyMap,
  focus: Extract<JourneyMapSelection, { type: "blocks" }>
): BlockPreview[] {
  const out: BlockPreview[] = [];
  for (const id of focus.ids) {
    const cell = map.cells.find((c) => c.id === id);
    if (!cell) continue;
    const row = map.rows.find((r) => r.id === cell.rowId);
    const stage = map.stages.find((s) => s.id === cell.stageId);
    if (!row || !stage) continue;
    out.push({
      cellId: cell.id,
      text: cell.text,
      rowKind: row.kind,
      rowLabel: row.label || row.id,
      stageLabel: stage.label || stage.id,
    });
  }
  return out;
}

export function Copilot({
  frameworkId,
  map,
  onMapChange,
  exampleInstructions,
  onBusyChange,
  focus,
  onFocusClear,
}: Props) {
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function setBusyBoth(v: boolean) {
    setBusy(v);
    onBusyChange?.(v);
  }

  // Auto-scroll chat to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy, expanded]);

  // Auto-expand the panel once a conversation has started.
  useEffect(() => {
    if (messages.length > 0) setExpanded(true);
  }, [messages.length]);

  async function sendIntent(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusyBoth(true);
    setExpanded(true);
    setMessages((m) => [...m, { id: nextId(), role: "user", text: trimmed }]);
    try {
      const res = await fetch("/api/arrange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          frameworkId,
          map,
          instruction: trimmed,
          ...(focus ? { focus } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Arrange failed (HTTP ${res.status})`);
      }
      const ops = data.ops as Op[];
      const result = applyOps(map, ops);
      if (!result.ok) {
        throw new Error(
          `Could not apply ops: ${result.reason} (at index ${result.failedAtIndex})`
        );
      }
      onMapChange(result.map);
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "assistant",
          text: data.summary ?? "Updated.",
          opsCount: Array.isArray(ops) ? ops.length : 0,
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "error", text: msg, retryFor: trimmed },
      ]);
    } finally {
      setBusyBoth(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void sendIntent(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  }

  const visiblePills = exampleInstructions.slice(0, 4);
  const showPills = !expanded && messages.length === 0;

  const cardPreviews = useMemo(() => {
    if (!focus || focus.type !== "blocks") return [];
    return blockFocusPreviews(map, focus);
  }, [map, focus]);

  return (
    <div
      data-floating
      data-copilot
      className={[
        "fixed bottom-5 left-1/2 -translate-x-1/2 z-30",
        "w-[640px] max-w-[calc(100vw-2rem)]",
        "glass-strong rounded-2xl flex flex-col overflow-hidden",
        "transition-[max-height] duration-300 ease-out",
      ].join(" ")}
      style={{ maxHeight: expanded ? "min(56vh, 560px)" : "320px" }}
    >
      {/* Chat history (only when there's something to show) */}
      {(messages.length > 0 || busy) && (
        <div
          ref={scrollRef}
          className="chat-scroll flex-1 overflow-y-auto px-5 pt-4 pb-3 space-y-3 min-h-0"
        >
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={
                  m.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                {m.role === "user" && (
                  <div className="max-w-[82%] rounded-2xl rounded-br-md bg-ink-primary text-white px-3.5 py-2 text-[13px] leading-snug">
                    {m.text}
                  </div>
                )}
                {m.role === "assistant" && (
                  <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white/80 border border-border-soft px-3.5 py-2 text-[13px] leading-snug text-ink-primary">
                    <div>{m.text}</div>
                    <div className="mt-1 font-mono text-[9px] tracking-widest uppercase text-ink-muted">
                      {m.opsCount} {m.opsCount === 1 ? "op" : "ops"} applied
                    </div>
                  </div>
                )}
                {m.role === "error" && (
                  <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-rose-50 border border-rose-100 px-3.5 py-2 text-[13px] leading-snug text-rose-900">
                    <div>{m.text}</div>
                    <button
                      type="button"
                      onClick={() => sendIntent(m.retryFor)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-rose-700 hover:text-rose-900 underline-offset-2 hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
            {busy && (
              <motion.div
                key="typing"
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex justify-start"
              >
                <div className="rounded-2xl rounded-bl-md bg-white/80 border border-border-soft px-3.5 py-2.5 text-[13px] leading-snug text-ink-muted flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-pulse [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-pulse [animation-delay:300ms]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Pills (only when chat is empty) */}
      {showPills && (
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles className="h-3.5 w-3.5 text-ink-primary" />
            <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted">
              Try
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {visiblePills.map((c, i) => (
              <motion.button
                key={c}
                type="button"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : i * 0.03, duration: 0.2 }}
                onClick={() => sendIntent(c)}
                disabled={busy}
                className={[
                  "text-left rounded-lg px-3 py-2",
                  "bg-white/60 border border-border-soft",
                  "hover:bg-white/90 hover:border-border-medium",
                  "text-[12px] text-ink-secondary hover:text-ink-primary",
                  "transition-colors leading-snug",
                ].join(" ")}
              >
                {c}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Agent focus: mini previews (cards) or compact summary (row / stages) */}
      {focus ? (
        <div className="px-5 pt-2 pb-2 border-b border-border-soft/60 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted shrink-0">
              Focus
            </span>
            <button
              type="button"
              onClick={onFocusClear}
              disabled={busy}
              className="shrink-0 text-[11px] text-ink-muted hover:text-ink-primary underline-offset-2 hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {focus.type === "blocks" && cardPreviews.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:thin]">
              {cardPreviews.map((p) => {
                const theme = kindTheme(p.rowKind);
                const Icon = theme.Icon;
                return (
                  <div
                    key={p.cellId}
                    className={[
                      "shrink-0 w-[148px] rounded-lg border shadow-card",
                      "flex flex-col p-2 pl-2.5 text-left",
                      theme.tintBg,
                      `border-l-[3px] ${theme.accentBorder}`,
                      "border-border-soft",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className={[
                          "inline-flex h-4 w-4 items-center justify-center rounded",
                          theme.chipBg,
                        ].join(" ")}
                      >
                        <Icon className={`h-2.5 w-2.5 ${theme.chipText}`} />
                      </span>
                    </div>
                    <p className="font-mono text-[8px] leading-tight text-ink-muted uppercase tracking-wide truncate mb-1">
                      {p.rowLabel} · {p.stageLabel}
                    </p>
                    <div className="font-sans text-[11px] leading-snug text-ink-primary line-clamp-4 break-words min-h-[2.75rem]">
                      {p.text ? (
                        renderCellText(p.text, p.rowKind)
                      ) : (
                        <span className="text-ink-muted italic">Empty</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : focus.type === "blocks" ? (
            <p className="text-[11px] text-ink-muted">
              Selected cards are no longer on the map.
            </p>
          ) : focus.type === "row" ? (
            (() => {
              const row = map.rows.find((r) => r.id === focus.id);
              if (!row) {
                return (
                  <p className="text-[11px] text-ink-muted">
                    Row is no longer on the map.
                  </p>
                );
              }
              const theme = kindTheme(row.kind);
              const Icon = theme.Icon;
              return (
                <div
                  className={[
                    "rounded-lg border shadow-card flex items-center gap-2 p-2.5 pl-3",
                    theme.tintBg,
                    `border-l-[3px] ${theme.accentBorder}`,
                    "border-border-soft",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-flex h-6 w-6 items-center justify-center rounded-md",
                      theme.chipBg,
                    ].join(" ")}
                  >
                    <Icon className={`h-3.5 w-3.5 ${theme.chipText}`} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[8px] uppercase tracking-wide text-ink-muted">
                      Row
                    </p>
                    <p className="text-[12px] font-medium text-ink-primary truncate">
                      {row.label || row.id}
                    </p>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {focus.stageIds.map((sid) => {
                const st = map.stages.find((s) => s.id === sid);
                if (!st) return null;
                return (
                  <div
                    key={sid}
                    className="rounded-md border border-border-soft bg-white/70 px-2 py-1 text-[11px] text-ink-primary shadow-sm max-w-[140px] truncate"
                    title={st.label}
                  >
                    {st.label || st.id}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Input */}
      <form onSubmit={onSubmit} className="px-3 pb-3 pt-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            placeholder="Ask the copilot to reshape the journey…"
            className={[
              "w-full resize-none rounded-xl bg-white/70",
              "border border-border-soft hover:border-border-medium",
              "focus:border-ink-primary focus:bg-white",
              "px-3.5 py-2.5 pr-11 text-[13px] leading-snug text-ink-primary placeholder:text-ink-muted",
              "transition-colors outline-none",
              busy ? "opacity-60" : "",
            ].join(" ")}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className={[
              "absolute bottom-2 right-2 inline-flex items-center justify-center",
              "h-7 w-7 rounded-lg transition-colors",
              busy || !draft.trim()
                ? "bg-ink-primary/10 text-ink-muted cursor-not-allowed"
                : "bg-ink-primary text-white hover:bg-[#1b1c20]",
            ].join(" ")}
            aria-label="Send"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
