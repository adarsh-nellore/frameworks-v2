"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (config: FrameworkConfig, populatedMap: UniversalMap) => void;
  /** Ids already in use (static + custom). Passed to the server so it can auto-suffix. */
  existingIds: string[];
};

type Phase = "idle" | "synthesizing" | "done";

// ──────────────────────────────────────────────────────────────────────────────
// CustomFrameworkDialog
//
// Minimal modal that takes a short natural-language description and calls
// /api/framework-describe. The server handles both steps (synthesize + populate)
// and returns a populated map in one response, so we only track one "working"
// phase here. Warnings from the server are surfaced inline.
// ──────────────────────────────────────────────────────────────────────────────

export function CustomFrameworkDialog({ open, onClose, onSuccess, existingIds }: Props) {
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state every time the dialog opens; focus the textarea.
  useEffect(() => {
    if (!open) return;
    setDraft("");
    setPhase("idle");
    setError(null);
    setWarnings([]);
    const id = requestAnimationFrame(() => taRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Esc closes when idle.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase === "idle") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, onClose]);

  if (!open) return null;

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed || phase !== "idle") return;
    setPhase("synthesizing");
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/framework-describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: trimmed, existingIds }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `Generation failed (HTTP ${res.status})`);
      }
      if (Array.isArray(data.warnings)) setWarnings(data.warnings);
      setPhase("done");
      onSuccess(data.config as FrameworkConfig, data.populatedMap as UniversalMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("idle");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const busy = phase === "synthesizing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={() => {
        if (phase === "idle") onClose();
      }}
    >
      <div
        className="relative w-[min(560px,calc(100vw-2rem))] rounded-2xl bg-white shadow-panel ring-1 ring-border-soft p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute top-3 right-3 rounded-md w-7 h-7 grid place-items-center text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06] disabled:opacity-40"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-ink-primary" />
          <h2 className="text-[15px] font-medium text-ink-primary">Describe a custom framework</h2>
        </div>
        <p className="text-[12px] text-ink-muted leading-snug">
          Say what you want in one or two sentences. The agent will generate the structure, populate it with example content, and add it to your switcher.
        </p>

        <textarea
          ref={taRef}
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          placeholder={
            "e.g. 'A 2×2 matrix for prioritizing features by impact and effort' · 'A stakeholder map by influence and interest' · 'A card sort exercise for research findings'"
          }
          className="mt-4 w-full resize-none rounded-xl bg-white border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-3.5 py-2.5 text-[13px] leading-snug text-ink-primary placeholder:text-ink-muted transition-colors outline-none disabled:opacity-60"
        />

        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-[12px] text-rose-900">
            {error}
          </div>
        )}

        {warnings.length > 0 && !error && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-900 space-y-1">
            {warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-muted">
            {busy
              ? "Generating structure and populating…"
              : "⌘↵ / Ctrl↵ to submit"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-[12px] text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.05] disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || draft.trim().length < 3}
              className="rounded-lg px-4 py-1.5 text-[12px] font-medium bg-ink-primary text-white hover:bg-[#1b1c20] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
            >
              {busy ? (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse [animation-delay:300ms]" />
                </span>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
