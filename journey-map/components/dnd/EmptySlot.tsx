"use client";

import { useDroppable } from "@dnd-kit/core";

type Props = {
  rowId: string;
  stageId: string;
  agentBusy: boolean;
  onClick: (rowId: string, stageId: string) => void;
};

// Droppable placeholder at an empty (row, stage) position.
// - Drop a card onto it → card relocates here (source position becomes empty).
// - Click it → create a new cell and enter edit mode.
export function EmptySlot({ rowId, stageId, agentBusy, onClick }: Props) {
  const id = `empty:${rowId}:${stageId}`;
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: "empty-slot", rowId, stageId },
    disabled: agentBusy,
  });

  return (
    <div
      ref={setNodeRef}
      data-empty-slot
      data-row-id={rowId}
      data-stage-id={stageId}
      onClick={(e) => {
        e.stopPropagation();
        if (agentBusy) return;
        onClick(rowId, stageId);
      }}
      className={[
        "w-[280px] shrink-0 min-h-[176px] rounded-xl border border-dashed",
        "flex items-center justify-center select-none transition-colors",
        agentBusy ? "pointer-events-none" : "cursor-pointer",
        isOver
          ? "border-ink-primary/70 bg-ink-primary/[0.04] ring-2 ring-ink-primary/20"
          : "border-border-soft bg-transparent hover:border-border-medium hover:bg-surface-subtle/60",
      ].join(" ")}
    >
      <span className="font-mono text-[11px] text-ink-muted/60 group-hover:text-ink-muted">
        +
      </span>
    </div>
  );
}
