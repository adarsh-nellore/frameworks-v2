"use client";

import { useMemo } from "react";
import { Plus, X } from "lucide-react";
import { kindTheme, themeKindForIndex } from "@/lib/row-kind-theme";
import type { UniversalMap, Card } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { Op } from "@/lib/frameworks/universal/ops";

// ──────────────────────────────────────────────────────────────────────────────
// DiamondLayout — visual for the Double Diamond (Discover → Define → Develop →
// Deliver). Two adjacent diamonds; each diamond splits into a diverge phase
// (left triangle) and a converge phase (right triangle). Cards stack inside
// each phase's region.
//
// Rendering strategy: SVG diamond outlines live behind a grid of 4 phase
// columns. The SVG is decorative chrome; interaction (select, edit, add,
// remove) happens on the column overlays.
//
// Works best with exactly 4 cols. With <4 or >4 cols, the SVG still renders
// but columns scale proportionally — it still reads as a "diamond flow"
// shape even if the Double Diamond semantics break.
// ──────────────────────────────────────────────────────────────────────────────

const BOARD_W = 1280;
const BOARD_H = 640;
const DIAMOND_H = 360;
const DIAMOND_GAP = 60;

type DiamondLayoutProps = {
  map: UniversalMap;
  config: FrameworkConfig;
  agentBusy: boolean;
  selectedCardIds: Set<string>;
  onCardSelect: (cardId: string, additive: boolean) => void;
  onEditCard: (cardId: string, text: string) => void;
  onRemoveCard: (cardId: string) => void;
  onAddCardAt: (colId: string, rowId: string) => void;
  commitOps: (ops: Op[]) => void;
};

