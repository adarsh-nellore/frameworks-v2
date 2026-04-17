"use client";

import { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CornerUpLeft, Plus, X } from "lucide-react";
import { kindTheme } from "@/lib/row-kind-theme";
import { renderCellText } from "@/lib/cell-text";

// A kind is "known" (and thus worth rendering an icon for) when it maps to a
// specific icon in the theme lookup. Neutral / default kinds render as an
// empty Square which reads as UI chrome, so we hide the chip in those cases.
const KNOWN_KINDS = new Set([
  "actions", "touchpoints", "thoughts", "emotions", "pain_points",
  "opportunities", "metrics", "stakeholders", "systems", "channels",
  "decisions", "artifacts", "functional_jobs", "emotional_jobs",
  "social_jobs", "desired_outcomes", "current_solutions", "context_triggers",
  "hiring_criteria", "firing_criteria", "observation", "quote", "insight",
  "need", "theme", "ungrouped", "subject", "competitor", "criterion",
  "quadrant_high", "quadrant_low",
]);
function hasKindIcon(kind: string | undefined): boolean {
  if (!kind) return false;
  return KNOWN_KINDS.has(kind.toLowerCase());
}
import type { Card, CardMeta, ConnectorAnchor } from "@/lib/frameworks/universal/types";
import type { CardMetaField } from "@/lib/frameworks/universal/config";
import { useConnectorUI } from "./grid/connector-ui-context";

type Props = {
  card: Card;
  /** Drives accent color, icon, and highlight tints. From row.kind or col.kind. */
  themeKind: string;
  /** Optional small numeric label (e.g. card index within a position). */
  number?: number;
  /** Per-card meta fields the user can edit (priority chip, etc.). */
  metaFields?: CardMetaField[];

  // ── Layout ─────────────────────────────────────────────────────────────────
  /** "grid" = fixed 280px width (journey map style); "stack" = flex card in kanban/matrix stacks */
  layoutMode: "grid" | "stack";

  // ── State ──────────────────────────────────────────────────────────────────
  isSelected: boolean;
  isInDragGroup: boolean;
  agentBusy: boolean;
  draggable?: boolean;

  // ── Sub-items (one level of nesting) ──────────────────────────────────────
  /** Children of this card. Rendered as compact bullets beneath the body. */
  subItems?: Card[];
  /** Currently selected sub-item ids. */
  selectedChildIds?: Set<string>;
  /** Click handler for a sub-item. */
  onChildSelect?: (childId: string, additive: boolean) => void;
  /** Commit an edit to a sub-item's text. */
  onChildTextChange?: (childId: string, text: string) => void;
  /** Remove a sub-item. */
  onChildRemove?: (childId: string) => void;
  /** Promote a sub-item to top-level (reparentCard → null). */
  onChildPromote?: (childId: string) => void;
  /** Add a new sub-item under this card. */
  onAddChild?: (parentCardId: string) => void;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  onSelect: (cardId: string, additive: boolean) => void;
  onTextChange: (cardId: string, text: string) => void;
  onMetaChange?: (cardId: string, key: string, value: string | null) => void;
  onRemove?: (cardId: string) => void;
};

