"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp } from "lucide-react";

type Props = {
  xLabel: string;
  yLabel: string;
  agentBusy: boolean;
  onXLabelChange: (label: string) => void;
  onYLabelChange: (label: string) => void;
};

/**
 * L-shaped axis chrome for the matrix layouts (2x2, competitive map).
 * Renders an X-axis label band along the top and a rotated Y-axis label band
 * along the left. Both labels are inline-editable. Returns the bands as
 * separate elements so callers can position them around the matrix grid.
 */
export function AxisSpine({
  xLabel,
  yLabel,
  agentBusy,
  onXLabelChange,
  onYLabelChange,
}: Props) {
  return (
    <>
      <XAxisBand label={xLabel} agentBusy={agentBusy} onChange={onXLabelChange} />
      <YAxisBand label={yLabel} agentBusy={agentBusy} onChange={onYLabelChange} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function XAxisBand({
  label,
  agentBusy,
  onChange,
}: {
  label: string;
  agentBusy: boolean;
  onChange: (label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 ml-[200px] pr-2">
      <EditableAxisLabel
        value={label}
        agentBusy={agentBusy}
        onChange={onChange}
        className="text-[12px] font-medium text-ink-secondary"
      />
      <span className="flex-1 h-px bg-gradient-to-r from-border-soft to-transparent" />
      <ArrowRight className="h-3 w-3 text-ink-muted shrink-0" />
    </div>
  );
}

export function YAxisBand({
  label,
  agentBusy,
  onChange,
}: {
  label: string;
  agentBusy: boolean;
  onChange: (label: string) => void;
}) {
  // Vertical band positioned to the left of the matrix grid.
  return (
    <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center justify-between py-3 pointer-events-none">
      <ArrowUp className="h-3 w-3 text-ink-muted shrink-0" />
      <div className="pointer-events-auto flex items-center gap-2 -rotate-90 origin-center whitespace-nowrap">
        <EditableAxisLabel
          value={label}
          agentBusy={agentBusy}
          onChange={onChange}
          className="text-[12px] font-medium text-ink-secondary"
        />
      </div>
      <span className="font-mono text-[8px] tracking-[0.22em] uppercase text-ink-muted/60">
        ↓
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EditableAxisLabel({
  value,
  agentBusy,
  onChange,
  className,
}: {
  value: string;
  agentBusy: boolean;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    else setDraft(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
            setDraft(value);
          }
        }}
        className={[
          "bg-transparent outline-none border-b border-ink-primary px-1 min-w-[100px]",
          className ?? "",
        ].join(" ")}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={agentBusy}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={["hover:text-ink-primary transition-colors", className ?? ""].join(" ")}
      title="Click to rename axis"
    >
      {value || "—"}
    </button>
  );
}
