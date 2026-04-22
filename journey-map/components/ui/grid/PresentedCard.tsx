"use client";

import { useEffect, useRef, useState } from "react";
import { kindTheme } from "@/lib/row-kind-theme";
import { renderCellText } from "@/lib/cell-text";
import type { Card } from "@/lib/frameworks/universal/types";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";

// ──────────────────────────────────────────────────────────────────────────────
// PresentedCard — renders a Card as a horizontal bar, a dot, or a diamond
// based on its `meta.x` / `meta.y` / `meta.width` hints. This is the Phase C
// execution layer: the populate step, guided by renderingPlan on the config,
// sets these meta keys; the cell container detects them and routes the card
// through this component instead of the standard stacked GridCard.
//
// Inferred presentation modes:
//   meta.x absent                                → (not this component; use GridCard stacked)
//   meta.x present, meta.width === "0"           → diamond (milestone marker)
//   meta.x present, meta.width > 0               → horizontal bar (Gantt / roadmap task)
//   meta.x present, meta.width absent, meta.y    → dot (scatter / cartesian point)
//
// Interactions supported: click-to-select (additive via modifier keys),
// double-click-to-edit text inline, context menu (parent composes). Drag-to-
// reposition is intentionally NOT supported — positioned cards are agent-
// placed; user editing of position comes in a follow-on.
// ──────────────────────────────────────────────────────────────────────────────

export type PresentMode = "stacked" | "bar" | "dot" | "diamond";

/** Decide how a card renders.
 *
 *  Positioning via meta.x / meta.y is ONLY honored when the framework has
 *  explicitly opted in via `renderingPlan.cardOrientation` being
 *  "horizontal-bar" (Gantt), "dot" (Cartesian), or "mixed". On every other
 *  layout — grid, kanban, matrix without a Cartesian/Gantt plan — cards are
 *  force-stacked regardless of meta, so agent-emitted x/y becomes inert
 *  instead of producing dot/bullet renders in slots where positioning makes
 *  no sense. Freeform boards go through FreeformLayout and don't hit this
 *  path, so no special-case needed there. */
export function inferPresentMode(card: Card, config?: FrameworkConfig): PresentMode {
  const orientation = config?.renderingPlan?.cardOrientation;
  const allowPositioned =
    orientation === "horizontal-bar" ||
    orientation === "dot" ||
    orientation === "mixed";
  if (!allowPositioned) return "stacked";
  const m = card.meta;
  if (!m || m.x === undefined || m.x === null) return "stacked";
  const w = m.width;
  if (w === "0") return "diamond";
  if (w !== undefined && w !== null && w !== "") return "bar";
  return "dot";
}

export function hasAnyPositionedCard(cards: Card[], config?: FrameworkConfig): boolean {
  return cards.some((c) => inferPresentMode(c, config) !== "stacked");
}

type Props = {
  card: Card;
  themeKind: string;
  mode: "bar" | "dot" | "diamond";
  isSelected: boolean;
  agentBusy: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onTextChange: (id: string, text: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
};

function pxOrDefault(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function PresentedCard({
  card,
  themeKind,
  mode,
  isSelected,
  agentBusy,
  onSelect,
  onTextChange,
  onContextMenu,
}: Props) {
  const theme = kindTheme(themeKind);
  const x = pxOrDefault(card.meta?.x, 0);
  const y = pxOrDefault(card.meta?.y, 0);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(card.text);
  }, [card.text, editing]);

  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [editing]);

  // Outside-pointer commits the edit (canvas pan can swallow blur).
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
    return () =>
      document.removeEventListener("pointerdown", settleIfOutside, true);
  }, [editing]);

  function commitEdit() {
    setEditing(false);
    if (draft !== card.text) onTextChange(card.id, draft);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft(card.text);
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (editing) return;
    onSelect(card.id, e.metaKey || e.shiftKey || e.ctrlKey);
  }
  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (agentBusy) return;
    if (!editing) setEditing(true);
  }

  // Selection highlight: accent ring on the visual. Kept subtle so it reads
  // as a state change rather than overwhelming the bar/dot/diamond form.
  const selectedRing = isSelected ? "ring-2 ring-[rgb(var(--accent))]" : "";

  if (mode === "bar") {
    const width = pxOrDefault(card.meta?.width, 120);
    const height = pxOrDefault(card.meta?.height, editing ? 44 : 22);
    return (
      <div
        ref={rootRef}
        data-block
        data-card-el
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, card.id) : undefined}
        className={[
          "absolute z-10 rounded-md text-[11px] leading-tight px-2 py-0.5",
          "border border-border-medium shadow-card",
          theme.tintBg,
          "flex items-center overflow-hidden",
          "cursor-pointer hover:shadow-card-hover transition-shadow",
          selectedRing,
        ].join(" ")}
        style={{
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
        }}
        title={card.text}
      >
        {editing ? (
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="w-full h-full bg-transparent outline-none resize-none text-[11px] text-ink-primary"
          />
        ) : (
          <span className="truncate text-ink-primary">
            {renderCellText(card.text, themeKind)}
          </span>
        )}
      </div>
    );
  }

  if (mode === "diamond") {
    // Milestone marker. Center a rotated square at (x, y) with label below.
    return (
      <div
        ref={rootRef}
        data-block
        data-card-el
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={onContextMenu ? (e) => onContextMenu(e, card.id) : undefined}
        className={[
          "absolute z-10 flex flex-col items-center cursor-pointer",
          "hover:opacity-90 transition-opacity",
        ].join(" ")}
        style={{ left: `${x - 7}px`, top: `${y}px` }}
        title={card.text}
      >
        <span
          className={[
            "block rotate-45 border border-border-medium shadow-card",
            selectedRing,
          ].join(" ")}
          style={{
            width: 14,
            height: 14,
            background: "rgb(var(--accent) / 0.8)",
          }}
        />
        {editing ? (
          <input
            ref={taRef as unknown as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="mt-1 bg-white border border-border-medium rounded px-1 text-[10px] text-ink-primary outline-none min-w-[140px]"
          />
        ) : (
          <span className="mt-1 text-[10px] text-ink-secondary whitespace-nowrap max-w-[160px] truncate">
            {card.text}
          </span>
        )}
      </div>
    );
  }

  // dot mode
  void theme; // accent color comes from CSS var
  return (
    <div
      ref={rootRef}
      data-block
      data-card-el
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, card.id) : undefined}
      className={[
        "absolute z-10 flex items-center cursor-pointer group",
        "hover:opacity-90 transition-opacity",
      ].join(" ")}
      style={{ left: `${x - 5}px`, top: `${y - 5}px` }}
      title={card.text}
    >
      <span
        className={[
          "block rounded-full border-2 border-white shadow-card",
          selectedRing,
        ].join(" ")}
        style={{
          width: 10,
          height: 10,
          background: "rgb(var(--accent))",
        }}
      />
      {editing ? (
        <input
          ref={taRef as unknown as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          className="ml-1.5 bg-white border border-border-medium rounded px-1 text-[11px] text-ink-primary outline-none min-w-[180px]"
        />
      ) : (
        <span className="ml-1.5 text-[11px] text-ink-primary whitespace-nowrap max-w-[200px] truncate group-hover:text-ink-primary">
          {card.text}
        </span>
      )}
    </div>
  );
}
