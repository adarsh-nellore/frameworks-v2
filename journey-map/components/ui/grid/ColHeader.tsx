"use client";

import { useEffect, useRef, useState } from "react";
import { kindTheme } from "@/lib/row-kind-theme";

type Props = {
  label: string;
  /** Optional 1-based step number — renders as "01", "02" mono prefix. */
  index?: number | null;
  /** Drives icon + accent color. */
  kind?: string;
  isSelected: boolean;
  agentBusy: boolean;
  onClick: () => void;
  onLabelChange: (label: string) => void;
  onRemove?: () => void;
  /** Width override (defaults to flexible). */
  width?: number;
  /** Subject highlight (competitive map: this col is "us"). */
  isSubject?: boolean;
};

/**
 * Universal column / section / competitor / theme header.
 * One chip style across all 5 frameworks — only the icon and accent vary by kind.
 */
export function ColHeader({
  label,
  index,
  kind,
  isSelected,
  agentBusy,
  onClick,
  onLabelChange,
  onRemove,
  width,
  isSubject = false,
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

  const theme = kind ? kindTheme(kind) : undefined;
  const Icon = theme?.Icon;
  const stepLabel = index !== undefined && index !== null
    ? (index + 1).toString().padStart(2, "0")
    : null;

  return (
    <div
      data-stage
      className={[
        "group select-none",
        editing ? "cursor-text" : "cursor-pointer",
      ].join(" ")}
      style={width ? { width } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!agentBusy) setEditing(true);
      }}
    >
      <div
        className={[
          "px-3.5 py-2.5 rounded-lg flex items-center gap-2.5 min-h-[40px]",
          "transition-[background-color,border-color,box-shadow] duration-150 border",
          isSelected
            ? "bg-accent text-white border-accent shadow-card"
            : isSubject
              ? "bg-accent/[0.08] border-accent/40 hover:border-accent/60"
              : "bg-surface border-border-soft hover:border-border-medium",
        ].join(" ")}
      >
        {Icon ? (
          <Icon
            className={[
              "shrink-0 h-3.5 w-3.5",
              isSelected ? "text-white/90" : theme!.accentText,
            ].join(" ")}
          />
        ) : null}
        {stepLabel !== null && (
          <span
            className={[
              "font-mono text-[10px] tabular-nums tracking-[0.18em] shrink-0",
              isSelected ? "text-white/60" : "text-ink-muted",
            ].join(" ")}
          >
            {stepLabel}
          </span>
        )}
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
            className={[
              "min-w-0 flex-1 bg-transparent outline-none font-sans text-[13px] font-medium tracking-tight",
              isSelected
                ? "text-white placeholder:text-white/40"
                : "text-ink-primary placeholder:text-ink-muted",
            ].join(" ")}
          />
        ) : (
          <span
            className={[
              "min-w-0 truncate font-sans text-[13px] font-medium tracking-tight flex-1",
              isSelected ? "text-white" : "text-ink-primary",
            ].join(" ")}
          >
            {label || "[col]"}
          </span>
        )}
        {isSubject && !isSelected ? (
          <span className="shrink-0 font-mono text-[8px] tracking-[0.22em] uppercase text-ink-primary/60 bg-ink-primary/[0.08] rounded px-1.5 py-0.5">
            You
          </span>
        ) : null}
        {onRemove && !editing ? (
          <button
            type="button"
            disabled={agentBusy}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-md w-5 h-5 grid place-items-center text-ink-muted hover:text-rose-600 hover:bg-rose-50 shrink-0"
            aria-label="Remove"
          >
            <span className="text-[14px] leading-none">×</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
