"use client";

import { useDroppable } from "@dnd-kit/core";

type Props = {
  id: string;
  orientation: "vertical" | "horizontal"; // visual band shape
  active: boolean;                          // only render visibly when a card drag is happening
  label?: string;
};

// Sentinel droppables for drag-past-edge "add row/column" UX.
// Outer JourneyMap renders one EdgeDroppable for the right-of-stages slot
// and one for below-the-rows slot. They participate in collision detection
// only while a card drag is in progress.
export function EdgeDroppable({ id, orientation, active, label }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: id === "__add-stage__" ? "add-stage" : "add-row" },
  });

  if (!active) {
    // Render nothing during normal usage (no drag) — keeps layout clean.
    return null;
  }

  const base =
    orientation === "vertical"
      ? "self-stretch min-h-[72px] w-[64px]"
      : "h-[40px] w-full";

  return (
    <div
      ref={setNodeRef}
      data-edge-zone={id}
      className={[
        base,
        "shrink-0 mx-1 my-1 rounded-xl border-2 border-dashed flex items-center justify-center",
        "transition-all duration-150",
        isOver
          ? "border-slate-900 bg-slate-900/[0.08] text-slate-700"
          : "border-slate-300 bg-slate-50/50 text-slate-400",
      ].join(" ")}
    >
      <span className="font-mono text-[10px] tracking-tight uppercase">
        {label ?? "+ new"}
      </span>
    </div>
  );
}
