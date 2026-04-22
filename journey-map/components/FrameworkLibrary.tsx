"use client";

import { useMemo, useState, useEffect } from "react";
import { Sparkles, LayoutGrid, Grid3x3, Columns3, Trash2, StickyNote } from "lucide-react";
import {
  listFrameworks,
  isDynamicFramework,
  unregisterDynamicFramework,
} from "@/lib/frameworks";
import { deleteCustomFramework, loadCustomFrameworks } from "@/lib/frameworks/custom/registry";
import { registerDynamicFramework } from "@/lib/frameworks";
import type { AnyFrameworkModule } from "@/lib/frameworks";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import { FrameworkThumbnail } from "@/components/FrameworkThumbnail";

// ──────────────────────────────────────────────────────────────────────────────
// FrameworkLibrary — browsable framework picker.
//
// Rendered in two places with the same component:
//  - Landing (right-side rail, always visible)
//  - Canvas (collapsible side panel, toggle from topbar)
//
// Interaction:
//  - Click a framework → set selectedId
//  - Click the "Custom" card at top → clear selection (use open-prompt / synthesis)
//  - Custom (user-generated) frameworks show a delete affordance on hover
// ──────────────────────────────────────────────────────────────────────────────

export type FrameworkLibraryProps = {
  /** Currently selected framework id; null/undefined = custom/no-framework mode. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Compact rendering for cramped panels. Default false. */
  compact?: boolean;
  /** Hide the "Custom" card at the top (used when caller expresses custom elsewhere). */
  hideCustomCard?: boolean;
  /** Hide the top "Framework library" eyebrow + Clear row. Useful when the
   *  caller already labels the surface (e.g. the left rail's own header). */
  hideHeader?: boolean;
  /** Case-insensitive filter applied to framework label + short description.
   *  Empty or undefined = no filter. */
  searchQuery?: string;
  /** Visual variant:
   *   "compact" — horizontal row cards with the lucide layout icon (default).
   *   "cards"   — 2-column grid of bigger cards with full-width SVG thumbnails. */
  variant?: "compact" | "cards";
};

function layoutIcon(layout: "grid" | "kanban" | "matrix" | "freeform") {
  if (layout === "kanban") return Columns3;
  if (layout === "matrix") return Grid3x3;
  if (layout === "freeform") return StickyNote;
  return LayoutGrid;
}

function shortDescription(fw: AnyFrameworkModule): string {
  // Best-effort one-liner pulled from chatSubtitle or structuringPrompt.
  const s = fw.config.chatSubtitle;
  if (s) return s;
  const p = fw.config.structuringPrompt ?? "";
  const firstSentence = p.split(/[.\n]/)[0].trim();
  if (firstSentence && firstSentence.length < 110) return firstSentence;
  return `${fw.config.colNoun} × ${fw.config.rowNoun}`;
}

