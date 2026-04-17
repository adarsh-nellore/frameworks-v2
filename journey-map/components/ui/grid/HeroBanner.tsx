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
      className="mb-8 px-1"
    >
      <h1 className="text-[26px] md:text-[30px] font-semibold tracking-tight text-ink-primary leading-tight">
        {title}
      </h1>
      <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted">
        <span>{config.label}</span>
        {dateLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span>{dateLabel}</span>
          </>
        )}
      </div>
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
