"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import Link from "next/link";
import type { Board } from "@/lib/canvas/types";

// ──────────────────────────────────────────────────────────────────────────────
// BoardsPanel — compact left-side navigator listing every board in the
// workspace. Clicking a row activates that board; clicking "+" routes back
// to the landing to start a new one. Collapsible to a single chevron.
// ──────────────────────────────────────────────────────────────────────────────

export type BoardsPanelProps = {
  boards: Board[];
  activeBoardId: string | null;
  pendingBoardId: string | null;
  onActivate: (id: string) => void;
};

export function BoardsPanel({
  boards,
  activeBoardId,
  pendingBoardId,
  onActivate,
}: BoardsPanelProps) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div data-floating className="fixed top-5 left-5 z-30">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="glass rounded-full h-8 w-8 grid place-items-center text-ink-muted hover:text-ink-primary transition-colors"
          aria-label="Open boards list"
          title="Open boards list"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-floating
      className="fixed top-5 left-5 z-30 w-[220px] glass rounded-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
          Boards · {boards.length}
        </span>
        <div className="flex items-center gap-0.5">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06] transition-colors"
            aria-label="Create new board"
            title="Create new board"
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06] transition-colors"
            aria-label="Collapse boards list"
            title="Collapse"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto chat-scroll px-1.5 pb-1.5 space-y-0.5">
        {boards.map((b) => {
          const isActive = b.id === activeBoardId;
          const isPending = pendingBoardId === b.id || b.status !== "ready";
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onActivate(b.id)}
              className={[
                "w-full text-left rounded-lg px-2 py-1.5 transition-colors",
                "inline-flex items-center gap-2 min-w-0",
                isActive
                  ? "bg-[rgb(var(--accent))]/[0.10] text-ink-primary ring-1 ring-[rgb(var(--accent))]/30"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/[0.04]",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                  isActive ? "bg-[rgb(var(--accent))]" : "bg-ink-muted/40",
                ].join(" ")}
              />
              <span className="truncate text-[12px] font-medium flex-1 min-w-0" title={b.title}>
                {b.title || "Untitled board"}
              </span>
              {isPending && (
                <Loader2 className="h-3 w-3 text-ink-muted shrink-0 animate-spin" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
