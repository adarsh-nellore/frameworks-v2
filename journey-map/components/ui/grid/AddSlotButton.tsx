"use client";

import { Plus } from "lucide-react";

type Props = {
  label: string;
  agentBusy: boolean;
  onAdd: () => void;
  /** "row" lays out horizontally (used for "Add Stage" headers). */
  orientation?: "row" | "block";
  width?: number;
  fullWidth?: boolean;
};

/**
 * Standardized "Add X" affordance used everywhere a new col / row / theme
 * can be added. Dashed border, mono uppercase eyebrow, plus glyph — same
 * visual language as `EmptySlot` so add affordances feel coherent.
 */
export function AddSlotButton({
  label,
  agentBusy,
  onAdd,
  orientation = "row",
  width,
  fullWidth = false,
}: Props) {
  return (
    <button
      type="button"
      disabled={agentBusy}
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      style={width ? { width } : undefined}
      className={[
        // Primary structural add affordance — keep it discoverable at rest.
        // An earlier iteration hid it behind group-hover/section, but the
        // sparse GridLayout (journey-map etc.) doesn't wrap in that group
        // container, so the button went permanently invisible and users
        // couldn't add cols or rows. Subdued at rest, full on hover/focus.
        "opacity-60 hover:opacity-100 focus-visible:opacity-100",
        "inline-flex items-center justify-center gap-1.5",
        "rounded-lg border border-dashed border-border-soft",
        "hover:border-border-medium hover:bg-white/40",
        "text-ink-muted hover:text-ink-secondary",
        "transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        orientation === "row" ? "h-10 px-3" : "w-full py-2.5",
        fullWidth ? "w-full" : "shrink-0",
      ].join(" ")}
    >
      <Plus className="h-3 w-3" />
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase">
        {label}
      </span>
    </button>
  );
}