export function DiamondLayout({
  map,
  agentBusy,
  selectedCardIds,
  onCardSelect,
  onEditCard,
  onRemoveCard,
  onAddCardAt,
}: DiamondLayoutProps) {
  // All top-level cards (sub-items are not first-class on diamond boards).
  const topLevel = useMemo(() => map.cards.filter((c) => !c.parentCardId), [map.cards]);
  // Rows are effectively ignored — use r1 as the catchall. Most diamond
  // frameworks only have one row anyway.
  const defaultRowId = map.rows[0]?.id ?? "r1";

  const cols = map.cols;
  const phases = cols.length;
  const colWidth = (BOARD_W - DIAMOND_GAP) / Math.max(phases, 1);
  const firstHalf = Math.ceil(phases / 2);
  const diamondCenterY = DIAMOND_H / 2 + 20;

  const leftDiamond = buildDiamond(0, firstHalf * colWidth, diamondCenterY, DIAMOND_H);
  const rightDiamond = buildDiamond(
    firstHalf * colWidth + DIAMOND_GAP,
    phases * colWidth + DIAMOND_GAP,
    diamondCenterY,
    DIAMOND_H
  );

  return (
    <div
      data-stage
      className="relative"
      style={{ width: BOARD_W, height: BOARD_H }}
    >
      {/* Decorative diamond outlines */}
      <svg
        className="absolute inset-0 pointer-events-none"
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        preserveAspectRatio="none"
      >
        <polygon
          points={leftDiamond.points}
          fill="rgb(var(--accent) / 0.03)"
          stroke="rgb(var(--accent) / 0.35)"
          strokeWidth="1.5"
        />
        <polygon
          points={rightDiamond.points}
          fill="rgb(var(--accent) / 0.03)"
          stroke="rgb(var(--accent) / 0.35)"
          strokeWidth="1.5"
        />
        {/* Flow arrows between diamonds */}
        <line
          x1={leftDiamond.rightX}
          y1={diamondCenterY}
          x2={rightDiamond.leftX}
          y2={diamondCenterY}
          stroke="rgb(var(--accent) / 0.4)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>

      {/* Phase columns overlaid on the diamonds */}
      <div className="absolute inset-0">
        {cols.map((col, idx) => {
          const kind = col.kind ?? themeKindForIndex(idx);
          const theme = kindTheme(kind);
          // Left-edge of this column, compensating for the gap between diamonds
          const baseX = idx * colWidth + (idx >= firstHalf ? DIAMOND_GAP : 0);
          const colCards = topLevel.filter((c) => c.colId === col.id);

          return (
            <div
              key={col.id}
              className="absolute flex flex-col items-center"
              style={{
                left: baseX,
                top: 0,
                width: colWidth,
                height: BOARD_H,
              }}
            >
              {/* Phase label above the diamond */}
              <div className="mt-1 text-center">
                <div
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                    "text-[11px] font-medium",
                    theme.chipBg,
                    theme.chipText,
                  ].join(" ")}
                >
                  <span>{col.label}</span>
                  <span className="font-mono text-[9px] opacity-60">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                </div>
              </div>

              {/* Cards stacked in the phase region */}
              <div
                className="mt-3 w-[85%] flex flex-col gap-2 items-stretch overflow-hidden"
                style={{
                  // Trim the stack so it visually sits inside the diamond's rhombus.
                  maxHeight: DIAMOND_H - 16,
                }}
              >
                {colCards.length === 0 ? (
                  <button
                    type="button"
                    disabled={agentBusy}
                    onClick={() => onAddCardAt(col.id, defaultRowId)}
                    className={[
                      "rounded-lg border border-dashed border-border-medium",
                      "px-2.5 py-2 text-[11px] text-ink-muted",
                      "hover:border-ink-primary/40 hover:text-ink-primary hover:bg-white/70",
                      "transition-colors inline-flex items-center justify-center gap-1",
                    ].join(" ")}
                  >
                    <Plus className="h-3 w-3" />
                    Add to {col.label}
                  </button>
                ) : (
                  <>
                    {colCards.map((card) => (
                      <DiamondCard
                        key={card.id}
                        card={card}
                        theme={theme}
                        selected={selectedCardIds.has(card.id)}
                        disabled={agentBusy}
                        onSelect={(additive) => onCardSelect(card.id, additive)}
                        onText={(t) => onEditCard(card.id, t)}
                        onRemove={() => onRemoveCard(card.id)}
                      />
                    ))}
                    <button
                      type="button"
                      disabled={agentBusy}
                      onClick={() => onAddCardAt(col.id, defaultRowId)}
                      className={[
                        "rounded-lg border border-dashed border-border-soft",
                        "px-2 py-1 text-[10px] text-ink-muted",
                        "hover:border-border-medium hover:text-ink-primary hover:bg-white/70",
                        "transition-colors inline-flex items-center justify-center gap-1",
                      ].join(" ")}
                    >
                      <Plus className="h-2.5 w-2.5" />
                      Card
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Large diamond pair caption — sets the expectation for users */}
      <div
        data-floating
        className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted"
      >
        Diverge → Converge · Diverge → Converge
      </div>
    </div>
  );
}

function buildDiamond(leftX: number, rightX: number, centerY: number, height: number) {
  const topY = centerY - height / 2;
  const bottomY = centerY + height / 2;
  const centerX = (leftX + rightX) / 2;
  return {
    leftX,
    rightX,
    points: `${leftX},${centerY} ${centerX},${topY} ${rightX},${centerY} ${centerX},${bottomY}`,
  };
}

type DiamondCardProps = {
  card: Card;
  theme: ReturnType<typeof kindTheme>;
  selected: boolean;
  disabled: boolean;
  onSelect: (additive: boolean) => void;
  onText: (text: string) => void;
  onRemove: () => void;
};

function DiamondCard({
  card,
  theme,
  selected,
  disabled,
  onSelect,
  onText,
  onRemove,
}: DiamondCardProps) {
  return (
    <div
      data-block
      data-card-id={card.id}
      onClick={(e) => {
        if (disabled) return;
        // Skip bubbling from internal buttons + inputs.
        const target = e.target as HTMLElement;
        if (target.closest("button,textarea,input,[role='button']")) return;
        onSelect(e.shiftKey);
      }}
      className={[
        "group relative rounded-lg bg-surface shadow-card hover:shadow-card-hover",
        "border-l-[3px]",
        theme.accentBorder,
        selected ? "ring-2 ring-[rgb(var(--accent))]/60" : "ring-1 ring-border-soft/60",
        "transition-shadow cursor-pointer",
      ].join(" ")}
    >
      <div className="px-2.5 py-2 pr-7">
        <EditableText
          value={card.text}
          disabled={disabled}
          onCommit={(t) => onText(t)}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={[
          "absolute top-1.5 right-1.5 rounded-md w-4 h-4 grid place-items-center",
          "text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        ].join(" ")}
        aria-label="Remove card"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function EditableText({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}) {
  return (
    <div
      role="textbox"
      tabIndex={disabled ? -1 : 0}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const next = e.currentTarget.textContent ?? "";
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = value;
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      className={[
        "text-[12px] leading-snug text-ink-primary outline-none",
        "whitespace-pre-wrap min-h-[1.2em]",
      ].join(" ")}
    >
      {value}
    </div>
  );
}