export function FrameworkLibrary({
  selectedId,
  onSelect,
  compact = false,
  hideCustomCard = false,
  hideHeader = false,
  searchQuery,
  variant = "compact",
}: FrameworkLibraryProps) {
  const [frameworks, setFrameworks] = useState<AnyFrameworkModule[]>([]);

  // Re-read the registry on mount + whenever a delete happens. listFrameworks
  // returns a static snapshot, so we keep local state in sync manually.
  useEffect(() => {
    const customs = loadCustomFrameworks();
    for (const cfg of customs) {
      if (!isDynamicFramework(cfg.id)) registerDynamicFramework(cfg);
    }
    setFrameworks(listFrameworks());
  }, []);

  function handleDeleteCustom(cfg: FrameworkConfig) {
    if (!isDynamicFramework(cfg.id)) return;
    unregisterDynamicFramework(cfg.id);
    deleteCustomFramework(cfg.id);
    setFrameworks(listFrameworks());
    if (selectedId === cfg.id) onSelect(null);
  }

  const grouped = useMemo(() => {
    const q = searchQuery?.trim().toLowerCase() ?? "";
    const matches = (fw: AnyFrameworkModule) => {
      if (!q) return true;
      if (fw.label.toLowerCase().includes(q)) return true;
      const desc = shortDescription(fw).toLowerCase();
      return desc.includes(q);
    };
    const built = frameworks.filter((fw) => !isDynamicFramework(fw.id) && matches(fw));
    const custom = frameworks.filter((fw) => isDynamicFramework(fw.id) && matches(fw));
    return { built, custom };
  }, [frameworks, searchQuery]);

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2">
          <span className={[
            "font-mono uppercase text-ink-muted",
            compact ? "text-[9px] tracking-[0.22em]" : "text-[10px] tracking-[0.24em]",
          ].join(" ")}>
            Framework library
          </span>
          {selectedId && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[11px] text-ink-muted hover:text-ink-primary underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {!hideCustomCard && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={[
            "w-full text-left rounded-xl transition-colors",
            "border",
            compact ? "p-2.5" : "p-3",
            selectedId === null
              ? "bg-ink-primary/[0.04] border-ink-primary/40 ring-1 ring-ink-primary/20"
              : "bg-white/70 border-border-soft hover:border-border-medium hover:bg-white",
          ].join(" ")}
        >
          <div className="flex items-start gap-2.5">
            <div className={[
              "shrink-0 inline-flex items-center justify-center rounded-lg",
              compact ? "h-7 w-7" : "h-8 w-8",
              "bg-ink-primary/[0.06] text-ink-primary",
            ].join(" ")}>
              <Sparkles className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={["font-medium text-ink-primary", compact ? "text-[12px]" : "text-[13px]"].join(" ")}>
                Custom (default)
              </div>
              <div className={["text-ink-muted leading-snug mt-0.5", compact ? "text-[10px]" : "text-[11px]"].join(" ")}>
                Describe what you want — we'll design the structure.
              </div>
            </div>
          </div>
        </button>
      )}

      {grouped.built.length > 0 && (
        <div className={variant === "cards" ? "space-y-2.5" : "space-y-1.5"}>
          <div className={[
            "font-mono uppercase text-ink-muted px-1",
            compact ? "text-[8px] tracking-[0.2em]" : "text-[9px] tracking-[0.22em]",
          ].join(" ")}>
            Built-in
          </div>
          {variant === "cards" ? (
            <div className="grid grid-cols-2 gap-3">
              {grouped.built.map((fw) => (
                <ThumbnailCard
                  key={fw.id}
                  fw={fw}
                  selected={selectedId === fw.id}
                  onSelect={() => onSelect(fw.id)}
                />
              ))}
            </div>
          ) : (
            grouped.built.map((fw) => (
              <FrameworkCard
                key={fw.id}
                fw={fw}
                selected={selectedId === fw.id}
                compact={compact}
                onSelect={() => onSelect(fw.id)}
              />
            ))
          )}
        </div>
      )}

      {grouped.custom.length > 0 && (
        <div className={variant === "cards" ? "space-y-2.5" : "space-y-1.5"}>
          <div className={[
            "font-mono uppercase text-ink-muted px-1",
            compact ? "text-[8px] tracking-[0.2em]" : "text-[9px] tracking-[0.22em]",
          ].join(" ")}>
            Your custom frameworks
          </div>
          {variant === "cards" ? (
            <div className="grid grid-cols-2 gap-3">
              {grouped.custom.map((fw) => (
                <ThumbnailCard
                  key={fw.id}
                  fw={fw}
                  selected={selectedId === fw.id}
                  onSelect={() => onSelect(fw.id)}
                  onDelete={() => handleDeleteCustom(fw.config)}
                />
              ))}
            </div>
          ) : (
            grouped.custom.map((fw) => (
              <FrameworkCard
                key={fw.id}
                fw={fw}
                selected={selectedId === fw.id}
                compact={compact}
                onSelect={() => onSelect(fw.id)}
                onDelete={() => handleDeleteCustom(fw.config)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ThumbnailCard({
  fw,
  selected,
  onSelect,
  onDelete,
}: {
  fw: AnyFrameworkModule;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={[
        "group relative rounded-xl transition-colors overflow-hidden",
        "border",
        selected
          ? "bg-ink-primary/[0.04] border-ink-primary/40 ring-1 ring-ink-primary/20"
          : "bg-white/70 border-border-soft hover:border-border-medium hover:bg-white",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left"
      >
        <div className="aspect-[3/2] w-full overflow-hidden bg-[var(--bg-surface,rgba(255,255,255,0.4))]">
          <FrameworkThumbnail id={fw.id} config={fw.config} seed={fw.seed} />
        </div>
        <div className="px-3 py-2.5">
          <div className="font-medium text-ink-primary text-[12.5px] truncate">
            {fw.label}
          </div>
          <div className="text-ink-muted leading-snug mt-0.5 text-[10.5px] line-clamp-2">
            {shortDescription(fw)}
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={[
            "absolute top-2 right-2 rounded-md w-6 h-6 grid place-items-center",
            "text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors",
            "opacity-0 group-hover:opacity-100 focus:opacity-100",
            "bg-white/80 backdrop-blur-sm",
          ].join(" ")}
          title="Delete custom framework"
          aria-label={`Delete ${fw.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function FrameworkCard({
  fw,
  selected,
  compact,
  onSelect,
  onDelete,
}: {
  fw: AnyFrameworkModule;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const Icon = layoutIcon(fw.config.layout);
  return (
    <div
      className={[
        "group relative rounded-xl transition-colors",
        "border",
        compact ? "" : "",
        selected
          ? "bg-ink-primary/[0.04] border-ink-primary/40 ring-1 ring-ink-primary/20"
          : "bg-white/70 border-border-soft hover:border-border-medium hover:bg-white",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className={["w-full text-left", compact ? "p-2.5" : "p-3"].join(" ")}
      >
        <div className="flex items-start gap-2.5">
          <div className={[
            "shrink-0 inline-flex items-center justify-center rounded-lg",
            compact ? "h-7 w-7" : "h-8 w-8",
            "bg-ink-primary/[0.06] text-ink-primary",
          ].join(" ")}>
            <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <div className={["font-medium text-ink-primary truncate", compact ? "text-[12px]" : "text-[13px]"].join(" ")}>
              {fw.label}
            </div>
            <div className={["text-ink-muted leading-snug mt-0.5 line-clamp-2", compact ? "text-[10px]" : "text-[11px]"].join(" ")}>
              {shortDescription(fw)}
            </div>
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={[
            "absolute top-2 right-2 rounded-md w-6 h-6 grid place-items-center",
            "text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors",
            "opacity-0 group-hover:opacity-100 focus:opacity-100",
          ].join(" ")}
          title="Delete custom framework"
          aria-label={`Delete ${fw.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
