"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { kindTheme, themeKindForIndex } from "@/lib/row-kind-theme";
import type { UniversalMap, Card } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { Op } from "@/lib/frameworks/universal/ops";

// ──────────────────────────────────────────────────────────────────────────────
// FreeformLayout — Miro-style canvas that positions cards at user-controlled
// (x, y) pairs stored in card.meta.x / card.meta.y (as stringified pixels).
//
// Cols/rows still exist in the data model (so AI ops, copilot hints, and the
// universal prompt keep working), but they're shown here as small "cluster"
// pills in the top-left — the user isn't forced to organize by them. AI
// addCard/moveCard ops still land cards into a (col, row) cell; the layout
// flows them into a default position if they have no (x, y).
// ──────────────────────────────────────────────────────────────────────────────

const BOARD_W = 1400;
const BOARD_H = 900;
const CARD_W = 260;
const CARD_H = 120;

type FreeformLayoutProps = {
  map: UniversalMap;
  config: FrameworkConfig;
  agentBusy: boolean;
  selectedCardIds: Set<string>;
  onCardSelect: (cardId: string, additive: boolean) => void;
  onEditCard: (cardId: string, text: string) => void;
  onRemoveCard: (cardId: string) => void;
  commitOps: (ops: Op[]) => void;
};

export function FreeformLayout({
  map,
  config,
  agentBusy,
  selectedCardIds,
  onCardSelect,
  onEditCard,
  onRemoveCard,
  commitOps,
}: FreeformLayoutProps) {
  const topLevel = map.cards.filter((c) => !c.parentCardId);
  const positions = resolvePositions(topLevel);

  function commitPosition(cardId: string, x: number, y: number) {
    commitOps([
      { op: "setCardMeta", cardId, key: "x", value: String(Math.round(x)) },
      { op: "setCardMeta", cardId, key: "y", value: String(Math.round(y)) },
    ]);
  }

  function addCardInCluster(colId: string, rowId: string) {
    const clusterCards = topLevel.filter((c) => c.colId === colId && c.rowId === rowId);
    const baseIdx = clusterCards.length;
    // Nudge new cards so they don't stack on top of existing ones.
    const x = 120 + (baseIdx % 5) * (CARD_W + 24);
    const y = 120 + Math.floor(baseIdx / 5) * (CARD_H + 24);
    commitOps([
      {
        op: "addCard",
        colId,
        rowId,
        text: "New note",
        meta: { x: String(x), y: String(y) },
      },
    ]);
  }

  return (
    <div className="relative" style={{ width: BOARD_W, height: BOARD_H }} data-stage>
      {/* Cluster chips — small pills in the top-left indicating col × row groupings.
          Click "+" to add a card into that cluster. */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 max-w-[70%]" data-floating>
        {map.cols.flatMap((col) =>
          map.rows.map((row) => {
            const theme = kindTheme(row.kind ?? col.kind ?? themeKindForIndex(map.cols.indexOf(col)));
            const count = topLevel.filter((c) => c.colId === col.id && c.rowId === row.id).length;
            return (
              <button
                key={`${col.id}-${row.id}`}
                type="button"
                disabled={agentBusy}
                onClick={() => addCardInCluster(col.id, row.id)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-1",
                  "text-[11px] text-ink-secondary border border-border-soft",
                  "hover:border-border-medium hover:text-ink-primary hover:bg-white/80",
                  "transition-colors",
                  theme.tintBg,
                ].join(" ")}
                title={`Add card to ${col.label} · ${row.label}`}
              >
                <span className="font-medium">{col.label}</span>
                {map.rows.length > 1 && <span className="text-ink-muted">·</span>}
                {map.rows.length > 1 && <span>{row.label}</span>}
                <span className="font-mono text-[9px] text-ink-muted">{count}</span>
                <Plus className="h-2.5 w-2.5 text-ink-muted" />
              </button>
            );
          })
        )}
      </div>

      {/* Dotted grid background (visual only) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(var(--dot-grid) / 0.06) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Cards */}
      {topLevel.map((card) => {
        const pos = positions.get(card.id) ?? { x: 120, y: 180 };
        const theme = kindTheme(
          map.rows.find((r) => r.id === card.rowId)?.kind ??
            map.cols.find((c) => c.id === card.colId)?.kind ??
            "default"
        );
        const colLabel = map.cols.find((c) => c.id === card.colId)?.label ?? "";
        return (
          <FreeformCard
            key={card.id}
            card={card}
            x={pos.x}
            y={pos.y}
            colLabel={colLabel}
            theme={theme}
            selected={selectedCardIds.has(card.id)}
            disabled={agentBusy}
            onSelect={(additive) => onCardSelect(card.id, additive)}
            onMove={(x, y) => commitPosition(card.id, x, y)}
            onText={(text) => onEditCard(card.id, text)}
            onRemove={() => onRemoveCard(card.id)}
          />
        );
      })}
    </div>
  );
}

