"use client";

import { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { kindTheme } from "@/lib/row-kind-theme";
import { renderCellText } from "@/lib/cell-text";

type Props = {
  cellId: string;
  rowId: string;
  colIdx: number;
  text: string;
  num: number;
  rowKind: string;
  isSelected: boolean;
  isInDragGroup: boolean;
  isRowSelected: boolean;
  isColumnSelected: boolean;
  agentBusy: boolean;
  onSelect: (cellId: string, additive: boolean) => void;
  onTextChange: (cellId: string, text: string) => void;
};

export function Cell({
  cellId,
  rowId,
  colIdx,
  text,
  num,
  rowKind,
  isSelected,
  isInDragGroup,
  isRowSelected,
  isColumnSelected,
  agentBusy,
  onSelect,
  onTextChange,
}: Props) {
  const draggable = useDraggable({
    id: cellId,
    data: { kind: "card", rowId, colIdx, cellId },
    disabled: agentBusy,
  });
  const droppable = useDroppable({
    id: cellId,
    data: { kind: "card", rowId, colIdx, cellId },
  });

  const setRef = (node: HTMLDivElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  useEffect(() => {
    if (agentBusy && editing) {
      setEditing(false);
      setDraft(text);
    }
  }, [agentBusy, editing, text]);

  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [editing]);

  // Click outside the cell (canvas pan, chrome, another card, etc.): blur so
  // onBlur commits — canvas/pan often prevents default focus moves otherwise.
  useEffect(() => {
    if (!editing) return;
    function settleIfOutside(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && root.contains(target)) return;
      taRef.current?.blur();
    }
    document.addEventListener("pointerdown", settleIfOutside, true);
    return () => document.removeEventListener("pointerdown", settleIfOutside, true);
  }, [editing]);

  const isThisDragging = draggable.isDragging;
  const isGhost = isThisDragging || isInDragGroup;
  const showOver = droppable.isOver && !isGhost;
  const theme = kindTheme(rowKind);
  const Icon = theme.Icon;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    const additive = e.metaKey || e.shiftKey || e.ctrlKey;
    if (additive) {
      onSelect(cellId, true);
      return;
    }
    if (agentBusy) {
      onSelect(cellId, false);
      return;
    }
    onSelect(cellId, false);
    if (!editing) setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (draft !== text) onTextChange(cellId, draft);
  }
  function cancel() {
    setEditing(false);
    setDraft(text);
  }

  // Compose idle-state classes. Selected/hover/drag states override.
  const idleClasses = [
    theme.tintBg,
    "border-border-soft shadow-card hover:shadow-card-hover hover:border-border-medium",
    `border-l-[3px] ${theme.accentBorder}`,
  ].join(" ");

  const setRootRef = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRef(node);
  };

  return (
    <div
      data-block
      data-card-el
      data-card-id={cellId}
      ref={setRootRef}
      className="w-[280px] shrink-0"
      style={isThisDragging ? { opacity: 0.3 } : undefined}
      onClick={handleClick}
      {...(editing ? {} : draggable.listeners)}
      {...(editing ? {} : draggable.attributes)}
    >
      <div
        className={[
          "group relative min-h-[176px] rounded-xl border",
          "flex flex-col p-3 pl-3.5 select-none",
          editing ? "cursor-text" : "cursor-grab active:cursor-grabbing",
          isGhost
            ? "bg-white border-slate-300/80 shadow-card"
            : showOver
            ? "bg-slate-900/[0.06] border-slate-900/70 ring-2 ring-slate-900/40"
            : isSelected
            ? "bg-white border-slate-900 ring-2 ring-slate-900/85 ring-offset-2 ring-offset-canvas shadow-card-hover"
            : isRowSelected
            ? "bg-ink-primary/[0.06] border-ink-primary/45 ring-2 ring-ink-primary/30 ring-offset-2 ring-offset-canvas shadow-card"
            : isColumnSelected
            ? "bg-ink-primary/[0.05] border-ink-primary/40 ring-2 ring-ink-primary/25 ring-offset-2 ring-offset-canvas shadow-card"
            : idleClasses,
        ].join(" ")}
      >
        {/* Top row: kind chip + numeric */}
        <div className="flex items-center justify-between mb-2">
          <span
            className={[
              "inline-flex h-5 w-5 items-center justify-center rounded-md",
              theme.chipBg,
            ].join(" ")}
          >
            <Icon className={`h-3 w-3 ${theme.chipText}`} />
          </span>
          <span className="font-mono text-[9px] tabular-nums text-ink-muted group-hover:text-ink-secondary transition-colors tracking-widest">
            {num.toString().padStart(2, "0")}
          </span>
        </div>

        {editing ? (
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="absolute inset-0 w-full h-full p-3 pl-3.5 rounded-xl bg-white text-ink-primary text-[12px] leading-snug resize-none focus:outline-none border border-ink-primary"
          />
        ) : (
          <p className="font-sans text-[12px] leading-snug break-words text-ink-primary transition-colors">
            {text ? (
              renderCellText(text, rowKind)
            ) : (
              <span className="text-ink-muted italic">Click to add…</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
