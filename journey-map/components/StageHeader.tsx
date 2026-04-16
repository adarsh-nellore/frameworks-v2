"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useZoom } from "@/lib/zoom-context";

type Props = {
  stageId: string;
  label: string;
  index: number;
  isSelected: boolean;
  agentBusy: boolean;
  onClick: (stageId: string, e: React.MouseEvent) => void;
  onLabelChange: (stageId: string, label: string) => void;
};

export function StageHeader({
  stageId,
  label,
  index,
  isSelected,
  agentBusy,
  onClick,
  onLabelChange,
}: Props) {
  const sortable = useSortable({
    id: stageId,
    data: { kind: "stage", stageId },
    disabled: agentBusy,
  });
  const { getScale } = useZoom();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);
  useEffect(() => {
    if (agentBusy && editing) {
      setEditing(false);
      setDraft(label);
    }
  }, [agentBusy, editing, label]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) onLabelChange(stageId, trimmed);
    else setDraft(label);
  }
  function cancel() {
    setEditing(false);
    setDraft(label);
  }
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    const additive = e.metaKey || e.shiftKey || e.ctrlKey;
    if (agentBusy) {
      onClick(stageId, e);
      return;
    }
    onClick(stageId, e);
    // Modifier+click: multi-select stages only; plain click also selects one stage then edits label.
    if (!additive && !editing) setEditing(true);
  }

  const s = getScale();
  const style = sortable.transform
    ? {
        transform: CSS.Transform.toString({
          ...sortable.transform,
          x: sortable.transform.x / s,
          y: sortable.transform.y / s,
        }),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.3 : undefined,
      }
    : undefined;

  const stepLabel = (index + 1).toString().padStart(2, "0");

  return (
    <div
      data-stage
      data-stage-id={stageId}
      ref={sortable.setNodeRef}
      style={style}
      className={[
        "w-[280px] shrink-0",
        editing ? "cursor-text" : "cursor-grab active:cursor-grabbing",
      ].join(" ")}
      onClick={handleClick}
      {...(editing ? {} : sortable.listeners)}
      {...(editing ? {} : sortable.attributes)}
    >
      <div
        className={[
          "px-3.5 py-2.5 rounded-lg flex items-center gap-2.5 min-h-[40px] select-none",
          "transition-[background-color,border-color] duration-150",
          "border",
          isSelected
            ? "bg-ink-primary text-white border-ink-primary"
            : "bg-surface border-border-soft hover:border-border-medium",
        ].join(" ")}
      >
        <span
          className={[
            "font-mono text-[10px] tabular-nums tracking-[0.18em] shrink-0",
            isSelected ? "text-white/60" : "text-ink-muted",
          ].join(" ")}
        >
          {stepLabel}
        </span>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className={[
              "min-w-0 flex-1 bg-transparent outline-none font-sans text-[13px] font-medium tracking-tight",
              isSelected ? "text-white placeholder:text-white/40" : "text-ink-primary placeholder:text-ink-muted",
            ].join(" ")}
          />
        ) : (
          <span
            className={[
              "min-w-0 truncate font-sans text-[13px] font-medium tracking-tight",
              isSelected ? "text-white" : "text-ink-primary",
            ].join(" ")}
          >
            {label || "[stage]"}
          </span>
        )}
      </div>
    </div>
  );
}
