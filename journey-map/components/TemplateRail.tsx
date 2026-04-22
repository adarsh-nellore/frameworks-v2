"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, Search, X } from "lucide-react";
import { FrameworkLibrary } from "@/components/FrameworkLibrary";

// ──────────────────────────────────────────────────────────────────────────────
// TemplateRail — a floating, collapsed-by-default entry point to the
// template library. Default is a small icon chip at top-left. Clicking opens
// a panel with search + framework cards (no "Custom" card — custom framework
// synthesis lives in the Copilot). Outside-click or close button collapses.
//
// Rationale: the canvas belongs to the board and the Copilot. Templates are
// for "add a new board", which is a secondary action — so it lives behind
// one click and doesn't eat permanent real estate.
// ──────────────────────────────────────────────────────────────────────────────

const RAIL_WIDTH = 560;

export type TemplateRailProps = {
  /** id of the framework currently active on the selected board, or null. */
  activeFrameworkId: string | null;
  /** Add a new board from the given template framework id. */
  onPickTemplate: (frameworkId: string) => void;
};

export function TemplateRail({
  activeFrameworkId,
  onPickTemplate,
}: TemplateRailProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Always-visible "← Workspace" chip. Sits independently from the
          templates icon so the user can always escape back to the landing
          without first opening the library. */}
      <div data-floating className="fixed top-3 left-4 z-40">
        <Link
          href="/"
          className="glass-strong rounded-full h-8 px-2.5 inline-flex items-center gap-1.5 text-ink-muted hover:text-ink-primary transition-colors"
          title="Back to workspace"
          aria-label="Back to workspace"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Collapsed icon — directly below the workspace chip */}
      {!open && (
        <div data-floating className="fixed top-14 left-4 z-40">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="glass-strong rounded-full h-8 w-8 grid place-items-center text-ink-muted hover:text-ink-primary transition-colors"
            title="Add a template (T)"
            aria-label="Open template library"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Expanded panel — floating, same top-left anchor as the icon */}
      {open && (
        <div
          ref={rootRef}
          data-floating
          className="fixed top-14 left-4 z-40 glass-strong rounded-2xl overflow-hidden flex flex-col"
          style={{ width: RAIL_WIDTH, maxHeight: "calc(100vh - 80px)" }}
          role="dialog"
          aria-label="Template library"
        >
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                className="w-full rounded-lg bg-white/70 border border-border-soft focus:border-ink-primary focus:bg-white pl-8 pr-3 py-1.5 text-[12.5px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 w-7 grid place-items-center rounded-md text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]"
              aria-label="Close"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto chat-scroll px-3 pb-3">
            <FrameworkLibrary
              variant="cards"
              hideCustomCard
              hideHeader
              searchQuery={query}
              selectedId={activeFrameworkId}
              onSelect={(id) => {
                if (!id) return;
                onPickTemplate(id);
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export const TEMPLATE_RAIL_WIDTH = RAIL_WIDTH;
