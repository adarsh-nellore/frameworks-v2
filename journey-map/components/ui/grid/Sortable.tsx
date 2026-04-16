"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props = {
  id: string;
  /** Drag-and-drop kind so the parent DndContext can route drops correctly. */
  kind: "col-handle" | "row-handle";
  /** The id this handle represents (colId or rowId). */
  payloadId: string;
  agentBusy: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Sortable wrapper for column headers and row rails. Routes drag events
 * through the parent's DndContext so reorder works alongside card drags.
 *
 * Activation distance is enforced by the DndContext's PointerSensor (6px),
 * so a quick click still selects without triggering a drag.
 */
export function SortableHandle({ id, kind, payloadId, agentBusy, className, children }: Props) {
  const sortable = useSortable({
    id,
    data:
      kind === "col-handle"
        ? { kind, colId: payloadId }
        : { kind, rowId: payloadId },
    disabled: agentBusy,
  });

  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={className}
      {...sortable.listeners}
      {...sortable.attributes}
    >
      {children}
    </div>
  );
}
