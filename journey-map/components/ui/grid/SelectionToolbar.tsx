"use client";

import { Trash2, X } from "lucide-react";

type Props = {
  count: number;
  agentBusy: boolean;
  onDelete: () => void;
  onClear: () => void;
};

/**
 * Floating action bar that appears when N>=2 cards are selected.
 * Lets users do batch operations on the selection (delete; clear selection).
 * Single-card actions are still available inline on each card.
 */
export function SelectionToolbar({ count, agentBusy, onDelete, onClear }: Props) {
  if (count < 1) return null;
  return (
    <div
      data-floating
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 glass-strong rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-2 shadow-panel animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-secondary shrink-0">
        {count.toString().padStart(2, "0")} selected
      </span>
      <span className="h-4 w-px bg-border-medium/60 shrink-0" />
      <button
        type="button"
        disabled={agentBusy}
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Delete selected cards"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center justify-center h-7 w-7 rounded-full text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.08] transition-colors"
        title="Clear selection"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
