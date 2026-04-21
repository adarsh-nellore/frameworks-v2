"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { kindTheme } from "@/lib/row-kind-theme";
import { useZoom } from "@/lib/zoom-context";

type Props = {
  rowId: string;
  label: string;
  kind: string;
  isSelected: boolean;
  agentBusy: boolean;
  onClick: (rowId: string) => void;
  onLabelChange: (rowId: string, label: string) => void;
};

export function RowLabel({
  rowId,
  label,
  kind,
  isSelected,
  agentBusy,
  onClick,
  onLabelChange,
}: Props) {
  const sortable = useSortable({
    id: rowId,
    data: { kind: "row", rowId },
    disabled: agentBusy,
  });

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

  const theme = kindTheme(kind);
  const Icon = theme.Icon;
  const { getScale } = useZoom();

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

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) onLabelChange(rowId, trimmed);
    else setDraft(label);
  }
  function cancel() {
    setEditing(false);
    setDraft(label);
  }
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (agentBusy) {
      onClick(rowId);
      return;
    }
    onClick(rowId);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (agentBusy) return;
    setEditing(true);
  }

  return (
    <div
      data-row
      data-row-id={rowId}
      ref={sortable.setNodeRef}
      style={style}
      className={[
        "pl-3 pr-3 flex items-center min-h-[180px] py-5 border-l-2 rounded-l-xl",
        editing ? "cursor-text" : "cursor-grab active:cursor-grabbing",
        isSelected ? theme.accentBorder : "border-transparent",
        !editing && "select-none",
      ].join(" ")}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...(editing ? {} : sortable.listeners)}
      {...(editing ? {} : sortable.attributes)}
    >
      <div
        className={[
          "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors duration-150 select-none w-full min-w-0",
          isSelected ? "bg-ink-primary text-white" : "",
        ].join(" ")}
      >
        <Icon
          className={[
            "shrink-0 h-4 w-4",
            isSelected ? "text-white/90" : theme.accentText,
          ].join(" ")}
        />
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
            className="min-w-0 flex-1 bg-transparent outline-none font-sans text-[13px] text-ink-primary tracking-tight"
          />
        ) : (
          <span
            className={[
              "min-w-0 truncate font-sans text-[13px] tracking-tight transition-colors",
              isSelected ? "text-white" : "text-ink-secondary",
            ].join(" ")}
          >
            {label || "[row]"}
          </span>
        )}
      </div>
    </div>
  );
}
