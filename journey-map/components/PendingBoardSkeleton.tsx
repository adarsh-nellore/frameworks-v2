"use client";

import { Sparkles } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// PendingBoardSkeleton — shown on /canvas while /api/framework-describe is
// still synthesizing. The user sees this the instant they submit a prompt
// from the landing, so the board's title and original prompt are prominent,
// backed by a grid of animated placeholder cards.
// ──────────────────────────────────────────────────────────────────────────────

export type PendingBoardSkeletonProps = {
  title: string;
  prompt?: string;
  statusLabel: string;
};

export function PendingBoardSkeleton({ title, prompt, statusLabel }: PendingBoardSkeletonProps) {
  return (
    <div
      data-map-page
      className={[
        "inline-block rounded-3xl bg-surface",
        "px-10 py-10 md:px-12 md:py-12",
        "shadow-panel ring-1 ring-border-soft/70",
      ].join(" ")}
    >
      <div className="w-[820px] max-w-[80vw] space-y-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-primary/[0.06] text-ink-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-medium text-ink-primary truncate">{title}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mt-0.5 inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-ink-primary/60 animate-pulse [animation-delay:0ms]" />
                <span className="h-1 w-1 rounded-full bg-ink-primary/60 animate-pulse [animation-delay:150ms]" />
                <span className="h-1 w-1 rounded-full bg-ink-primary/60 animate-pulse [animation-delay:300ms]" />
              </span>
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>

        {prompt && (
          <div className="rounded-xl bg-white/60 border border-border-soft px-4 py-3 text-[13px] text-ink-secondary leading-relaxed italic">
            &ldquo;{prompt}&rdquo;
          </div>
        )}

        {/* Skeleton grid — 3 rows × 4 cols of pulsing blocks. Pure visual cue
            for "we're building your structure right now." */}
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={[
                "h-20 rounded-lg",
                "bg-gradient-to-br from-ink-primary/[0.04] to-ink-primary/[0.02]",
                "animate-pulse",
              ].join(" ")}
              style={{ animationDelay: `${(i % 4) * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
