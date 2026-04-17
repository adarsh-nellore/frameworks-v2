"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { kindTheme, themeKindForIndex } from "@/lib/row-kind-theme";
import type { UniversalMap, Card } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { Op } from "@/lib/frameworks/universal/ops";

// ──────────────────────────────────────────────────────────────────────────────
// FreeformLayout — Miro-style canvas that positions cards at user-controlled
// (x, y) pairs stored in card.meta.x / card.meta.y (as stringified pixels).
//
// Two kinds of cards live on the canvas:
//
//  1) Content cards — regular text notes. Default.
//  2) Shape cards  — cards with meta.shapeKind ∈ {diamond|rectangle|circle|
//     ellipse}. Rendered as SVG outlines BEHIND content cards. The card's
//     text becomes the shape label. Size is meta.shapeWidth × meta.shapeHeight.
//
// Both kinds reuse the universal Card model and universal ops (addCard,
// moveCard, editCard, removeCard, setCardMeta) — no new data model. The agent
// creates a Double Diamond by emitting two addCard ops with shapeKind="diamond"
// plus content cards with x/y inside them.
// ──────────────────────────────────────────────────────────────────────────────

const BOARD_W = 1600;
const BOARD_H = 1000;
const CARD_W = 260;
const CARD_H = 120;
const GRID_SNAP = 24;

function snap(n: number): number {
  return Math.round(n / GRID_SNAP) * GRID_SNAP;
}

