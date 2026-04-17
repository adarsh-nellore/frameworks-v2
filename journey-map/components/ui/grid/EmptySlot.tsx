"use client";

import { Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";

type Props = {
  /** Drop target id — typically `slot:${colId}:${rowId}`. Omit for non-droppable empty placeholders. */
  droppableId?: string;
  droppableData?: Record<string, unknown>;
  agentBusy: boolean;
  onAdd: () => void;
  /** "tall" matches a grid row track (~176px); "short" is for kanban/matrix cells (~96px). */
  size?: "tall" | "short";
  /** Visible affordance label. Defaults to a single "+" glyph. */
  label?: string;
  /** Right-click menu (parent builds items). */
  onContextMenu?: (e: React.MouseEvent) => void;
};

/**
 * Standardized empty placeholder used by all 3 layout modes.
 * Dashed border + centered "+" affordance + optional drop target.
 * Reads as "you can add a card here" without language overhead.
 */
export function EmptySlot({
  droppableId,
  droppableData,
  agentBusy,
  onAdd,
  size = "tall",
  label,
  onContextMenu,
}: Props) {
  const drop = useDroppable({
    id: droppableId ?? `empty:${Math.random().toString(36).slice(2)}`,
    data: droppableData ?? {},
    disabled: !droppableId,
  });

  const minH = size === "tall" ? "min-h-[176px]" : "min-h-[96px]";

  return (
    <button
      ref={droppableId ? drop.setNodeRef : undefined}
      type="button"
      disabled={agentBusy}
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      onContextMenu={onContextMenu}
      className={[
        "group w-full rounded-xl flex-1 flex items-center justify-center gap-1.5",
        "border border-dashed transition-colors",
        minH,
        drop.isOver && droppableId
          ? "bg-ink-primary/[0.06] border-ink-primary/50 ring-2 ring-ink-primary/30 ring-inset"
          : "border-border-soft hover:border-border-medium hover:bg-white/40",
        agentBusy ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <Plus
        className={[
          "h-3.5 w-3.5 transition-colors",
          drop.isOver && droppableId
            ? "text-ink-primary"
            : "text-ink-muted group-hover:text-ink-secondary",
        ].join(" ")}
      />
      {label ? (
        <span
          className={[
            "font-mono text-[10px] tracking-[0.18em] uppercase transition-colors",
            drop.isOver && droppableId
              ? "text-ink-primary"
              : "text-ink-muted group-hover:text-ink-secondary",
          ].join(" ")}
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}
