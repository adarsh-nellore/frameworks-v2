"use client";

import { useEffect, useRef, useState } from "react";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig, HeroMetaField } from "@/lib/frameworks/universal/config";
import type { Op } from "@/lib/frameworks/universal/ops";

type Props = {
  map: UniversalMap;
  config: FrameworkConfig;
  agentBusy: boolean;
  commitOps: (ops: Op[]) => void;
};

/**
 * Top-of-canvas hero plate that displays the framework's defining context
 * (persona, core job statement, axis labels, etc.) as the visual anchor of
 * the page. Click any field to inline-edit; Enter or blur to commit.
 *
 * Uses the same surface treatment as the map page (`bg-surface`, soft ring,
 * card shadow) so the hero reads as the *subject of the work*, not metadata.
 */
export function HeroBanner({ map, config, agentBusy, commitOps }: Props) {
  if (!config.heroMetaFields || config.heroMetaFields.length === 0) return null;

  // Layout decision: short fields side-by-side on md+, long fields stack.
  const fields = config.heroMetaFields;
  const allShort = fields.every((f) => isShortField(f));
  const gridClass = allShort && fields.length >= 2 ? "md:grid-cols-2" : "md:grid-cols-1";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="rounded-2xl bg-surface ring-1 ring-border-soft/70 shadow-card px-6 py-5 mb-6"
    >
      {/* Eyebrow framing — establishes "this is the foundation of your map".
          Stripe uses the design system's accent so the board header brands with
          the imported palette; the eyebrow text stays semantic/muted. */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-1 w-6 rounded-full bg-accent/50" />
        <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted">
          {config.label} · Foundation
        </span>
      </div>

      <div className={`grid grid-cols-1 ${gridClass} gap-4`}>
        {fields.map((field) => (
          <HeroField
            key={field.key}
            field={field}
            value={map.meta[field.key] ?? ""}
            agentBusy={agentBusy}
            onCommit={(v) => commitOps([{ op: "setMapMeta", key: field.key, value: v }])}
          />
        ))}
      </div>
    </div>
  );
}

function isShortField(f: HeroMetaField): boolean {
  // Fields likely to hold one-line content (axis labels, persona name).
  // coreJobStatement, jobPerformer (long-form sentence), context will be long.
  return /axis|axes|label/i.test(f.key);
}

// ─────────────────────────────────────────────────────────────────────────────

function HeroField({
  field,
  value,
  agentBusy,
  onCommit,
}: {
  field: HeroMetaField;
  value: string;
  agentBusy: boolean;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft.trim() !== value) onCommit(draft.trim());
  }

  const isLong = !isShortField(field);
  const valueClass = isLong
    ? "text-[15px] leading-relaxed text-ink-primary"
    : "text-[14px] leading-snug text-ink-primary";

  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted mb-1.5">
        {field.label}
      </div>
      {editing ? (
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setDraft(value);
            }
          }}
          rows={Math.max(1, Math.min(5, draft.split("\n").length))}
          className={[
            "w-full bg-surface border border-accent rounded-lg px-3 py-2",
            "outline-none resize-none shadow-card-hover",
            valueClass,
          ].join(" ")}
        />
      ) : (
        <button
          type="button"
          disabled={agentBusy}
          onClick={() => setEditing(true)}
          className={[
            "w-full text-left rounded-lg px-3 py-2 -mx-3 transition-colors min-h-[36px]",
            "hover:bg-ink-primary/[0.03]",
            value ? "" : "italic text-ink-muted",
            valueClass.replace("text-ink-primary", value ? "text-ink-primary" : "text-ink-muted"),
          ].join(" ")}
        >
          {value || field.placeholder}
        </button>
      )}
    </div>
  );
}
