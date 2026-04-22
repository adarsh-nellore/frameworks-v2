"use client";

import { useEffect, useRef, useState } from "react";
import {
  Circle,
  Diamond,
  Egg,
  Plus,
  Square,
  StickyNote,
  X,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// ToolsRail — "insert primitives" menu on the left rail, stacked below the
// Templates icon. Default state is a collapsed icon. Expanded, it shows a
// short list of canvas primitives the user can drop:
//   - a card on the active board
//   - a column / row on the active board
//   - a new freeform (sticky-notes) board
//
// Context-sensitive: insert-on-active-board actions are disabled when there's
// no active board (the parent signals this via `canInsert`). Keeps the UI
// honest instead of pretending dead buttons work.
// ──────────────────────────────────────────────────────────────────────────────

const RAIL_PANEL_WIDTH = 260;

export type ShapeKind = "rectangle" | "diamond" | "circle" | "ellipse";

export type ToolsRailProps = {
  /** True when a board is active on the canvas. Enables the insert-card
   *  button. */
  canInsert: boolean;
  /** True when the active board is a freeform (sticky-notes) layout — only
   *  then will shape cards render as actual shapes. On grid/matrix/kanban
   *  boards a shape card would just render as a plain text card, so we gate
   *  the shape actions on this flag. */
  canInsertShapes: boolean;
  onAddCard: () => void;
  onAddShape: (kind: ShapeKind) => void;
  onNewFreeformBoard: () => void;
};

export function ToolsRail({
  canInsert,
  canInsertShapes,
  onAddCard,
  onAddShape,
  onNewFreeformBoard,
}: ToolsRailProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
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

  function run(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <>
      {/* Collapsed icon — stacks below the Templates icon in the left rail */}
      {!open && (
        <div data-floating className="fixed top-24 left-4 z-40">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="glass-strong rounded-full h-8 w-8 grid place-items-center text-ink-muted hover:text-ink-primary transition-colors"
            title="Insert a card, row, column, or board"
            aria-label="Open insert menu"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Expanded panel — same anchor as the icon */}
      {open && (
        <div
          ref={rootRef}
          data-floating
          className="fixed top-24 left-4 z-40 glass-strong rounded-2xl overflow-hidden flex flex-col"
          style={{ width: RAIL_PANEL_WIDTH, maxHeight: "calc(100vh - 120px)" }}
          role="dialog"
          aria-label="Insert menu"
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">
              Insert
            </span>
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

          <div className="px-1.5 pb-1.5 overflow-y-auto chat-scroll">
            <Section label="Card">
              <Row
                icon={StickyNote}
                label="Sticky card"
                hint="Add a card to the active board"
                disabled={!canInsert}
                disabledReason="Select a board first"
                onClick={() => run(onAddCard)}
              />
            </Section>
            <Section label="Shapes">
              <Row
                icon={Square}
                label="Rectangle"
                hint="Drop a rectangle on the freeform canvas"
                disabled={!canInsertShapes}
                disabledReason="Shapes land on freeform canvases"
                onClick={() => run(() => onAddShape("rectangle"))}
              />
              <Row
                icon={Diamond}
                label="Diamond"
                hint="Drop a diamond on the freeform canvas"
                disabled={!canInsertShapes}
                disabledReason="Shapes land on freeform canvases"
                onClick={() => run(() => onAddShape("diamond"))}
              />
              <Row
                icon={Circle}
                label="Circle"
                hint="Drop a circle on the freeform canvas"
                disabled={!canInsertShapes}
                disabledReason="Shapes land on freeform canvases"
                onClick={() => run(() => onAddShape("circle"))}
              />
              <Row
                icon={Egg}
                label="Ellipse"
                hint="Drop an ellipse on the freeform canvas"
                disabled={!canInsertShapes}
                disabledReason="Shapes land on freeform canvases"
                onClick={() => run(() => onAddShape("ellipse"))}
              />
            </Section>
            <Section label="New board">
              <Row
                icon={StickyNote}
                label="Freeform canvas"
                hint="Sticky-note board — drop cards anywhere"
                onClick={() => run(onNewFreeformBoard)}
              />
            </Section>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted px-2 pt-2 pb-1">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  disabledReason,
}: {
  icon: typeof Plus;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full text-left rounded-lg px-2 py-1.5 transition-colors",
        "flex items-start gap-2",
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:bg-ink-primary/[0.05]",
      ].join(" ")}
      title={disabled ? disabledReason ?? "Unavailable" : hint}
    >
      <div className="shrink-0 inline-flex items-center justify-center rounded-md h-7 w-7 bg-ink-primary/[0.06] text-ink-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-ink-primary">
          {label}
        </div>
        <div className="text-[10.5px] text-ink-muted leading-snug">
          {hint}
        </div>
      </div>
    </button>
  );
}
