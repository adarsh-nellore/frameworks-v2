"use client";

import { MoreHorizontal, Trash2, Copy, GripHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/canvas/types";
import type { AnyFrameworkModule } from "@/lib/frameworks";
import type { UniversalMap, UniversalSelection } from "@/lib/frameworks/universal/types";
import { PendingBoardSkeleton } from "@/components/PendingBoardSkeleton";
import { useZoom } from "@/lib/zoom-context";

// ──────────────────────────────────────────────────────────────────────────────
// BoardFrame — positioned wrapper around one Board on the canvas.
//
// Sits inside the Canvas.tsx transformed stage at (x, y) in canvas coordinates.
// Handles click-to-activate, the title header, and a small menu. The actual
// framework rendering is delegated to the framework module's Component.
//
// Currently rendered at (x, y) in inline-block flow so multiple boards reading
// the same canvas can sit side-by-side. Drag-to-reposition comes in Phase 4.
// ──────────────────────────────────────────────────────────────────────────────

export type BoardFrameProps = {
  board: Board;
  framework: AnyFrameworkModule | null;
  isActive: boolean;
  pendingStatusLabel?: string;
  onActivate: () => void;
  onTitleChange: (next: string) => void;
  onMapChange: (next: UniversalMap) => void;
  onSelectionChange: (sel: UniversalSelection | null) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onMove?: (x: number, y: number) => void;
  /** If true, disables interactive editing (e.g. during generation). */
  locked?: boolean;
};

export function BoardFrame({
  board,
  framework,
  isActive,
  pendingStatusLabel,
  onActivate,
  onTitleChange,
  onMapChange,
  onSelectionChange,
  onDelete,
  onDuplicate,
  onMove,
  locked = false,
}: BoardFrameProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board.title);
  const [titleFocused, setTitleFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { getScale } = useZoom();

  useEffect(() => {
    if (!titleFocused) setTitleDraft(board.title);
  }, [board.title, titleFocused]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const isPendingDescribe = board.status === "pending-describe";
  const isPendingGenerate = board.status === "pending-generate";
  const busy = locked || isPendingGenerate || isPendingDescribe;

  return (
    <div
      data-board-frame
      data-board-id={board.id}
      data-active={isActive ? "true" : undefined}
      onPointerDown={() => {
        if (!isActive) onActivate();
      }}
      className={[
        "absolute rounded-[28px] transition-shadow",
        isActive
          ? "ring-2 ring-[rgb(var(--accent))]/60 shadow-panel"
          : "ring-1 ring-border-soft/60",
      ].join(" ")}
      style={{
        left: board.x,
        top: board.y,
      }}
    >
      {/* Header chrome — drag handle + title + per-board menu. The grip
          initiates a drag; clicks elsewhere in the header focus the title or
          open the menu. */}
      <div
        data-board-header
        className={[
          "absolute -top-8 left-0 right-0 flex items-center gap-1 px-1",
          isDragging ? "cursor-grabbing" : "",
        ].join(" ")}
      >
        {onMove && !busy && (
          <button
            type="button"
            data-floating
            aria-label="Drag to reposition"
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType !== "touch") return;
              e.preventDefault();
              e.stopPropagation();
              const startClientX = e.clientX;
              const startClientY = e.clientY;
              const startX = board.x;
              const startY = board.y;
              setIsDragging(true);
              onActivate();
              const onPointerMove = (ev: PointerEvent) => {
                const scale = getScale() || 1;
                const dx = (ev.clientX - startClientX) / scale;
                const dy = (ev.clientY - startClientY) / scale;
                onMove(startX + dx, startY + dy);
              };
              const onPointerUp = () => {
                setIsDragging(false);
                window.removeEventListener("pointermove", onPointerMove);
                window.removeEventListener("pointerup", onPointerUp);
                window.removeEventListener("pointercancel", onPointerUp);
              };
              window.addEventListener("pointermove", onPointerMove);
              window.addEventListener("pointerup", onPointerUp);
              window.addEventListener("pointercancel", onPointerUp);
            }}
            className={[
              "inline-flex items-center justify-center h-6 w-6 rounded-md shrink-0",
              "text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]",
              "transition-colors",
              isDragging ? "cursor-grabbing" : "cursor-grab",
            ].join(" ")}
            title="Drag to reposition"
          >
            <GripHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => {
            setTitleFocused(false);
            const next = titleDraft.trim();
            if (next && next !== board.title) onTitleChange(next);
            else setTitleDraft(board.title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setTitleDraft(board.title);
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={busy}
          className={[
            "bg-transparent outline-none truncate min-w-0 flex-1",
            "text-[12px] font-medium text-ink-secondary hover:text-ink-primary",
            "focus:text-ink-primary",
            "px-2 py-1 rounded-md",
            "hover:bg-ink-primary/[0.04] focus:bg-white/70",
          ].join(" ")}
          aria-label="Board title"
        />

        <div ref={menuRef} className="relative shrink-0" data-floating>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className={[
              "inline-flex items-center justify-center h-6 w-6 rounded-md",
              "text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]",
              "transition-colors",
              isActive || menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            ].join(" ")}
            aria-label="Board menu"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute top-7 right-0 z-20 w-[168px] rounded-lg bg-white shadow-panel ring-1 ring-border-soft p-1">
              {onDuplicate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDuplicate();
                  }}
                  className="w-full inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-ink-secondary hover:bg-ink-primary/[0.06] hover:text-ink-primary transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-rose-700 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete board
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Board content — either the skeleton (pending-describe) or the real
          framework grid. We keep the same visual shell so the pending → ready
          transition is a content swap, not a layout shift. */}
      {isPendingDescribe || !framework ? (
        <PendingBoardSkeleton
          title={board.title || "Designing framework…"}
          prompt={board.pendingPrompt}
          statusLabel={pendingStatusLabel ?? "Working…"}
        />
      ) : (
        <div
          data-map-page
          data-board-map-root
          className={[
            "inline-block rounded-[28px] bg-surface",
            "px-10 py-10 md:px-12 md:py-12",
            "shadow-panel ring-1 ring-border-soft/70",
          ].join(" ")}
        >
          <framework.Component
            map={board.map}
            onChange={onMapChange}
            busy={busy}
            selection={board.selection}
            onSelectionChange={(sel) =>
              onSelectionChange((sel ?? null) as UniversalSelection | null)
            }
          />
        </div>
      )}
    </div>
  );
}