export function GridCard({
  card,
  themeKind,
  number,
  metaFields,
  layoutMode,
  isSelected,
  isInDragGroup,
  agentBusy,
  draggable = true,
  subItems,
  selectedChildIds,
  onChildSelect,
  onChildTextChange,
  onChildRemove,
  onChildPromote,
  onAddChild,
  onSelect,
  onTextChange,
  onMetaChange,
  onRemove,
}: Props) {
  const drag = useDraggable({
    id: card.id,
    data: { kind: "card", cardId: card.id, fromColId: card.colId, fromRowId: card.rowId },
    disabled: agentBusy || !draggable,
  });
  const connectorUI = useConnectorUI();
  const drop = useDroppable({
    id: `card:${card.id}`,
    data: { kind: "card", cardId: card.id, colId: card.colId, rowId: card.rowId },
  });

  const setRef = (node: HTMLDivElement | null) => {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(card.text);
  }, [card.text, editing]);

  useEffect(() => {
    if (agentBusy && editing) {
      setEditing(false);
      setDraft(card.text);
    }
  }, [agentBusy, editing, card.text]);

  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [editing]);

  // Outside-pointer commits the edit, since canvas pan can swallow blur.
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
    return () => document.removeEventListener("pointerdown", settleIfOutside, true);
  }, [editing]);

  const isDragging = drag.isDragging;
  const isGhost = isDragging || isInDragGroup;
  const showOver = drop.isOver && !isGhost;
  const theme = kindTheme(themeKind);
  const Icon = theme.Icon;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    const additive = e.metaKey || e.shiftKey || e.ctrlKey;
    if (additive) {
      onSelect(card.id, true);
      return;
    }
    if (agentBusy) {
      onSelect(card.id, false);
      return;
    }
    onSelect(card.id, false);
    if (!editing) setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (draft !== card.text) onTextChange(card.id, draft);
  }
  function cancel() {
    setEditing(false);
    setDraft(card.text);
  }

  // Card shows an accent left stripe only when selected or explicitly flagged
  // (`card.meta.flag === 'accent'`). Unflagged cards keep a uniform soft border
  // on all sides so the design system's surface + ink palette drives the look.
  const isFlagged = card.meta?.flag === "accent";
  const showStripe = isSelected || isFlagged;
  const idleClasses = [
    theme.tintBg,
    "border-border-soft shadow-card hover:shadow-card-hover hover:border-border-medium",
    showStripe ? "border-l-[3px] border-accent" : "",
  ].filter(Boolean).join(" ");

  const setRootRef = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRef(node);
  };

  // Layout dimensions are CONTENT-ADAPTIVE.
  // - Width: grid mode caps at 280px (so columns align), stack mode fills its container
  // - Height: small minimum so cards grow from their content; long text wraps naturally
  // - Padding: stack mode is slightly denser since kanban/matrix stack many cards
  const widthClass = layoutMode === "grid" ? "w-[280px] shrink-0" : "w-full";
  const minHeight = layoutMode === "grid" ? "min-h-[88px]" : "min-h-[64px]";
  const padding = layoutMode === "grid" ? "p-3 pl-3.5" : "p-2.5 pl-3";
  const editPadding = layoutMode === "grid" ? "p-3 pl-3.5" : "p-2.5 pl-3";

  const meta: CardMeta = card.meta ?? {};

  return (
    <div
      data-block
      data-card-el
      data-card-id={card.id}
      ref={setRootRef}
      className={widthClass}
      style={isDragging ? { opacity: 0.3 } : undefined}
      onClick={handleClick}
      {...(editing ? {} : drag.listeners)}
      {...(editing ? {} : drag.attributes)}
    >
      <div
        data-card-face
        {...((isSelected) && !isGhost ? { "data-card-sel": "" } : {})}
        className={[
          "group relative rounded-xl border flex flex-col select-none transition-shadow",
          minHeight,
          padding,
          editing ? "cursor-text" : draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          isGhost
            ? "bg-surface border-border-medium shadow-card"
            : showOver
              ? "bg-accent/[0.06] border-accent/55 ring-2 ring-accent/35 ring-inset"
              : isSelected
                ? "bg-surface border-accent border-l-[3px] ring-2 ring-accent ring-offset-2 ring-offset-canvas shadow-card-hover"
                : idleClasses,
        ].join(" ")}
      >
        {/* Top row: kind chip + numeric anchor. The chip is hidden when the
            card's theme is the neutral default (no specific kind) — in that
            case the chip was just an empty Square icon that looked like a
            placeholder checkbox. Framework-specific kinds (observation,
            pain_points, etc.) still get their icon. */}
        {(hasKindIcon(themeKind) || number !== undefined) && (
          <div className="flex items-center justify-between mb-2">
            {hasKindIcon(themeKind) ? (
              <span
                className={[
                  "inline-flex h-6 w-6 items-center justify-center rounded-md",
                  theme.chipBg,
                ].join(" ")}
              >
                <Icon className={`h-3.5 w-3.5 ${theme.chipText}`} />
              </span>
            ) : (
              <span />
            )}
            {number !== undefined && (
              <span className="font-mono text-[9px] tabular-nums tracking-[0.18em] text-ink-muted bg-ink-primary/[0.04] rounded-md px-1.5 py-0.5 group-hover:text-ink-secondary transition-colors">
                {number.toString().padStart(2, "0")}
              </span>
            )}
          </div>
        )}

        {editing ? (
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className={[
              "absolute inset-0 w-full h-full rounded-xl bg-white text-ink-primary",
              "text-[12px] leading-snug resize-none focus:outline-none border border-ink-primary",
              "shadow-card-hover",
              editPadding,
            ].join(" ")}
          />
        ) : (
          <>
            <p className="font-sans text-[12px] leading-snug break-words text-ink-primary transition-colors flex-1">
              {card.text ? (
                renderCellText(card.text, themeKind)
              ) : (
                <span className="text-ink-muted italic">Click to add…</span>
              )}
            </p>

            {/* Meta chips (priority, cardType, etc.). Active state mirrors header
                selection: full bg + white text. Empty state is an outline button. */}
            {metaFields && metaFields.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {metaFields.map((field) => {
                  const val = meta[field.key];
                  if (!val && !field.nullable) return null;
                  return (
                    <button
                      key={field.key}
                      type="button"
                      disabled={agentBusy || !onMetaChange}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!onMetaChange) return;
                        // cycle through options, including null at the end if nullable
                        const seq = field.nullable
                          ? [...field.options, null as string | null]
                          : field.options;
                        const currIdx = val ? seq.indexOf(val) : -1;
                        const next = seq[(currIdx + 1) % seq.length];
                        onMetaChange(card.id, field.key, next);
                      }}
                      className={[
                        "rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.14em] transition-colors",
                        val
                          ? "bg-ink-primary text-white border border-ink-primary"
                          : "bg-transparent text-ink-muted border border-border-soft hover:text-ink-secondary hover:border-border-medium",
                      ].join(" ")}
                      title={`${field.label}${val ? `: ${val}` : ""}`}
                    >
                      {val ?? `+ ${field.label}`}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Sub-items (one level of nesting). Compact bullet rows beneath the body.
                The + Sub-item button only appears when the card is selected or hovered,
                keeping the at-rest card face clean and slide-like. */}
            {subItems && subItems.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1 border-t border-border-soft/60 pt-2">
                {subItems.map((child) => (
                  <SubItemRow
                    key={child.id}
                    child={child}
                    themeKind={themeKind}
                    isSelected={selectedChildIds?.has(child.id) ?? false}
                    agentBusy={agentBusy}
                    onSelect={onChildSelect}
                    onTextChange={onChildTextChange}
                    onRemove={onChildRemove}
                    onPromote={onChildPromote}
                  />
                ))}
                {onAddChild && !agentBusy && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChild(card.id);
                    }}
                    className={[
                      "self-start inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                      "text-[10px] font-mono tracking-[0.14em] uppercase text-ink-muted",
                      "hover:text-ink-secondary hover:bg-ink-primary/[0.05] transition-all",
                      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    ].join(" ")}
                    aria-label="Add sub-item"
                  >
                    <Plus className="h-3 w-3" />
                    Sub-item
                  </button>
                )}
              </div>
            ) : onAddChild && !agentBusy ? (
              // Nothing rendered at rest — only on hover/select does the "+ Sub-item"
              // hint appear, so empty cards read as clean slide elements.
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild(card.id);
                }}
                className={[
                  "mt-2 self-start inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                  "text-[10px] font-mono tracking-[0.14em] uppercase text-ink-muted",
                  "hover:text-ink-secondary hover:bg-ink-primary/[0.05] transition-all",
                  isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                ].join(" ")}
                aria-label="Add sub-item"
              >
                <Plus className="h-3 w-3" />
                Sub-item
              </button>
            ) : null}

            {/* Connector edge handles — 4 dots on hover/select. Pointerdown
                 starts a drag-to-connect gesture via ConnectorUIContext. */}
            {connectorUI?.enabled && !agentBusy && !editing && !isGhost && (
              <ConnectorHandles
                isSelected={isSelected}
                onDragStart={(anchor, e) =>
                  connectorUI.onDragStart(card.id, anchor, e)
                }
              />
            )}

            {/* Inline remove — always visible when the card is selected so
                 users don't have to discover it via hover. On unselected
                 cards, we still reveal it on hover so the card face stays
                 clean at rest. */}
            {onRemove && !agentBusy && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(card.id);
                }}
                className={[
                  "absolute top-2 right-2 rounded-md w-5 h-5 grid place-items-center",
                  "text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-opacity",
                  isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                ].join(" ")}
                aria-label="Remove card"
                title="Remove card"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ConnectorHandles — 4 edge dots rendered on hover/select when the framework
