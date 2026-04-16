"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import {
  listFrameworks,
  isDynamicFramework,
  registerDynamicFramework,
} from "@/lib/frameworks";
import { loadCustomFrameworks } from "@/lib/frameworks/custom/registry";
import type { AnyFrameworkModule } from "@/lib/frameworks";

// ──────────────────────────────────────────────────────────────────────────────
// FrameworkPills — searchable pill list of available frameworks.
//
// Rendered below the landing prompt box. Compact, horizontally-wrapping
// accent-colored pills. The "Custom" option is implicit (no pill) — when
// nothing is selected, we use /api/framework-describe.
// ──────────────────────────────────────────────────────────────────────────────

export type FrameworkPillsProps = {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function FrameworkPills({ selectedId, onSelect }: FrameworkPillsProps) {
  const [query, setQuery] = useState("");
  const [frameworks, setFrameworks] = useState<AnyFrameworkModule[]>([]);

  useEffect(() => {
    const customs = loadCustomFrameworks();
    for (const cfg of customs) {
      if (!isDynamicFramework(cfg.id)) registerDynamicFramework(cfg);
    }
    setFrameworks(listFrameworks());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return frameworks;
    return frameworks.filter((fw) => {
      return (
        fw.label.toLowerCase().includes(q) ||
        fw.config.colNoun.toLowerCase().includes(q) ||
        fw.config.rowNoun.toLowerCase().includes(q) ||
        (fw.config.chatSubtitle ?? "").toLowerCase().includes(q)
      );
    });
  }, [query, frameworks]);

  return (
    <div className="w-full space-y-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search frameworks"
          className={[
            "w-full rounded-full glass border-0",
            "pl-9 pr-9 py-2 text-[12px] text-ink-primary placeholder:text-ink-muted",
            "focus:outline-none focus:ring-1 focus:ring-ink-primary/30 transition",
          ].join(" ")}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 grid place-items-center rounded-full text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06] transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 max-h-[120px] overflow-y-auto chat-scroll py-1">
        {/* Custom (default) pill — always first, shows as selected when nothing else is. */}
        <PillButton
          label="Custom"
          sub="Default"
          selected={selectedId === null}
          onClick={() => onSelect(null)}
          icon={<Sparkles className="h-3 w-3" />}
        />
        {filtered.map((fw) => (
          <PillButton
            key={fw.id}
            label={fw.label}
            selected={selectedId === fw.id}
            onClick={() => onSelect(fw.id)}
            isCustom={isDynamicFramework(fw.id)}
          />
        ))}
        {filtered.length === 0 && query && (
          <span className="text-[11px] text-ink-muted px-3 py-1.5">
            No frameworks match "{query}"
          </span>
        )}
      </div>
    </div>
  );
}

function PillButton({
  label,
  sub,
  selected,
  onClick,
  icon,
  isCustom = false,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  isCustom?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
        "text-[12px] font-medium transition-all",
        "border",
        selected
          ? "bg-[rgb(var(--accent))] text-white border-transparent shadow-card"
          : "bg-[rgb(var(--accent))]/[0.08] text-[rgb(var(--accent))] border-[rgb(var(--accent))]/20 hover:bg-[rgb(var(--accent))]/[0.14] hover:border-[rgb(var(--accent))]/30",
      ].join(" ")}
    >
      {icon}
      <span className="truncate max-w-[200px]">{label}</span>
      {sub && !selected && (
        <span className="font-mono text-[8px] uppercase tracking-wider opacity-60">
          {sub}
        </span>
      )}
      {isCustom && (
        <span className="font-mono text-[8px] uppercase tracking-wider opacity-60">
          custom
        </span>
      )}
    </button>
  );
}
