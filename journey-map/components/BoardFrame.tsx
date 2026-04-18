"use client";

import { MoreHorizontal, Trash2, Copy, GripHorizontal, Paperclip } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useCanvasContextMenu } from "@/components/ui/CanvasContextMenu";
import { boardMenu } from "@/components/ui/canvas-menus";
import type { Board } from "@/lib/canvas/types";
import type { AnyFrameworkModule } from "@/lib/frameworks";
import type { UniversalMap, UniversalSelection } from "@/lib/frameworks/universal/types";
import { PendingBoardSkeleton } from "@/components/PendingBoardSkeleton";
import { useZoom } from "@/lib/zoom-context";
import {
  applyDesignSystem,
  applyDesignTokenCssVars,
  applyTheme,
  loadStoredDesignSystemJson,
  loadStoredDesignTokenCssVarsJson,
  loadStoredThemeJson,
  parseDesignSystem,
  parseThemeImport,
} from "@/lib/theme";

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
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const boardRootRef = useRef<HTMLDivElement | null>(null);
  const { getScale } = useZoom();
  const contextMenu = useCanvasContextMenu();

  const isPendingDescribe = board.status === "pending-describe";
  const isPendingGenerate = board.status === "pending-generate";
  const busy = locked || isPendingGenerate || isPendingDescribe;

  // Any pointer-down on a board surface that ISN'T an interactive child (card,
  // input, menu button, etc.) starts a board move. Covers the header, the
  // board's outer ring, and the interior whitespace between cards — whatever
  // the user grabs, the whole board moves (Figma frame parity).
  //
  // Hardening notes:
  //   • A 4px movement threshold keeps bare clicks from registering as drags.
  //   • setPointerCapture pins pointer events to this element so pointerup
  //     always fires, even if the pointer wanders over menus or other windows.
  //   • Escape cancels the drag and restores the original position.
  //   • window.blur is a belt-and-suspenders against the "stuck dragging"
  //     state on OS-level focus changes.
  const INTERACTIVE_CHILD =
    "[data-no-drag],[data-block],[data-card-el],[data-floating],input,textarea,button,select,a,[role='button'],[contenteditable='true']";
  // Any pointerdown inside a board — even on an interactive child — should
  // activate the board. Without this, clicking a card selects the card but
  // never sets activeBoardId, so the workspace keyboard handler (Cmd+D,
  // Delete) can't find an active board and silently returns.
  const activateOnPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (busy) return;
      if (e.button !== 0 && e.pointerType !== "touch") return;
      if (!isActive) onActivate();
    },
    [busy, isActive, onActivate]
  );
  const startBoardDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!onMove || busy) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(INTERACTIVE_CHILD)) return;
      if (e.button !== 0 && e.pointerType !== "touch") return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startX = board.x;
      const startY = board.y;
      const THRESHOLD = 4;
      let engaged = false;
      try {
        el.setPointerCapture?.(pointerId);
      } catch {
        /* capture may fail for synthetic events — not fatal */
      }
      onActivate();
      const scale = getScale() || 1;
      const commit = (ev: PointerEvent) => {
        const dx = (ev.clientX - startClientX) / scale;
        const dy = (ev.clientY - startClientY) / scale;
        onMove(startX + dx, startY + dy);
      };
      const cleanup = () => {
        engaged = false;
        setIsDragging(false);
        try { el.releasePointerCapture?.(pointerId); } catch {}
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        window.removeEventListener("mouseup", onPointerUp);
        window.removeEventListener("blur", onPointerUp);
        window.removeEventListener("keydown", onKey);
      };
      const onPointerMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if (!engaged && Math.abs(dx) + Math.abs(dy) < THRESHOLD) return;
        if (!engaged) {
          engaged = true;
          setIsDragging(true);
        }
        commit(ev);
      };
      const onPointerUp = () => cleanup();
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          onMove(startX, startY);
          cleanup();
        }
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("mouseup", onPointerUp);
      window.addEventListener("blur", onPointerUp);
      window.addEventListener("keydown", onKey);
    },
    // board.x/board.y change on every drag step — we intentionally read fresh
    // values on each new pointerdown so the dependency list stays lean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onMove, onActivate, getScale, busy]
  );

  const openHeaderContextMenu = useCallback(
    (e: React.MouseEvent) => {
      contextMenu.open(
        e,
        boardMenu({
          onRename: () => {
            titleInputRef.current?.focus();
            titleInputRef.current?.select();
          },
          onDuplicate: onDuplicate,
          onDelete: onDelete,
        })
      );
    },
    [contextMenu, onDuplicate, onDelete]
  );

  // Scope the stored design-system / theme to THIS board's content root. This
  // replaces the old canvas-page useLayoutEffect that applied to
  // document.documentElement — which bled theme colors onto the copilot,
  // topbar, and landing page. Re-runs on a `frameworks:theme-changed` event so
  // applying a new theme updates every visible board immediately.
  useLayoutEffect(() => {
    function hydrate() {
      const target = boardRootRef.current;
      if (!target) return;
      try {
        const dsRaw = loadStoredDesignSystemJson();
        if (dsRaw) {
          const parsed = parseDesignSystem(JSON.parse(dsRaw) as unknown);
          if (parsed.ok) applyDesignSystem(parsed.ds, target);
        }
        const themeRaw = loadStoredThemeJson();
        if (themeRaw) {
          const parsed = parseThemeImport(JSON.parse(themeRaw) as unknown);
          if (parsed.ok) applyTheme(parsed.theme, target);
        }
        const extra = loadStoredDesignTokenCssVarsJson();
        if (extra) {
          applyDesignTokenCssVars(JSON.parse(extra) as Record<string, string>, target);
        } else {
          applyDesignTokenCssVars(undefined, target);
        }
      } catch {
        /* stored JSON corrupt — skip */
      }
    }
    hydrate();
    window.addEventListener("frameworks:theme-changed", hydrate);
    return () => window.removeEventListener("frameworks:theme-changed", hydrate);
  }, [framework]);

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

  return (
    <div
      data-board-frame
      data-board-id={board.id}
      data-active={isActive ? "true" : undefined}
      // Capture-phase listener so activation fires BEFORE card/menu children
      // call stopPropagation. Bubble-phase startBoardDrag still runs after.
      onPointerDownCapture={activateOnPointerDown}
      onPointerDown={startBoardDrag}
      className={[
        "absolute rounded-[28px] transition-shadow",
        isActive
          ? "ring-2 ring-[rgb(var(--accent))]/60 shadow-panel"
          : "ring-1 ring-border-soft/60",
        isDragging ? "cursor-grabbing" : "",
      ].join(" ")}
      style={{
        left: board.x,
        top: board.y,
      }}
    >
      {/* Header chrome — entire strip is a drag surface for repositioning the
          board. Interactive children (title input, overflow menu, attachment
          badge) carry data-no-drag so click/focus still work there. The grip
          glyph is kept as a visual affordance only. */}
      <div
        data-board-header
        onPointerDown={startBoardDrag}
        onContextMenu={openHeaderContextMenu}
        className={[
          "absolute -top-8 left-0 right-0 flex items-center gap-1 px-1 select-none",
          onMove && !busy
            ? isDragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : "",
        ].join(" ")}
      >
        {onMove && !busy && (
          <span
            aria-hidden="true"
            className={[
              "inline-flex items-center justify-center h-6 w-6 rounded-md shrink-0",
              "text-ink-muted/70",
              "transition-colors",
            ].join(" ")}
            title="Drag anywhere on this header to reposition"
          >
            <GripHorizontal className="h-3.5 w-3.5" />
          </span>
        )}
        {board.attachments && board.attachments.length > 0 && (
          <span
            data-floating
            data-no-drag
            className="inline-flex items-center gap-1 rounded-md bg-ink-primary/[0.06] text-ink-secondary px-1.5 py-0.5 shrink-0"
            title={board.attachments.map((a) => a.name).join("\n")}
          >
            <Paperclip className="h-3 w-3" />
            <span className="text-[10px] font-mono tabular-nums">
              {board.attachments.length}
            </span>
          </span>
        )}
        <input
          ref={titleInputRef}
          type="text"
          data-no-drag
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

        <div ref={menuRef} className="relative shrink-0" data-floating data-no-drag>
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
          ref={boardRootRef}
          className={[
            // Board interior paints with --canvas (brighter than the page
            // --backdrop), so the board reads as a paper surface lifted off
            // the desk. Cards stay on --surface so they lift off the board.
            "inline-block rounded-[28px] bg-canvas",
            "px-10 py-10 md:px-12 md:py-12",
            "shadow-panel ring-1 ring-border-medium/50",
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
            createdAt={board.createdAt}
          />
        </div>
      )}
    </div>
  );
}