// has connectors enabled. Pointerdown on a handle starts a drag-to-connect.
// Handles sit just outside the card edge so they read as anchor points rather
// than card UI chrome.
// ──────────────────────────────────────────────────────────────────────────────

function ConnectorHandles({
  isSelected,
  onDragStart,
}: {
  isSelected: boolean;
  onDragStart: (anchor: ConnectorAnchor, e: React.PointerEvent) => void;
}) {
  const common =
    "absolute w-3 h-3 rounded-full bg-white border border-accent shadow-sm " +
    "transition-opacity cursor-crosshair hover:scale-125 hover:bg-accent/20";
  const visibility = isSelected
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100";
  const stop = (e: React.PointerEvent) => {
    // dnd-kit's card drag would otherwise swallow this pointer.
    e.stopPropagation();
  };
  return (
    <>
      <button
        type="button"
        aria-label="Connect from top"
        onPointerDownCapture={(e) => {
          stop(e);
          onDragStart("top", e);
        }}
        className={`${common} ${visibility} -top-1.5 left-1/2 -translate-x-1/2`}
      />
      <button
        type="button"
        aria-label="Connect from right"
        onPointerDownCapture={(e) => {
          stop(e);
          onDragStart("right", e);
        }}
        className={`${common} ${visibility} -right-1.5 top-1/2 -translate-y-1/2`}
      />
      <button
        type="button"
        aria-label="Connect from bottom"
        onPointerDownCapture={(e) => {
          stop(e);
          onDragStart("bottom", e);
        }}
        className={`${common} ${visibility} -bottom-1.5 left-1/2 -translate-x-1/2`}
      />
      <button
        type="button"
        aria-label="Connect from left"
        onPointerDownCapture={(e) => {
          stop(e);
          onDragStart("left", e);
        }}
        className={`${common} ${visibility} -left-1.5 top-1/2 -translate-y-1/2`}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SubItemRow — a single sub-item rendered inside its parent card.
// Click selects (for Copilot context). Second click on a selected sub-item
// enters inline edit mode. Has its own remove + promote-to-top-level actions.
// ──────────────────────────────────────────────────────────────────────────────

function SubItemRow({
  child,
  themeKind,
  isSelected,
  agentBusy,
  onSelect,
  onTextChange,
  onRemove,
  onPromote,
}: {
  child: Card;
  themeKind: string;
  isSelected: boolean;
  agentBusy: boolean;
  onSelect?: (childId: string, additive: boolean) => void;
  onTextChange?: (childId: string, text: string) => void;
  onRemove?: (childId: string) => void;
  onPromote?: (childId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(child.text);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const theme = kindTheme(themeKind);

  useEffect(() => {
    if (!editing) setDraft(child.text);
  }, [child.text, editing]);

  useEffect(() => {
    if (editing) {
      taRef.current?.focus();
      taRef.current?.select();
    }
  }, [editing]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    const additive = e.metaKey || e.shiftKey || e.ctrlKey;
    onSelect?.(child.id, additive);
    if (!additive && !agentBusy && isSelected && !editing) {
      // second click on already-selected → enter edit
      setEditing(true);
    }
  }

  function commit() {
    setEditing(false);
    if (onTextChange && draft !== child.text) onTextChange(child.id, draft);
  }
  function cancel() {
    setEditing(false);
    setDraft(child.text);
  }

  return (
    <div
      onClick={handleClick}
      className={[
        "group/sub relative flex items-start gap-1.5 rounded-md px-1.5 py-1 cursor-pointer transition-colors",
        isSelected
          ? "bg-accent/[0.08] ring-1 ring-accent/50"
          : "hover:bg-ink-primary/[0.04]",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 shrink-0 inline-block h-1.5 w-1.5 rounded-full",
          theme.chipBg,
        ].join(" ")}
        aria-hidden
      />
      {editing ? (
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          rows={1}
          className="flex-1 min-w-0 resize-none rounded-sm bg-white text-ink-primary text-[11px] leading-snug focus:outline-none border border-ink-primary px-1 py-0.5"
        />
      ) : (
        <span className="flex-1 min-w-0 text-[11px] leading-snug text-ink-primary break-words">
          {child.text || (
            <span className="text-ink-muted italic">Click to add…</span>
          )}
        </span>
      )}
      {!editing && !agentBusy && (
        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/sub:opacity-100 transition-opacity">
          {onPromote && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPromote(child.id);
              }}
              className="rounded-sm w-4 h-4 grid place-items-center text-ink-muted hover:text-ink-primary hover:bg-ink-primary/[0.06]"
              title="Promote to top-level card"
              aria-label="Promote to top-level card"
            >
              <CornerUpLeft className="h-3 w-3" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(child.id);
              }}
              className="rounded-sm w-4 h-4 grid place-items-center text-ink-muted hover:text-rose-600 hover:bg-rose-50"
              title="Remove sub-item"
              aria-label="Remove sub-item"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
