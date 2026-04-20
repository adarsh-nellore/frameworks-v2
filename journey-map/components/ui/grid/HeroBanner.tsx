"use client";

import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

type Props = {
  map: UniversalMap;
  config: FrameworkConfig;
  createdAt?: number;
};

/**
 * Top-of-canvas title plate — just the map's title and a muted byline
 * (framework name · creation date). Any structured metadata (persona,
 * axis labels, core job statement, etc.) remains in map.meta for AI /
 * export use but is no longer rendered as editable chrome here.
 */
export function HeroBanner({ map, config, createdAt }: Props) {
  const title = (map.title || config.label).trim();
  const dateLabel = formatDate(createdAt);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mb-10 px-1 border-b border-border-soft pb-5"
    >
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[rgb(var(--accent))]/80 mb-2">
        <span className="inline-block h-[3px] w-6 rounded-full bg-[rgb(var(--accent))]/70" />
        <span>{config.label}</span>
        {dateLabel && (
          <>
            <span aria-hidden="true" className="text-ink-muted">·</span>
            <span className="text-ink-muted">{dateLabel}</span>
          </>
        )}
      </div>
      <h1 className="text-[32px] md:text-[36px] font-semibold tracking-[-0.02em] text-ink-primary leading-[1.05]">
        {title}
      </h1>
    </div>
  );
}

function formatDate(ts?: number): string | null {
  if (!ts || !Number.isFinite(ts)) return null;
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}
