"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { kindTheme } from "@/lib/row-kind-theme";
import { GeneratePanel } from "@/components/GeneratePanel";
import { FrameworkLibrary } from "@/components/FrameworkLibrary";
import { CopilotEmptyState } from "@/components/CopilotEmptyState";
import type { GenerateEvent } from "@/lib/pipeline/events";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { AttachmentMeta } from "@/lib/canvas/types";

// ──────────────────────────────────────────────────────────────────────────────
// Copilot — single surface that unifies chat + framework library + generation.
//
// Design: everything lives in one panel. The composer is always present. A
// persistent "+" button in the composer opens a popover with the Framework
// Library and a "Generate from source" card. Clicking a framework attaches it
// (swap the active board's framework, or create a new board if none is
// active). Clicking "Generate from source" swaps the body for the embedded
// GeneratePanel until it completes or is cancelled.
//
// When `disabled` (no active framework on a board), the chat body is replaced
// by an empty-state that surfaces the library + generate options directly —
// so users can see the Copilot and know how to start.
// ──────────────────────────────────────────────────────────────────────────────

type Props = {
  /** Null when no framework is active on any board — puts the panel in its
   *  empty/disabled state. */
  frameworkId: string | null;
  /** Human-readable label. "No framework" when disabled. */
  frameworkLabel: string;
  frameworkOptions: { id: string; label: string }[];
  /** Swap the active board's framework. Not called when disabled (no board). */
  onFrameworkChange: (frameworkId: string) => void;
  /** Add a new board from a template framework. Used when clicking a library
   *  framework with no active board, or when the user explicitly uses the "+"
   *  popover to add rather than swap. */
  onAddFromLibrary?: (frameworkId: string) => void;
  /** Open the custom framework dialog (synthesize a new framework from prompt).
   *  Triggered by clicking "Custom (default)" in the library. */
  onOpenCustomDialog?: () => void;
  /** Optional one-line subtitle (e.g. "Editing functional, emotional, and social jobs"). */
  frameworkSubtitle?: string;
  /** Optional textarea placeholder reflecting the active framework. */
  chatPlaceholder?: string;
  /** Active framework config — used to read colNoun/rowNoun for focus previews. */
  frameworkConfig?: FrameworkConfig;
  /** Set when the active framework is a user-generated custom (not in the static
   *  server-side registry). Forwarded in the /api/arrange body so the server
   *  can resolve the framework via the supplied config. */
  customConfig?: FrameworkConfig;
  map: UniversalMap | null;
  onMapChange: (next: UniversalMap) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyOps: (map: any, ops: any[]) => { ok: true; map: any } | { ok: false; reason: string; failedAtIndex?: number };
  exampleInstructions: string[];
  onBusyChange?: (busy: boolean) => void;
  /** Current canvas selection sent as agent focus (optional on the wire). */
  focus: unknown;
  onFocusClear: () => void;
  /** Bubble generation progress events up to the page so it can render the overlay. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onGenerationProgress?: (event: GenerateEvent<any> | null) => void;
  /** Receive a cancel function whenever generation is in flight. */
  registerGenerationCancel?: (cancel: (() => void) | null) => void;
  /** Persistent attachments on the active board, shown in generate mode. */
  boardAttachments?: AttachmentMeta[];
  /** Persist a dropped file as a board attachment (IDB + meta on Board). */
  onAttachFile?: (file: File) => Promise<void>;
  /** Remove a persisted attachment. */
  onRemoveAttachment?: (attachmentId: string) => Promise<void>;
  /** Rehydrate persisted attachments as File[] for a generate submit. */
  loadPersistedFiles?: () => Promise<File[]>;
  /** True when no active framework is attached (no board or no framework).
   *  Greys out the input + chat; surfaces library/generate as the body. */
  disabled?: boolean;
};

type ChatMsg =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      opsCount: number;
      generated?: boolean;
    }
  | { id: string; role: "error"; text: string; retryFor: string };

let msgCounter = 0;
const nextId = () => `m${++msgCounter}`;

type CardPreview = {
  cardId: string;
  text: string;
  themeKind: string;
  rowLabel: string;
  colLabel: string;
};

function cardFocusPreviews(
  map: UniversalMap,
  ids: string[]
): CardPreview[] {
  const out: CardPreview[] = [];
  for (const id of ids) {
    const card = map.cards.find((c) => c.id === id);
    if (!card) continue;
    const col = map.cols.find((c) => c.id === card.colId);
    const row = map.rows.find((r) => r.id === card.rowId);
    if (!col || !row) continue;
    out.push({
      cardId: card.id,
      text: card.text,
      themeKind: row.kind ?? col.kind ?? "neutral",
      rowLabel: row.label || row.id,
      colLabel: col.label || col.id,
    });
  }
  return out;
}