// Compute x/y for each card — use explicit meta.x/y if present, otherwise
// auto-flow in a loose grid so a fresh map still looks sensible.
function resolvePositions(cards: Card[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  let autoIdx = 0;
  for (const c of cards) {
    const mx = Number(c.meta?.x ?? NaN);
    const my = Number(c.meta?.y ?? NaN);
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      out.set(c.id, { x: mx, y: my });
      continue;
    }
    const col = autoIdx % 4;
    const row = Math.floor(autoIdx / 4);
    out.set(c.id, { x: 140 + col * (CARD_W + 32), y: 180 + row * (CARD_H + 24) });
    autoIdx++;
  }
  return out;
}

type FreeformCardProps = {
  card: Card;
  x: number;
  y: number;
  colLabel: string;
  theme: ReturnType<typeof kindTheme>;
  selected: boolean;
  disabled: boolean;
  onSelect: (additive: boolean) => void;
  onMove: (x: number, y: number) => void;
  onText: (text: string) => void;
  onRemove: () => void;
};

function FreeformCard({
  card,
  x,
  y,
  colLabel,
  theme,
  selected,
  disabled,
  onSelect,
  onMove,
  onText,
  onRemove,
}: FreeformCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(card.text);
  }, [card.text, editing]);

  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [editing]);

  const displayX = ghost?.x ?? x;
  const displayY = ghost?.y ?? y;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || editing) return;
    if (e.button !== 0 && e.pointerType !== "touch") return;
    // Ignore drags started on interactive controls inside the card.
    const target = e.target as HTMLElement;
    if (target.closest("button,textarea,input,a,[role='button']")) return;
    e.stopPropagation();
    const startCx = e.clientX;
    const startCy = e.clientY;
    const startX = x;
    const startY = y;
    // Walk up to the nearest ancestor Canvas transform to read the scale.
    const scaleMatch = findCanvasScale(e.currentTarget);
    let moved = false;

    function onMoveEv(ev: PointerEvent) {
      const dx = (ev.clientX - startCx) / scaleMatch;
      const dy = (ev.clientY - startCy) / scaleMatch;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      setGhost({ x: startX + dx, y: startY + dy });
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (moved) {
        const dx = (ev.clientX - startCx) / scaleMatch;
        const dy = (ev.clientY - startCy) / scaleMatch;
        onMove(startX + dx, startY + dy);
      } else {
        onSelect(ev.shiftKey);
      }
      setGhost(null);
    }
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <div
      data-block
      data-card-id={card.id}
      onPointerDown={onPointerDown}
      onDoubleClick={() => !disabled && setEditing(true)}
      style={{
        position: "absolute",
        left: displayX,
        top: displayY,
        width: CARD_W,
        cursor: ghost ? "grabbing" : editing ? "text" : "grab",
      }}
      className={[
        "rounded-xl bg-surface shadow-card hover:shadow-card-hover",
        "border-l-[3px]",
        theme.accentBorder,
        selected ? "ring-2 ring-[rgb(var(--accent))]/60" : "ring-1 ring-border-soft/60",
        "transition-shadow",
      ].join(" ")}
    >
      <div className="relative px-3 py-2.5">
        {/* Cluster tag */}
        {colLabel && (
          <div
            className={[
              "inline-flex items-center rounded-full px-1.5 py-0.5 mb-1.5",
              "text-[8px] font-mono uppercase tracking-widest",
              theme.chipBg,
              theme.chipText,
            ].join(" ")}
          >
            {colLabel}
          </div>
        )}

        {/* Text / editor */}
        {editing ? (
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft !== card.text) onText(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
              if (e.key === "Escape") {
                setDraft(card.text);
                setEditing(false);
              }
            }}
            rows={3}
            className="w-full resize-none bg-transparent outline-none text-[13px] leading-snug text-ink-primary"
          />
        ) : (
          <div className="text-[13px] leading-snug text-ink-primary whitespace-pre-wrap">
            {card.text || <span className="text-ink-muted italic">Click to edit</span>}
          </div>
        )}

        {/* Remove button — visible when selected, on hover otherwise. */}
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={[
            "absolute top-1.5 right-1.5 rounded-md w-5 h-5 grid place-items-center",
            "text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 hover:opacity-100",
          ].join(" ")}
          aria-label="Remove card"
          title="Remove card"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/** Walk up to the nearest Canvas transform root and read its scale(). */
function findCanvasScale(startNode: HTMLElement): number {
  let node: HTMLElement | null = startNode.parentElement;
  while (node) {
    const tr = node.style?.transform;
    if (tr && tr.includes("scale(")) {
      const m = tr.match(/scale\(([-0-9.]+)\)/);
      if (m) {
        const n = parseFloat(m[1]);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    node = node.parentElement;
  }
  return 1;
}
