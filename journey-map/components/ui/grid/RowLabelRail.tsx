"use client";

import { useEffect, useRef, useState } from "react";
import { kindTheme } from "@/lib/row-kind-theme";

type Props = {
  label: string;
  kind: string;
  isSelected: boolean;
  agentBusy: boolean;
  onClick: () => void;
  onLabelChange: (label: string) => void;
  onRemove?: () => void;
  /** Width of the rail (px). Defaults to 200 (matches grid layout). */
  width?: number;
  /** Min height of the rail. Should match the row track height (default 160). */
  minHeight?: number;
  /** Right-click → parent builds the menu items for this row. */
  onContextMenu?: (e: React.MouseEvent) => void;
};

/**
 * Universal row / lane / criterion label rendered as a left rail with a
 * kind-colored accent border. Click to select; double-click to rename.
 */
export function RowLabelRail({
  label,
  kind,
  isSelected,
  agentBusy,
  onClick,
  onLabelChange,
  onRemove,
  width = 200,
  minHeight = 160,
  onContextMenu,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== label) onLabelChange(t);
    else setDraft(label);
  }

  const theme = kindTheme(kind);
  const Icon = theme.Icon;

  return (
    <div
      style={{ width, minHeight }}
      className={[
        "group shrink-0 pl-3 pr-3 flex items-center py-5 border-l-2 rounded-l-xl",
        isSelected ? theme.accentBorder : "border-transparent",
        editing ? "cursor-text" : "cursor-pointer",
        !editing && "select-none",
      ].join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!agentBusy) setEditing(true);
      }}
      onContextMenu={onContextMenu}
    >
      <div
        className={[
          "flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors duration-150 select-none w-full min-w-0",
          isSelected ? "bg-ink-primary text-white" : "hover:bg-ink-primary/[0.04]",
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
                setEditing(false);
                setDraft(label);
              }
            }}
            className="min-w-0 flex-1 bg-transparent outline-none font-sans text-[13px] font-medium text-ink-primary tracking-tight"
          />
        ) : (
          <span
            className={[
              "min-w-0 truncate font-sans text-[13px] font-medium tracking-tight flex-1",
              isSelected ? "text-white" : "text-ink-primary",
            ].join(" ")}
          >
            {label || "[row]"}
          </span>
        )}
        {onRemove && !editing ? (
          <button
            type="button"
            disabled={agentBusy}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className={[
              "transition-opacity rounded-md w-5 h-5 grid place-items-center shrink-0",
              isSelected
                ? "text-white/70 hover:text-white hover:bg-white/20"
                : "text-ink-muted/60 hover:text-rose-600 hover:bg-rose-50",
            ].join(" ")}
            aria-label="Remove"
          >
            <span className="text-[14px] leading-none">×</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