function previewSnippet(text: string, maxWords = 6): string {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "Empty";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function Copilot({
  frameworkId,
  frameworkLabel,
  frameworkOptions,
  onFrameworkChange,
  onAddFromLibrary,
  onOpenCustomDialog,
  frameworkSubtitle,
  chatPlaceholder,
  frameworkConfig,
  customConfig,
  map,
  onMapChange,
  applyOps,
  exampleInstructions,
  onBusyChange,
  focus,
  onFocusClear,
  onGenerationProgress,
  registerGenerationCancel,
  boardAttachments,
  onAttachFile,
  onRemoveAttachment,
  loadPersistedFiles,
  disabled = false,
}: Props) {
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [minimized, setMinimized] = useState(false);
  // Sub-surfaces. "chat" is the default; "generate" swaps the body for the
  // embedded GeneratePanel; the library popover is a separate floating layer
  // so it can sit above everything without re-layout.
  const [subPanel, setSubPanel] = useState<"chat" | "generate">("chat");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const popoverRootRef = useRef<HTMLDivElement | null>(null);

  function setBusyBoth(v: boolean) {
    setBusy(v);
    onBusyChange?.(v);
  }

  function openGenerate() {
    if (busy || disabled) return;
    setMinimized(false);
    setLibraryOpen(false);
    setSubPanel("generate");
  }

  function closeGenerate() {
    if (busy) return;
    setSubPanel("chat");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleGenerateSuccess(nextMap: any, summary: string) {
    onMapChange(nextMap);
    setBusyBoth(false);
    onGenerationProgress?.(null);
    setSubPanel("chat");
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: "assistant",
        text: summary,
        opsCount: 0,
        generated: true,
      },
    ]);
  }

  // Close library popover on outside pointerdown.
  useEffect(() => {
    if (!libraryOpen) return;
    function onDown(e: MouseEvent) {
      if (!popoverRootRef.current?.contains(e.target as Node)) {
        setLibraryOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [libraryOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // When the panel transitions into disabled state (board removed / unselected),
  // snap back to chat view so the empty state — not a stale generate form —
  // greets the user next time a board becomes active.
  useEffect(() => {
    if (disabled && subPanel === "generate" && !busy) {
      setSubPanel("chat");
    }
  }, [disabled, subPanel, busy]);

  async function sendIntent(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || disabled || !frameworkId || !map) return;
    setBusyBoth(true);
    setMinimized(false);
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
          ...(customConfig ? { customConfig } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Arrange failed (HTTP ${res.status})`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops = data.ops as any[];
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

  function handleLibrarySelect(id: string | null) {
    if (id === null) {
      onOpenCustomDialog?.();
      setLibraryOpen(false);
      return;
    }
    // Swap the active board's framework if one is live, otherwise add a new
    // board from this template — the composer has no context to edit without
    // a board, so the sensible default is to create one.
    if (disabled) {
      onAddFromLibrary?.(id);
    } else {
      onFrameworkChange(id);
    }
    setLibraryOpen(false);
  }

  const visiblePills = exampleInstructions.slice(0, 4);
  const showPills = messages.length === 0;

  const focusAny = focus as
    | { type: "cards"; ids: string[] }
    | { type: "col"; id: string }
    | { type: "row"; id: string }
    | null
    | undefined;

  const cardPreviews = useMemo(() => {
    if (!focusAny || focusAny.type !== "cards" || !map) return [];
    return cardFocusPreviews(map, focusAny.ids);
  }, [map, focusAny]);

  const colNoun = frameworkConfig?.colNoun ?? "Column";
  const rowNoun = frameworkConfig?.rowNoun ?? "Row";

  if (minimized) {
    return (
      <div
        data-floating
        data-copilot
        className="fixed top-20 right-4 z-30"
      >
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="glass-strong rounded-full px-3.5 py-2 inline-flex items-center gap-2 text-[12px] text-ink-secondary hover:text-ink-primary transition-colors"
          aria-label="Expand AI copilot"
          title="Expand AI copilot"
        >
          <Sparkles className="h-3.5 w-3.5 text-ink-primary" />
          <span className="font-medium">AI Copilot</span>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const showGenerate = subPanel === "generate" && !disabled && !!frameworkId;
  const showEmptyState = disabled && subPanel === "chat";

  return (
    <div
      data-floating
      data-copilot
      className={[
        "fixed top-20 right-4 bottom-5 z-30",
        "w-[420px] max-w-[calc(100vw-2rem)]",
        "glass-strong rounded-2xl flex flex-col overflow-hidden",
        disabled ? "opacity-85" : "",
      ].join(" ")}
    >
      {/* Header — framework chip + minimize. No tabs. */}
      <div className="flex items-center px-4 pt-3 pb-2 gap-2 border-b border-border-soft/50">
        <Sparkles
          className={[
            "h-3.5 w-3.5 shrink-0",
            disabled ? "text-ink-muted" : "text-ink-primary",
          ].join(" ")}
        />
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-muted shrink-0">
          AI Copilot
        </span>
        <div className="ml-auto flex items-center gap-1.5 min-w-0">
          <span
            className={[
              "h-1.5 w-1.5 rounded-full shrink-0",
              disabled ? "bg-ink-muted/50" : "bg-emerald-500",
            ].join(" ")}
            aria-hidden
          />
          <span
            className="text-[11px] font-medium text-ink-primary truncate"
            title={frameworkSubtitle ?? frameworkLabel}
          >
            {disabled ? "No framework" : frameworkLabel}
          </span>
        </div>
      </div>

      {/* Body — generate sub-panel, empty state, or chat. */}
      {showGenerate ? (
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border-soft/40">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-muted">
              Generate from source
            </span>
            <button
              type="button"
              onClick={closeGenerate}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-primary transition-colors disabled:opacity-40"
              aria-label="Close generate"
            >
              <X className="h-3 w-3" />
              Back to chat
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <GeneratePanel
              frameworkId={frameworkId!}
              frameworkLabel={frameworkLabel}
              frameworkOptions={frameworkOptions}
              onFrameworkChange={onFrameworkChange}
              onSuccess={handleGenerateSuccess}
              onBusyChange={setBusyBoth}
              onProgress={onGenerationProgress}
              registerCancel={registerGenerationCancel}
              boardAttachments={boardAttachments}
              onAttachFile={onAttachFile}
              onRemoveAttachment={onRemoveAttachment}
              loadPersistedFiles={loadPersistedFiles}
            />
          </div>
        </div>
      ) : showEmptyState ? (
        <CopilotEmptyState onOpenCustomDialog={onOpenCustomDialog} />
      ) : (
        // Chat body
        <>
          {(messages.length > 0 || busy) && (
            <div
              ref={scrollRef}
              className="order-1 chat-scroll flex-1 overflow-y-auto px-5 pt-4 pb-3 space-y-3 min-h-0"
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
                          {m.generated
                            ? "Generated from sources"
                            : `${m.opsCount} ${m.opsCount === 1 ? "op" : "ops"} applied`}
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

          {/* Starter pills (only when chat is empty and we have a framework) */}
          {showPills && !disabled && (
            <div className="order-3 mt-auto px-5 pt-4 pb-2">
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

          {/* Agent focus previews */}
          {focusAny && map ? (
            <div className="order-2 px-5 pt-2 pb-2 border-b border-border-soft/60 space-y-2">
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

              {focusAny.type === "cards" && cardPreviews.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:thin]">
                  {cardPreviews.map((p) => {
                    const theme = kindTheme(p.themeKind);
                    return (
                      <span
                        key={p.cardId}
                        className={[
                          "shrink-0 max-w-[200px] rounded-full border",
                          "px-2.5 py-1 text-[10px] leading-none",
                          "font-medium text-ink-primary truncate",
                          theme.tintBg,
                          `border-l-2 ${theme.accentBorder}`,
                          "border-border-soft",
                        ].join(" ")}
                        title={`${p.colLabel} · ${p.rowLabel}\n${p.text || "Empty"}`}
                      >
                        {previewSnippet(p.text)}
                      </span>
                    );
                  })}
                </div>
              ) : focusAny.type === "cards" ? (
                <p className="text-[11px] text-ink-muted">
                  Selected cards are no longer on the map.
                </p>
              ) : focusAny.type === "row" ? (
                (() => {
                  const row = map.rows.find((r) => r.id === focusAny.id);
                  if (!row) {
                    return (
                      <p className="text-[11px] text-ink-muted">
                        {rowNoun} is no longer on the map.
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
                          {rowNoun}
                        </p>
                        <p className="text-[12px] font-medium text-ink-primary truncate">
                          {row.label || row.id}
                        </p>
                      </div>
                    </div>
                  );
                })()
              ) : focusAny.type === "col" ? (
                (() => {
                  const col = map.cols.find((c) => c.id === focusAny.id);
                  if (!col) {
                    return (
                      <p className="text-[11px] text-ink-muted">
                        {colNoun} is no longer on the map.
                      </p>
                    );
                  }
                  const theme = kindTheme(col.kind);
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
                          {colNoun}
                        </p>
                        <p className="text-[12px] font-medium text-ink-primary truncate">
                          {col.label || col.id}
                        </p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-[11px] text-ink-muted">Selection active.</p>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Composer — always rendered. "+" popover is the single entry point to
          both the library and generation surfaces. */}
      <form
        onSubmit={onSubmit}
        className={[
          showGenerate ? "hidden" : "",
          "order-4 px-3 pb-2 pt-2 relative",
        ].join(" ")}
      >
        <div ref={popoverRootRef} className="relative">
          <textarea
            ref={textareaRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy || disabled}
            placeholder={
              disabled
                ? "Pick a framework above to start chatting…"
                : chatPlaceholder ??
                  `Ask the copilot to refine your ${frameworkLabel.toLowerCase()}…`
            }
            className={[
              "w-full resize-none rounded-xl bg-white/70",
              "border border-border-soft hover:border-border-medium",
              "focus:border-ink-primary focus:bg-white",
              "px-3.5 py-2.5 pl-11 pr-11 text-[13px] leading-snug text-ink-primary placeholder:text-ink-muted",
              "transition-colors outline-none",
              busy || disabled ? "opacity-60" : "",
            ].join(" ")}
          />
          {/* "+" popover trigger — always accessible, even when disabled */}
          <button
            type="button"
            onClick={() => setLibraryOpen((o) => !o)}
            disabled={busy}
            className={[
              "absolute top-2 left-2 inline-flex items-center justify-center",
              "h-7 w-7 rounded-lg transition-colors",
              libraryOpen
                ? "bg-ink-primary/10 text-ink-primary"
                : "text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]",
              busy ? "opacity-40 cursor-not-allowed" : "",
            ].join(" ")}
            title="Pick or generate a framework"
            aria-label="Pick or generate a framework"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={busy || disabled || !draft.trim()}
            className={[
              "absolute bottom-2 right-2 inline-flex items-center justify-center",
              "h-7 w-7 rounded-lg transition-colors",
              busy || disabled || !draft.trim()
                ? "bg-ink-primary/10 text-ink-muted cursor-not-allowed"
                : "bg-ink-primary text-white hover:bg-[#1b1c20]",
            ].join(" ")}
            aria-label="Send"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>

          {/* Library popover */}
          {libraryOpen && (
            <div
              className={[
                "absolute bottom-full left-0 mb-2 z-30",
                "w-[360px] max-w-[calc(100vw-3rem)] max-h-[60vh] overflow-y-auto chat-scroll",
                "rounded-2xl bg-white/95 backdrop-blur-md shadow-panel ring-1 ring-border-soft p-3",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => {
                  setLibraryOpen(false);
                  openGenerate();
                }}
                disabled={disabled}
                className={[
                  "w-full mb-3 rounded-xl border border-border-soft bg-white/80 hover:border-border-medium hover:bg-white p-2.5 text-left transition-colors",
                  disabled ? "opacity-40 cursor-not-allowed" : "",
                ].join(" ")}
                title={
                  disabled
                    ? "Pick a framework first to generate from source"
                    : "Generate from a file, URL, or text"
                }
              >
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 inline-flex items-center justify-center rounded-lg h-7 w-7 bg-ink-primary/[0.06] text-ink-primary">
                    <Upload className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink-primary text-[12px]">
                      Generate from source
                    </div>
                    <div className="text-ink-muted leading-snug mt-0.5 text-[10px]">
                      Upload or paste content to populate this board.
                    </div>
                  </div>
                </div>
              </button>
              <FrameworkLibrary
                compact
                selectedId={frameworkId}
                onSelect={handleLibrarySelect}
              />
            </div>
          )}
        </div>
      </form>

      {!showGenerate && (
        <div className="order-5 px-3 pb-3">
          <div className="border-t border-border-soft/50 pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-primary transition-colors"
              aria-label="Minimize AI copilot"
              title="Minimize AI copilot"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Minimize
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