export type ShapeKind = "diamond" | "rectangle" | "circle" | "ellipse";

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
  agentBusy,
  selectedCardIds,
  onCardSelect,
  onEditCard,
  onRemoveCard,
  commitOps,
}: FreeformLayoutProps) {
  const topLevel = map.cards.filter((c) => !c.parentCardId);
  const { shapes, notes } = useMemo(() => partitionCards(topLevel), [topLevel]);
  const positions = useMemo(() => resolvePositions(notes), [notes]);

  function commitPosition(cardId: string, x: number, y: number) {
    commitOps([
      { op: "setCardMeta", cardId, key: "x", value: String(snap(x)) },
      { op: "setCardMeta", cardId, key: "y", value: String(snap(y)) },
    ]);
  }

  function commitShape(cardId: string, x: number, y: number, width: number, height: number) {
    commitOps([
      { op: "setCardMeta", cardId, key: "x", value: String(snap(x)) },
      { op: "setCardMeta", cardId, key: "y", value: String(snap(y)) },
      { op: "setCardMeta", cardId, key: "shapeWidth", value: String(snap(width)) },
      { op: "setCardMeta", cardId, key: "shapeHeight", value: String(snap(height)) },
    ]);
  }

  function addCardInCluster(colId: string, rowId: string) {
    const clusterCards = notes.filter((c) => c.colId === colId && c.rowId === rowId);
    const baseIdx = clusterCards.length;
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

  function addShape(kind: ShapeKind) {
    const rowId = map.rows[0]?.id ?? "r1";
    const colId = map.cols[0]?.id ?? "c1";
    const defaults =
      kind === "circle" || kind === "ellipse"
        ? { w: 360, h: 360 }
        : kind === "diamond"
          ? { w: 500, h: 360 }
          : { w: 400, h: 280 };
    commitOps([
      {
        op: "addCard",
        colId,
        rowId,
        text: `New ${kind}`,
        meta: {
          shapeKind: kind,
          x: "240",
          y: "200",
          shapeWidth: String(defaults.w),
          shapeHeight: String(defaults.h),
        },
      },
    ]);
  }

  // Double-click on empty canvas → add a new note exactly where the user
  // clicked. Falls back to the first col/row so even a bare freeform board
  // (one default cluster) accepts the gesture. We ignore dbl-clicks that
  // originate on an existing card or floating UI so we don't create a phantom
  // card while editing.
  function handleCanvasDoubleClick(e: React.MouseEvent) {
    if (agentBusy) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-card-el]")) return;
    if (target?.closest?.("[data-floating]")) return;
    if (target?.closest?.("[data-freeform-shape]")) return;
    const host = e.currentTarget as HTMLDivElement;
    const rect = host.getBoundingClientRect();
    const localX = Math.max(24, Math.min(BOARD_W - CARD_W - 24, e.clientX - rect.left - CARD_W / 2));
    const localY = Math.max(24, Math.min(BOARD_H - CARD_H - 24, e.clientY - rect.top - 16));
    const colId = map.cols[0]?.id ?? "c1";
    const rowId = map.rows[0]?.id ?? "r1";
    commitOps([
      {
        op: "addCard",
        colId,
        rowId,
        text: "",
        meta: { x: String(snap(localX)), y: String(snap(localY)) },
      },
    ]);
  }

  return (
    <div
      className="relative"
      style={{ width: BOARD_W, height: BOARD_H }}
      data-stage
      onDoubleClick={handleCanvasDoubleClick}
    >
      {/* Toolbar — cluster chips + shape palette */}
      <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-1.5 max-w-[85%]" data-floating>
        {map.cols.flatMap((col) =>
          map.rows.map((row) => {
            const theme = kindTheme(row.kind ?? col.kind ?? themeKindForIndex(map.cols.indexOf(col)));
            const count = notes.filter((c) => c.colId === col.id && c.rowId === row.id).length;
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

        <span className="h-5 w-px bg-border-soft mx-0.5 self-center" aria-hidden />

        {(["rectangle", "diamond", "circle", "ellipse"] as ShapeKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={agentBusy}
            onClick={() => addShape(kind)}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1",
              "text-[11px] text-ink-secondary border border-border-soft",
              "hover:border-border-medium hover:text-ink-primary hover:bg-white/80",
              "transition-colors bg-white/50",
            ].join(" ")}
            title={`Add ${kind} shape`}
          >
            <ShapeGlyph kind={kind} />
            <span className="capitalize">{kind}</span>
          </button>
        ))}
      </div>

      {/* Dotted grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(var(--dot-grid) / 0.06) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Shape cards FIRST (behind content cards) */}
      {shapes.map((card) => (
        <FreeformShapeCard
          key={card.id}
          card={card}
          selected={selectedCardIds.has(card.id)}
          disabled={agentBusy}
          onSelect={(additive) => onCardSelect(card.id, additive)}
          onMove={(x, y) => commitPosition(card.id, x, y)}
          onResize={(x, y, w, h) => commitShape(card.id, x, y, w, h)}
          onText={(text) => onEditCard(card.id, text)}
          onRemove={() => onRemoveCard(card.id)}
        />
      ))}

      {/* Content cards on top */}
      {notes.map((card) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Partition / position helpers
// ─────────────────────────────────────────────────────────────────────────────

function partitionCards(cards: Card[]): { shapes: Card[]; notes: Card[] } {
  const shapes: Card[] = [];
  const notes: Card[] = [];
  for (const c of cards) {
    if (isShapeCard(c)) shapes.push(c);
    else notes.push(c);
  }
  return { shapes, notes };
}

function isShapeCard(card: Card): boolean {
  const k = card.meta?.shapeKind;
  return k === "diamond" || k === "rectangle" || k === "circle" || k === "ellipse";
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Content card (unchanged behavior from before — drag, double-click edit)
// ─────────────────────────────────────────────────────────────────────────────

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
    const target = e.target as HTMLElement;
    if (target.closest("button,textarea,input,a,[role='button']")) return;
    e.stopPropagation();
    const startCx = e.clientX;
    const startCy = e.clientY;
    const startX = x;
    const startY = y;
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
        zIndex: 2,
      }}
      className={[
        "group rounded-xl bg-surface shadow-card hover:shadow-card-hover",
        "border-l-[3px]",
        theme.accentBorder,
        selected ? "ring-2 ring-[rgb(var(--accent))]/60" : "ring-1 ring-border-soft/60",
        "transition-shadow",
      ].join(" ")}
    >
      <div className="relative px-3 py-2.5">
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

// ─────────────────────────────────────────────────────────────────────────────
// Shape card — diamond, rectangle, circle, ellipse outlines that act as
// background regions. Draggable via body, resizable via bottom-right corner,
// deletable via X (when selected). Label is card.text, editable inline.
// ─────────────────────────────────────────────────────────────────────────────

type FreeformShapeCardProps = {
  card: Card;
  selected: boolean;
  disabled: boolean;
  onSelect: (additive: boolean) => void;
  onMove: (x: number, y: number) => void;
  onResize: (x: number, y: number, width: number, height: number) => void;
  onText: (text: string) => void;
  onRemove: () => void;
};

function FreeformShapeCard({
  card,
  selected,
  disabled,
  onSelect,
  onMove,
  onResize,
  onText,
  onRemove,
}: FreeformShapeCardProps) {
  const kind = (card.meta?.shapeKind ?? "rectangle") as ShapeKind;
  const baseX = Number(card.meta?.x ?? 120);
  const baseY = Number(card.meta?.y ?? 120);
  const baseW = Number(card.meta?.shapeWidth ?? 400);
  const baseH = Number(card.meta?.shapeHeight ?? 280);

  const [ghost, setGhost] = useState<{
    x: number; y: number; w: number; h: number;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(card.text);
  }, [card.text, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const x = ghost?.x ?? baseX;
  const y = ghost?.y ?? baseY;
  const w = ghost?.w ?? baseW;
  const h = ghost?.h ?? baseH;

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || editing) return;
    if (e.button !== 0 && e.pointerType !== "touch") return;
    const target = e.target as HTMLElement;
    if (target.closest("button,input,[role='button'],[data-resize-handle]")) return;
    e.stopPropagation();
    const startCx = e.clientX;
    const startCy = e.clientY;
    const scale = findCanvasScale(e.currentTarget);
    let moved = false;
    function onMoveEv(ev: PointerEvent) {
      const dx = (ev.clientX - startCx) / scale;
      const dy = (ev.clientY - startCy) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      setGhost({ x: baseX + dx, y: baseY + dy, w: baseW, h: baseH });
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (moved) {
        const dx = (ev.clientX - startCx) / scale;
        const dy = (ev.clientY - startCy) / scale;
        onMove(baseX + dx, baseY + dy);
      } else {
        onSelect(ev.shiftKey);
      }
      setGhost(null);
    }
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.button !== 0 && e.pointerType !== "touch") return;
    e.stopPropagation();
    e.preventDefault();
    const startCx = e.clientX;
    const startCy = e.clientY;
    const scale = findCanvasScale(e.currentTarget);
    function onMoveEv(ev: PointerEvent) {
      const dx = (ev.clientX - startCx) / scale;
      const dy = (ev.clientY - startCy) / scale;
      setGhost({
        x: baseX,
        y: baseY,
        w: Math.max(80, baseW + dx),
        h: Math.max(80, baseH + dy),
      });
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const dx = (ev.clientX - startCx) / scale;
      const dy = (ev.clientY - startCy) / scale;
      onResize(baseX, baseY, Math.max(80, baseW + dx), Math.max(80, baseH + dy));
      setGhost(null);
    }
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <div
      data-block
      data-shape-card
      data-card-id={card.id}
      onPointerDown={startDrag}
      onDoubleClick={() => !disabled && setEditing(true)}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        cursor: ghost ? "grabbing" : "grab",
        zIndex: 1,
      }}
      className={[
        "group select-none",
        selected ? "outline outline-2 outline-[rgb(var(--accent))]/40 outline-offset-2 rounded-md" : "",
      ].join(" ")}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
        <ShapePath kind={kind} w={w} h={h} selected={selected} />
      </svg>

      {/* Label anchored at the top of the shape bounding box */}
      <div
        className="absolute left-1/2 -translate-x-1/2 px-2 py-0.5"
        style={{ top: -14 }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft !== card.text) onText(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                setDraft(card.text);
                setEditing(false);
              }
            }}
            className="bg-white/90 outline-none text-[12px] font-medium text-ink-primary px-2 py-0.5 rounded-md border border-border-soft"
          />
        ) : (
          <span
            className={[
              "inline-block bg-white/80 px-2 py-0.5 rounded-md",
              "text-[11px] font-medium text-ink-secondary",
              "border border-border-soft backdrop-blur",
            ].join(" ")}
          >
            {card.text || <span className="italic text-ink-muted">Shape</span>}
          </span>
        )}
      </div>

      {/* Remove button (top-right of bbox) */}
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={[
          "absolute rounded-md w-5 h-5 grid place-items-center",
          "text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-opacity",
          "bg-white/80 border border-border-soft backdrop-blur",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        ].join(" ")}
        style={{ top: -14, right: -10 }}
        aria-label="Remove shape"
        title="Remove shape"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Bottom-right resize handle — visible when selected */}
      {selected && (
        <div
          data-resize-handle
          onPointerDown={startResize}
          className={[
            "absolute w-3 h-3 rounded-sm bg-[rgb(var(--accent))] border border-white shadow-sm",
            "cursor-nwse-resize",
          ].join(" ")}
          style={{ right: -6, bottom: -6 }}
          aria-label="Resize shape"
        />
      )}
    </div>
  );
}

// Shape glyph used in the toolbar.
function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  if (kind === "circle") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (kind === "ellipse") {
    return (
      <svg width="12" height="8" viewBox="0 0 12 8">
        <ellipse cx="6" cy="4" rx="5" ry="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (kind === "diamond") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <polygon points="5,1 9,5 5,9 1,5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="1" y="2" width="8" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function ShapePath({
  kind,
  w,
  h,
  selected,
}: {
  kind: ShapeKind;
  w: number;
  h: number;
  selected: boolean;
}) {
  const stroke = selected
    ? "rgb(var(--accent) / 0.75)"
    : "rgb(var(--accent) / 0.45)";
  const fill = selected
    ? "rgb(var(--accent) / 0.06)"
    : "rgb(var(--accent) / 0.035)";
  const strokeWidth = 1.6;
  if (kind === "circle" || kind === "ellipse") {
    return (
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={w / 2 - 2}
        ry={h / 2 - 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  if (kind === "diamond") {
    return (
      <polygon
        points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  // rectangle
  return (
    <rect
      x={2}
      y={2}
      width={w - 4}
      height={h - 4}
      rx={8}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}
