"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { kindTheme, themeKindForIndex } from "@/lib/row-kind-theme";
import type {
  UniversalMap,
  UniversalSelection,
  Card,
} from "@/lib/frameworks/universal/types";
import { applyOps, type Op } from "@/lib/frameworks/universal/ops";
import type { FrameworkConfig, CardMetaField } from "@/lib/frameworks/universal/config";
import { GridCard } from "./GridCard";
import { HeroBanner } from "./grid/HeroBanner";
import { ColHeader } from "./grid/ColHeader";
import { RowLabelRail } from "./grid/RowLabelRail";
import { SectionContainer } from "./grid/SectionContainer";
import { EmptySlot } from "./grid/EmptySlot";
import { AddSlotButton } from "./grid/AddSlotButton";
import { XAxisBand, YAxisBand } from "./grid/AxisSpine";
import { SortableHandle } from "./grid/Sortable";
import { SelectionToolbar } from "./grid/SelectionToolbar";
import { FreeformLayout } from "./grid/FreeformLayout";
import { ChromeLayer } from "./grid/ChromeLayer";
import { PresentedCard, inferPresentMode } from "./grid/PresentedCard";
import { ConnectorLayer, type ConnectorDraft } from "./grid/ConnectorLayer";
import { ConnectorUIContext, type ConnectorUI } from "./grid/connector-ui-context";
import type { ConnectorAnchor } from "@/lib/frameworks/universal/types";
import { useCanvasContextMenu } from "./CanvasContextMenu";
import {
  cardMenu,
  colMenu,
  rowMenu,
  slotMenu,
} from "./canvas-menus";
import {
  CARD_W,
  GUTTER,
  KANBAN_COL_W,
  LABEL_W,
  MATRIX_CELL_MIN_W,
  MATRIX_CONTENT_LEFT_OFFSET,
  MATRIX_ROW_MIN_H,
  ROW_MIN_H,
  Y_AXIS_BAND_W,
} from "./grid/layout-tokens";

type Props = {
  map: UniversalMap;
  config: FrameworkConfig;
  onChange: (next: UniversalMap) => void;
  busy?: boolean;
  selection: unknown;
  onSelectionChange: (next: unknown) => void;
  createdAt?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Top-level dispatcher — composes HeroBanner + one of three layouts
// ─────────────────────────────────────────────────────────────────────────────

export function FrameworkGrid({
  map,
  config,
  onChange,
  busy,
  selection,
  onSelectionChange,
  createdAt,
}: Props) {
  const sel = (selection as UniversalSelection | null) ?? null;
  const agentBusy = !!busy;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const contextMenu = useCanvasContextMenu();
  // Active drag state — when a card or container is being dragged, this captures
  // what's moving so we can render group-ghost feedback for multi-select drags.
  const [activeDrag, setActiveDrag] = useState<
    | { kind: "card"; anchorId: string; ids: string[] }
    | { kind: "col"; id: string }
    | { kind: "row"; id: string }
    | null
  >(null);

  // Container ref for ConnectorLayer + in-flight connector draft. The draft is
  // captured while the user is dragging from an edge handle; pointerup commits
  // an addConnector op or cancels if the pointer isn't over a target card.
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const [connectorDraft, setConnectorDraft] = useState<ConnectorDraft | null>(null);
  // Connectors are ON by default across every framework. A framework can opt
  // OUT by setting `config.connectors.enabled = false` (e.g. if we ever ship
  // a layout where arrows would read as noise). The AI side remains opt-in
  // via `=== true` — it should only auto-emit connectors when the config
  // genuinely calls for them. Users can still draw them by hand anywhere.
  const connectorsEnabled = config.connectors?.enabled !== false;

  function commitOps(ops: Op[]) {
    const result = applyOps(map, ops);
    if (result.ok) onChange(result.map);
  }

  // Selection helpers
  const selectedCardIds = new Set(sel?.type === "cards" ? sel.ids : []);
  const selectedColId = sel?.type === "col" ? sel.id : null;
  const selectedRowId = sel?.type === "row" ? sel.id : null;
  const selectedConnectorIds = new Set(sel?.type === "connector" ? sel.ids : []);

  function selectCard(cardId: string, additive: boolean) {
    if (additive && sel?.type === "cards") {
      const has = sel.ids.includes(cardId);
      const next = has ? sel.ids.filter((x) => x !== cardId) : [...sel.ids, cardId];
      onSelectionChange(next.length ? { type: "cards", ids: next } : null);
    } else {
      onSelectionChange({ type: "cards", ids: [cardId] });
    }
  }
  function toggleColSelect(colId: string) {
    onSelectionChange(
      sel?.type === "col" && sel.id === colId ? null : { type: "col", id: colId }
    );
  }
  function toggleRowSelect(rowId: string) {
    onSelectionChange(
      sel?.type === "row" && sel.id === rowId ? null : { type: "row", id: rowId }
    );
  }

  // Batch ops on the current card selection
  function deleteSelectedCards() {
    if (sel?.type !== "cards" || sel.ids.length === 0) return;
    const ops: Op[] = sel.ids.map((id) => ({ op: "removeCard" as const, cardId: id }));
    commitOps(ops);
    onSelectionChange(null);
  }
  function deleteSelectedConnectors() {
    if (sel?.type !== "connector" || sel.ids.length === 0) return;
    const ops: Op[] = sel.ids.map((id) => ({ op: "removeConnector" as const, connectorId: id }));
    commitOps(ops);
    onSelectionChange(null);
  }
  function selectConnector(id: string, additive: boolean) {
    if (additive && sel?.type === "connector") {
      const has = sel.ids.includes(id);
      const next = has ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
      onSelectionChange(next.length ? { type: "connector", ids: next } : null);
    } else {
      onSelectionChange({ type: "connector", ids: [id] });
    }
  }
  function clearSelection() {
    onSelectionChange(null);
  }

  // Card mutations
  function editCard(cardId: string, text: string) {
    commitOps([{ op: "editCard", cardId, text }]);
  }
  function changeMeta(cardId: string, key: string, value: string | null) {
    commitOps([{ op: "setCardMeta", cardId, key, value }]);
  }
  function removeCard(cardId: string) {
    commitOps([{ op: "removeCard", cardId }]);
  }
  function addCardAt(colId: string, rowId: string) {
    commitOps([{ op: "addCard", colId, rowId, text: "" }]);
  }
  function addSubItem(parentCardId: string) {
    const parent = map.cards.find((c) => c.id === parentCardId);
    if (!parent) return;
    commitOps([
      { op: "addCard", colId: parent.colId, rowId: parent.rowId, text: "", parentCardId },
    ]);
  }
  function promoteChild(childId: string) {
    commitOps([{ op: "reparentCard", cardId: childId, newParentCardId: null }]);
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────
  // Three kinds of drags are supported, all atomic via `commitOps`:
  //   1. Card(s) move — single card or a multi-select group → `moveCard` ops
  //   2. Column reorder — drag header → `moveCol` op
  //   3. Row reorder — drag rail → `moveRow` op
  // ──────────────────────────────────────────────────────────────────────────

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as
      | { kind?: string; cardId?: string; colId?: string; rowId?: string }
      | undefined;
    if (!data) return;
    if (data.kind === "card" && data.cardId) {
      // If the dragged card is part of a multi-select, drag the whole group.
      const groupIds = selectedCardIds.has(data.cardId)
        ? Array.from(selectedCardIds)
        : [data.cardId];
      setActiveDrag({ kind: "card", anchorId: data.cardId, ids: groupIds });
    } else if (data.kind === "col-handle" && data.colId) {
      setActiveDrag({ kind: "col", id: data.colId });
    } else if (data.kind === "row-handle" && data.rowId) {
      setActiveDrag({ kind: "row", id: data.rowId });
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const drag = activeDrag;
    setActiveDrag(null);
    if (!drag) return;

    const overData = e.over?.data.current as
      | {
          kind?: string;
          cardId?: string;
          colId?: string;
          rowId?: string;
        }
      | undefined;

    // ── Card(s) moving into a target cell ────────────────────────────────────
    if (drag.kind === "card") {
      if (!overData) return;
      let toColId: string | undefined;
      let toRowId: string | undefined;
      // When dropping ONTO a card, anchor insertion at that card's order so
      // the dragged card lands just before it — this is what enables
      // same-column reordering (previously a same-cell drop no-op'd).
      // Fractional orders are fine: applyOps treats `order` as numeric and
      // cardsAt() sorts ascending, so 2.5 slots cleanly between 2 and 3.
      let toOrderAnchor: number | undefined;

      if (overData.kind === "card" && overData.cardId) {
        // Don't drop onto a card that's part of the dragging group.
        if (drag.ids.includes(overData.cardId)) return;
        const over = map.cards.find((c) => c.id === overData.cardId);
        if (!over) return;
        toColId = over.colId;
        toRowId = over.rowId;
        // Direction-aware insertion: if the anchor card is being dragged DOWN
        // (its current order < over.order in the same cell), land it BELOW
        // the drop target. Dragging UP or coming from another cell lands it
        // ABOVE. Without this, every same-cell drop inserts before the
        // target, making down-drags look like they "didn't move far enough".
        const anchor = map.cards.find((c) => c.id === drag.anchorId);
        const sameCell =
          !!anchor &&
          anchor.colId === over.colId &&
          anchor.rowId === over.rowId;
        const draggingDown = sameCell && (anchor?.order ?? 0) < over.order;
        toOrderAnchor = draggingDown ? over.order + 0.5 : over.order - 0.5;
      } else if (overData.kind === "slot" && overData.colId && overData.rowId) {
        toColId = overData.colId;
        toRowId = overData.rowId;
      } else {
        return;
      }

      // Build a batch of moveCard ops, one per dragged card. For group drops,
      // spread fractional orders so relative order within the group survives.
      const ops: Op[] = [];
      const n = drag.ids.length;
      drag.ids.forEach((id, i) => {
        const card = map.cards.find((c) => c.id === id);
        if (!card) return;
        // Same-cell, same-position drop = no-op.
        if (
          card.colId === toColId &&
          card.rowId === toRowId &&
          toOrderAnchor === undefined
        )
          return;
        const toOrder =
          toOrderAnchor !== undefined
            ? toOrderAnchor + (i - (n - 1) / 2) * 0.001
            : undefined;
        ops.push({
          op: "moveCard",
          cardId: card.id,
          toColId: toColId!,
          toRowId: toRowId!,
          ...(toOrder !== undefined ? { toOrder } : {}),
        });
      });
      if (ops.length > 0) commitOps(ops);
      return;
    }

    // ── Column reorder ───────────────────────────────────────────────────────
    if (drag.kind === "col" && overData?.kind === "col-handle" && overData.colId) {
      if (drag.id === overData.colId) return;
      const targetIndex = map.cols.findIndex((c) => c.id === overData.colId);
      if (targetIndex === -1) return;
      commitOps([{ op: "moveCol", colId: drag.id, toIndex: targetIndex }]);
      return;
    }

    // ── Row reorder ──────────────────────────────────────────────────────────
    if (drag.kind === "row" && overData?.kind === "row-handle" && overData.rowId) {
      if (drag.id === overData.rowId) return;
      const targetIndex = map.rows.findIndex((r) => r.id === overData.rowId);
      if (targetIndex === -1) return;
      commitOps([{ op: "moveRow", rowId: drag.id, toIndex: targetIndex }]);
      return;
    }
  }

  // IDs currently in a multi-card drag group (for ghost rendering).
  const draggingGroupIds = useMemo(() => {
    if (activeDrag?.kind !== "card") return new Set<string>();
    return new Set(activeDrag.ids);
  }, [activeDrag]);
  const draggingAnchorId = activeDrag?.kind === "card" ? activeDrag.anchorId : null;

  // Group top-level cards by (col, row). Sub-items (cards with parentCardId) are rendered
  // nested inside their parent GridCard, not at the top level of the grid.
  const cardsByPos = useMemo(() => {
    const out: Record<string, Card[]> = {};
    for (const c of map.cards) {
      if (c.parentCardId) continue; // sub-items render inside parent
      const k = `${c.colId}:${c.rowId}`;
      (out[k] = out[k] ?? []).push(c);
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.order - b.order);
    return out;
  }, [map.cards]);

  // Index sub-items by their parent card id so each GridCard receives its children directly.
  const childrenByParent = useMemo(() => {
    const out = new Map<string, Card[]>();
    for (const c of map.cards) {
      if (!c.parentCardId) continue;
      const arr = out.get(c.parentCardId);
      if (arr) arr.push(c);
      else out.set(c.parentCardId, [c]);
    }
    for (const arr of out.values()) arr.sort((a, b) => a.order - b.order);
    return out;
  }, [map.cards]);

  function handleCanvasClick() {
    if (sel) onSelectionChange(null);
  }

  // Connector drag-to-connect. An edge handle on a card dispatches
  // `beginConnectorDrag`; we attach window-level listeners so the drag keeps
  // tracking even if the pointer leaves the source card.
  const beginConnectorDrag = useCallback(
    (cardId: string, anchor: ConnectorAnchor, e: React.PointerEvent) => {
      if (agentBusy || !connectorsEnabled) return;
      const container = cardsContainerRef.current;
      if (!container) return;
      e.preventDefault();
      e.stopPropagation();

      const pointerToLocal = (cx: number, cy: number) => {
        const rect = container.getBoundingClientRect();
        // rect is post-transform (after the canvas stage's scale); offsetWidth
        // is pre-transform (logical). Divide by the ratio so ghost geometry
        // stays glued to the cursor at any zoom level.
        const scale =
          container.offsetWidth > 0 ? rect.width / container.offsetWidth : 1;
        return {
          x: (cx - rect.left) / scale + container.scrollLeft,
          y: (cy - rect.top) / scale + container.scrollTop,
        };
      };

      const initial = pointerToLocal(e.clientX, e.clientY);
      setConnectorDraft({ fromCardId: cardId, fromAnchor: anchor, toX: initial.x, toY: initial.y });

      const onMove = (ev: PointerEvent) => {
        const p = pointerToLocal(ev.clientX, ev.clientY);
        setConnectorDraft((prev) =>
          prev ? { ...prev, toX: p.x, toY: p.y } : prev
        );
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        setConnectorDraft(null);

        // Resolve the target: the topmost element under the pointer carrying a
        // data-card-id. We query through the overlay (pointer-events:none) so
        // the hit test reaches the card underneath.
        const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
        let targetId: string | null = null;
        for (const node of stack) {
          if (!(node instanceof HTMLElement)) continue;
          const found = node.closest<HTMLElement>("[data-card-id]");
          if (found) {
            targetId = found.getAttribute("data-card-id");
            break;
          }
        }
        if (!targetId || targetId === cardId) return;
        commitOps([
          { op: "addConnector", sourceCardId: cardId, targetCardId: targetId, sourceAnchor: anchor },
        ]);
      };
      const onCancel = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        setConnectorDraft(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [agentBusy, connectorsEnabled, commitOps]
  );

  const connectorUIValue = useMemo<ConnectorUI | null>(
    () => (connectorsEnabled ? { enabled: true, onDragStart: beginConnectorDrag } : null),
    [connectorsEnabled, beginConnectorDrag]
  );

  // ── Context-menu dispatchers ─────────────────────────────────────────────
  // Each surface's right-click handler. Surfaces keep their own onContextMenu
  // prop minimal; the menu items themselves are computed here where we have
  // access to the full map + commitOps.
  function openCardMenu(e: React.MouseEvent, cardId: string) {
    const card = map.cards.find((c) => c.id === cardId);
    if (!card) return;
    contextMenu.open(
      e,
      cardMenu({
        map,
        card,
        commitOps,
        // No imperative editing hook yet — users can still double-click / click
        // to enter edit mode; omitting `beginEdit` hides that menu item.
      })
    );
  }
  function openColMenuHandler(e: React.MouseEvent, colId: string) {
    const col = map.cols.find((c) => c.id === colId);
    if (!col) return;
    contextMenu.open(e, colMenu({ map, col, config, commitOps }));
  }
  function openRowMenuHandler(e: React.MouseEvent, rowId: string) {
    const row = map.rows.find((r) => r.id === rowId);
    if (!row) return;
    contextMenu.open(e, rowMenu({ map, row, config, commitOps }));
  }
  function openSlotMenu(e: React.MouseEvent, colId: string, rowId: string) {
    contextMenu.open(e, slotMenu({ colId, rowId, commitOps }));
  }

  const shared = {
    map,
    config,
    cardsByPos,
    childrenByParent,
    agentBusy,
    selectedCardIds,
    selectedColId,
    selectedRowId,
    draggingGroupIds,
    draggingAnchorId,
    onCardSelect: selectCard,
    onColSelect: toggleColSelect,
    onRowSelect: toggleRowSelect,
    onEditCard: editCard,
    onChangeMeta: changeMeta,
    onRemoveCard: removeCard,
    onAddCardAt: addCardAt,
    onAddSubItem: addSubItem,
    onPromoteChild: promoteChild,
    onCardContextMenu: openCardMenu,
    onColContextMenu: openColMenuHandler,
    onRowContextMenu: openRowMenuHandler,
    onSlotContextMenu: openSlotMenu,
    commitOps,
  };

  const selectedCount = sel?.type === "cards" ? sel.ids.length : 0;

  // Keyboard: Delete / Backspace removes selected cards. Escape clears selection.
  // Skipped when the user is typing in any input/textarea/contenteditable.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (agentBusy) return;
      if ((e.key === "Delete" || e.key === "Backspace")) {
        if (selectedCount > 0) {
          e.preventDefault();
          deleteSelectedCards();
        } else if (sel?.type === "connector" && sel.ids.length > 0) {
          e.preventDefault();
          deleteSelectedConnectors();
        }
      } else if (e.key === "Escape" && sel) {
        e.preventDefault();
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCount, sel, agentBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConnectorUIContext.Provider value={connectorUIValue}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-col" onClick={handleCanvasClick}>
          <HeroBanner map={map} config={config} createdAt={createdAt} />

          <div ref={cardsContainerRef} className="relative">
            {config.layout === "grid" && <GridLayout {...shared} />}
            {config.layout === "kanban" && <KanbanLayout {...shared} />}
            {config.layout === "matrix" && <MatrixLayout {...shared} />}
            {config.layout === "freeform" && (
              <FreeformLayout
                map={map}
                config={config}
                agentBusy={agentBusy}
                selectedCardIds={selectedCardIds}
                onCardSelect={selectCard}
                onEditCard={editCard}
                onRemoveCard={removeCard}
                commitOps={commitOps}
              />
            )}

            {connectorsEnabled && (
              <ConnectorLayer
                connectors={map.connectors ?? []}
                containerRef={cardsContainerRef}
                recomputeKey={map.cards}
                defaultRouting={config.connectors?.defaultRouting ?? "orthogonal"}
                selectedConnectorIds={selectedConnectorIds}
                onConnectorClick={selectConnector}
                draft={connectorDraft}
                onReassignEndpoint={(connectorId, end, newCardId) => {
                  // Don't create a self-loop if the user drops onto the other
                  // endpoint's card; ignore the attempt and keep the connector
                  // as-is.
                  const conn = (map.connectors ?? []).find(
                    (c) => c.id === connectorId
                  );
                  if (!conn) return;
                  const otherCardId =
                    end === "source" ? conn.targetCardId : conn.sourceCardId;
                  if (newCardId === otherCardId) return;
                  // Also clear the anchor on the moved end so the auto-anchor
                  // picks the shortest side on the new card. An explicit anchor
                  // set against the old card rarely makes sense on the new one.
                  const patch =
                    end === "source"
                      ? { sourceCardId: newCardId, sourceAnchor: undefined }
                      : { targetCardId: newCardId, targetAnchor: undefined };
                  commitOps([
                    { op: "updateConnector", connectorId, patch },
                  ]);
                }}
              />
            )}
          </div>
        </div>

        {/* Floating action bar for batch ops on multi-card selection */}
        {selectedCount > 0 ? (
          <SelectionToolbar
            count={selectedCount}
            agentBusy={agentBusy}
            onDelete={deleteSelectedCards}
            onClear={clearSelection}
          />
        ) : null}
      </DndContext>
    </ConnectorUIContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout-prop type
// ─────────────────────────────────────────────────────────────────────────────

type LayoutProps = {
  map: UniversalMap;
  config: FrameworkConfig;
  cardsByPos: Record<string, Card[]>;
  /** Sub-items grouped by their parent card id — rendered inside the parent GridCard. */
  childrenByParent: Map<string, Card[]>;
  agentBusy: boolean;
  selectedCardIds: Set<string>;
  selectedColId: string | null;
  selectedRowId: string | null;
  /** IDs currently in a multi-card drag group (for ghost rendering). */
  draggingGroupIds: Set<string>;
  /** The card the user actually grabbed; the rest of the group are non-anchors. */
  draggingAnchorId: string | null;
  onCardSelect: (id: string, additive: boolean) => void;
  onColSelect: (id: string) => void;
  onRowSelect: (id: string) => void;
  onEditCard: (id: string, text: string) => void;
  onChangeMeta: (id: string, key: string, value: string | null) => void;
  onRemoveCard: (id: string) => void;
  onAddCardAt: (colId: string, rowId: string) => void;
  /** Add a sub-item under the given parent card. */
  onAddSubItem: (parentCardId: string) => void;
  /** Promote a sub-item to a top-level card (reparentCard → null). */
  onPromoteChild: (childId: string) => void;
  /** Context menu dispatchers — right-click handlers at each surface. */
  onCardContextMenu: (e: React.MouseEvent, cardId: string) => void;
  onColContextMenu: (e: React.MouseEvent, colId: string) => void;
  onRowContextMenu: (e: React.MouseEvent, rowId: string) => void;
  onSlotContextMenu: (e: React.MouseEvent, colId: string, rowId: string) => void;
  commitOps: (ops: Op[]) => void;
};

// ═════════════════════════════════════════════════════════════════════════════
// GRID LAYOUT — sparse 2D, journey-map style
// ═════════════════════════════════════════════════════════════════════════════

function GridLayout(p: LayoutProps) {
  const { map, config, cardsByPos, agentBusy } = p;
  const colIds = map.cols.map((c) => c.id);
  const rowIds = map.rows.map((r) => r.id);

  return (
    <div className="flex flex-col">
      {/* Header row: row-label gutter + col headers + add-col affordance.
          The spacer must be shrink-0 so it stays aligned with the row rail
          below when the flex row overflows (row rails already carry shrink-0). */}
      <SortableContext items={colIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center mb-3" style={{ gap: GUTTER }}>
          <div className="shrink-0" style={{ width: LABEL_W }} />
          {map.cols.map((col, idx) => (
            <SortableHandle
              key={col.id}
              id={col.id}
              kind="col-handle"
              payloadId={col.id}
              agentBusy={agentBusy || !!config.fixedCols}
              className="shrink-0 cursor-grab active:cursor-grabbing"
            >
              <div style={{ width: CARD_W }}>
                <ColHeader
                  label={col.label}
                  index={idx}
                  kind={col.kind}
                  isSelected={p.selectedColId === col.id}
                  agentBusy={agentBusy}
                  onClick={() => p.onColSelect(col.id)}
                  onLabelChange={(l) =>
                    p.commitOps([{ op: "renameCol", colId: col.id, label: l }])
                  }
                  onRemove={
                    config.fixedCols
                      ? undefined
                      : () => p.commitOps([{ op: "removeCol", colId: col.id }])
                  }
                  onContextMenu={(e) => p.onColContextMenu(e, col.id)}
                />
              </div>
            </SortableHandle>
          ))}
          {!config.fixedCols && (
            <AddSlotButton
              label={`Add ${config.colNoun}`}
              agentBusy={agentBusy}
              onAdd={() =>
                p.commitOps([
                  { op: "addCol", label: `New ${config.colNoun}`, atIndex: map.cols.length },
                ])
              }
            />
          )}
        </div>
      </SortableContext>

      {/* Rows */}
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col" style={{ gap: GUTTER }}>
          {map.rows.map((row) => {
            const isRowSel = p.selectedRowId === row.id;
            return (
              <div
                key={row.id}
                className="flex items-stretch"
                style={{ gap: GUTTER, minHeight: ROW_MIN_H }}
              >
                <SortableHandle
                  id={row.id}
                  kind="row-handle"
                  payloadId={row.id}
                  agentBusy={agentBusy || !!config.fixedRows}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <RowLabelRail
                    label={row.label}
                    kind={row.kind ?? "neutral"}
                    isSelected={isRowSel}
                    agentBusy={agentBusy}
                    width={LABEL_W}
                    minHeight={ROW_MIN_H}
                    onClick={() => p.onRowSelect(row.id)}
                    onLabelChange={(l) =>
                      p.commitOps([{ op: "renameRow", rowId: row.id, label: l }])
                    }
                    onRemove={
                      config.fixedRows
                        ? undefined
                        : () => p.commitOps([{ op: "removeRow", rowId: row.id }])
                    }
                    onContextMenu={(e) => p.onRowContextMenu(e, row.id)}
                  />
                </SortableHandle>
                {map.cols.map((col) => {
                  const cards = cardsByPos[`${col.id}:${row.id}`] ?? [];
                  return (
                    <CellSlotGrid
                      key={col.id}
                      colId={col.id}
                      rowId={row.id}
                      rowKind={row.kind ?? "neutral"}
                      cards={cards}
                      childrenByParent={p.childrenByParent}
                      agentBusy={agentBusy}
                      selectedCardIds={p.selectedCardIds}
                      draggingGroupIds={p.draggingGroupIds}
                      draggingAnchorId={p.draggingAnchorId}
                      onCardSelect={p.onCardSelect}
                      onEditCard={p.onEditCard}
                      onChangeMeta={p.onChangeMeta}
                      onRemoveCard={p.onRemoveCard}
                      onAddCard={() => p.onAddCardAt(col.id, row.id)}
                      onAddSubItem={p.onAddSubItem}
                      onPromoteChild={p.onPromoteChild}
                      onCardContextMenu={p.onCardContextMenu}
                      onSlotContextMenu={p.onSlotContextMenu}
                      metaFields={config.cardMetaFields}
                    />
                  );
                })}
              </div>
            );
          })}

          {!config.fixedRows && (
            <div className="flex items-center" style={{ gap: GUTTER }}>
              <AddSlotButton
                label={`Add ${config.rowNoun}`}
                agentBusy={agentBusy}
                onAdd={() =>
                  p.commitOps([
                    { op: "addRow", label: `New ${config.rowNoun}`, atIndex: map.rows.length },
                  ])
                }
                fullWidth
                width={LABEL_W}
              />
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function CellSlotGrid({
  colId,
  rowId,
  rowKind,
  cards,
  childrenByParent,
  agentBusy,
  selectedCardIds,
  draggingGroupIds,
  draggingAnchorId,
  onCardSelect,
  onEditCard,
  onChangeMeta,
  onRemoveCard,
  onAddCard,
  onAddSubItem,
  onPromoteChild,
  onCardContextMenu,
  onSlotContextMenu,
  metaFields,
}: {
  colId: string;
  rowId: string;
  rowKind: string;
  cards: Card[];
  childrenByParent: Map<string, Card[]>;
  agentBusy: boolean;
  selectedCardIds: Set<string>;
  draggingGroupIds: Set<string>;
  draggingAnchorId: string | null;
  onCardSelect: (id: string, additive: boolean) => void;
  onEditCard: (id: string, text: string) => void;
  onChangeMeta: (id: string, key: string, value: string | null) => void;
  onRemoveCard: (id: string) => void;
  onAddCard: () => void;
  onAddSubItem: (parentCardId: string) => void;
  onPromoteChild: (childId: string) => void;
  onCardContextMenu: (e: React.MouseEvent, cardId: string) => void;
  onSlotContextMenu: (e: React.MouseEvent, colId: string, rowId: string) => void;
  metaFields?: CardMetaField[];
}) {
  const drop = useDroppable({
    id: `slot:${colId}:${rowId}`,
    data: { kind: "slot", colId, rowId },
  });

  // Phase C execution layer: if any card in this cell carries meta.x
  // positioning hints, render those cards as absolute-positioned bars/dots/
  // diamonds via PresentedCard. Stacked cards (no meta.x) still render below
  // in normal flow so frameworks can mix styles within a single cell.
  const positioned = cards.filter((c) => inferPresentMode(c) !== "stacked");
  const stacked = cards.filter((c) => inferPresentMode(c) === "stacked");
  const hasPositioned = positioned.length > 0;

  return (
    <div
      ref={drop.setNodeRef}
      style={{ width: CARD_W, minHeight: hasPositioned ? 80 : undefined }}
      className={[
        "shrink-0 flex flex-col gap-2 p-1 rounded-xl",
        hasPositioned ? "relative overflow-visible" : "",
        drop.isOver ? "bg-ink-primary/[0.04] ring-1 ring-ink-primary/30 ring-inset" : "",
      ].join(" ")}
    >
      {cards.length === 0 ? (
        <EmptySlot
          droppableId={`slot:${colId}:${rowId}`}
          droppableData={{ kind: "slot", colId, rowId }}
          agentBusy={agentBusy}
          onAdd={onAddCard}
          size="tall"
          onContextMenu={(e) => onSlotContextMenu(e, colId, rowId)}
        />
      ) : (
        <>
          {positioned.map((card) => {
            const mode = inferPresentMode(card);
            if (mode === "stacked") return null;
            return (
              <PresentedCard
                key={card.id}
                card={card}
                themeKind={rowKind}
                mode={mode}
                isSelected={selectedCardIds.has(card.id)}
                agentBusy={agentBusy}
                onSelect={onCardSelect}
                onTextChange={onEditCard}
                onContextMenu={onCardContextMenu}
              />
            );
          })}
          {stacked.map((card, idx) => (
            <GridCard
              key={card.id}
              card={card}
              themeKind={rowKind}
              number={idx + 1}
              metaFields={metaFields}
              layoutMode="grid"
              isSelected={selectedCardIds.has(card.id)}
              isInDragGroup={
                draggingGroupIds.has(card.id) && card.id !== draggingAnchorId
              }
              agentBusy={agentBusy}
              subItems={childrenByParent.get(card.id)}
              selectedChildIds={selectedCardIds}
              onChildSelect={onCardSelect}
              onChildTextChange={onEditCard}
              onChildRemove={onRemoveCard}
              onChildPromote={onPromoteChild}
              onAddChild={onAddSubItem}
              onSelect={onCardSelect}
              onTextChange={onEditCard}
              onMetaChange={onChangeMeta}
              onRemove={onRemoveCard}
              onContextMenu={onCardContextMenu}
            />
          ))}
          {!hasPositioned && <AddCardButton agentBusy={agentBusy} onAdd={onAddCard} />}
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// KANBAN LAYOUT — vertical card stacks per col (JTBD, affinity)
// ═════════════════════════════════════════════════════════════════════════════

function KanbanLayout(p: LayoutProps) {
  const { map, config, cardsByPos, agentBusy } = p;
  const showRowGroups = map.rows.length > 1; // affinity (4 card-type rows) vs JTBD (single r0)
  const defaultRowId = map.rows[0]?.id ?? "r0";
  const colIds = map.cols.map((c) => c.id);
  const totalWidth = map.cols.length * KANBAN_COL_W + (map.cols.length - 1) * GUTTER;
  const hasChrome = !!config.chrome || !!map.meta?.chromeKind;

  return (
    <SortableContext items={colIds} strategy={horizontalListSortingStrategy}>
      {hasChrome && (
        <div className="mb-4">
          <ChromeLayer
            config={config}
            metaOverrides={{
              chromeKind: map.meta?.chromeKind,
              chromeLeftLabel: map.meta?.chromeLeftLabel,
              chromeRightLabel: map.meta?.chromeRightLabel,
              chromeCircles: map.meta?.chromeCircles,
            }}
            totalWidth={totalWidth}
            colCount={map.cols.length}
          />
        </div>
      )}
      <div
        className="flex flex-nowrap items-start overflow-x-auto chat-scroll snap-x pb-3"
        style={{ gap: GUTTER }}
      >
        {map.cols.map((col, idx) => {
          const isSel = p.selectedColId === col.id;
          // For affinity diagram: theme cols cycle through palette colors by index.
          // The ungrouped col (kind === "ungrouped") keeps its muted treatment.
          const effectiveKind =
            col.kind === "theme" ? themeKindForIndex(idx) : col.kind ?? "neutral";

          return (
            <SortableHandle
              key={col.id}
              id={col.id}
              kind="col-handle"
              payloadId={col.id}
              agentBusy={agentBusy || !!config.fixedCols}
              className="shrink-0 self-start snap-start cursor-grab active:cursor-grabbing"
            >
              <div
                style={{ width: KANBAN_COL_W }}
                onContextMenu={(e) => p.onColContextMenu(e, col.id)}
              >
                <SectionContainer kind={effectiveKind}>
              {/* Sticky header inside the section so it stays put as cards scroll */}
              <div className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 rounded-t-2xl bg-gradient-to-b from-surface/95 to-surface/70 backdrop-blur">
                <ColHeader
                  label={col.label}
                  index={null}
                  kind={effectiveKind}
                  isSelected={isSel}
                  agentBusy={agentBusy}
                  onClick={() => p.onColSelect(col.id)}
                  onLabelChange={(l) =>
                    p.commitOps([{ op: "renameCol", colId: col.id, label: l }])
                  }
                  onRemove={
                    config.fixedCols
                      ? undefined
                      : () => p.commitOps([{ op: "removeCol", colId: col.id }])
                  }
                  onContextMenu={(e) => p.onColContextMenu(e, col.id)}
                />
              </div>

              {showRowGroups ? (
                map.rows.map((row) => {
                  const cards = cardsByPos[`${col.id}:${row.id}`] ?? [];
                  return (
                    <SubGroup
                      key={row.id}
                      label={row.label}
                      kind={row.kind ?? "neutral"}
                      colId={col.id}
                      rowId={row.id}
                      cards={cards}
                      childrenByParent={p.childrenByParent}
                      agentBusy={agentBusy}
                      selectedCardIds={p.selectedCardIds}
                      draggingGroupIds={p.draggingGroupIds}
                      draggingAnchorId={p.draggingAnchorId}
                      onCardSelect={p.onCardSelect}
                      onEditCard={p.onEditCard}
                      onChangeMeta={p.onChangeMeta}
                      onRemoveCard={p.onRemoveCard}
                      onAddCard={() => p.onAddCardAt(col.id, row.id)}
                      onAddSubItem={p.onAddSubItem}
                      onPromoteChild={p.onPromoteChild}
                      onCardContextMenu={p.onCardContextMenu}
                      onSlotContextMenu={p.onSlotContextMenu}
                      metaFields={config.cardMetaFields}
                    />
                  );
                })
              ) : (
                <ColCardStack
                  colId={col.id}
                  rowId={defaultRowId}
                  rowKind={effectiveKind}
                  cards={map.cards.filter((c) => c.colId === col.id && !c.parentCardId)}
                  childrenByParent={p.childrenByParent}
                  agentBusy={agentBusy}
                  selectedCardIds={p.selectedCardIds}
                  draggingGroupIds={p.draggingGroupIds}
                  draggingAnchorId={p.draggingAnchorId}
                  onCardSelect={p.onCardSelect}
                  onEditCard={p.onEditCard}
                  onChangeMeta={p.onChangeMeta}
                  onRemoveCard={p.onRemoveCard}
                  onAddCard={() => p.onAddCardAt(col.id, defaultRowId)}
                  onAddSubItem={p.onAddSubItem}
                  onPromoteChild={p.onPromoteChild}
                  onCardContextMenu={p.onCardContextMenu}
                  onSlotContextMenu={p.onSlotContextMenu}
                  metaFields={config.cardMetaFields}
                />
                )}
              </SectionContainer>
            </div>
          </SortableHandle>
          );
        })}

        {!config.fixedCols && (
          <div
            className="shrink-0 self-start snap-start pt-1"
            style={{ width: KANBAN_COL_W }}
          >
            <AddSlotButton
              label={`Add ${config.colNoun}`}
              agentBusy={agentBusy}
              onAdd={() =>
                p.commitOps([
                  {
                    op: "addCol",
                    label: `New ${config.colNoun}`,
                    atIndex: map.cols.length,
                  },
                ])
              }
              orientation="block"
              fullWidth
            />
          </div>
        )}
      </div>
    </SortableContext>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MATRIX LAYOUT — fixed NxM dense grid (2x2, competitive map)
// ═════════════════════════════════════════════════════════════════════════════

function MatrixLayout(p: LayoutProps) {
  const { map, config, cardsByPos, agentBusy } = p;
  const xLabel = map.meta.xAxisLabel ?? config.heroMetaFields?.find((f) => f.key === "xAxisLabel")?.placeholder ?? "X axis";
  const yLabel = map.meta.yAxisLabel ?? config.heroMetaFields?.find((f) => f.key === "yAxisLabel")?.placeholder ?? "Y axis";
  const colIds = map.cols.map((c) => c.id);
  const rowIds = map.rows.map((r) => r.id);
  const cellMinWStyle = { minWidth: MATRIX_CELL_MIN_W } as const;
  const hasChrome = !!config.chrome || !!map.meta?.chromeKind;
  const matrixTotalWidth =
    LABEL_W +
    Y_AXIS_BAND_W +
    map.cols.length * MATRIX_CELL_MIN_W +
    (map.cols.length - 1) * GUTTER;

  return (
    <div className="flex flex-col">
      {hasChrome && (
        <div className="mb-3" style={{ marginLeft: Y_AXIS_BAND_W + LABEL_W + GUTTER }}>
          <ChromeLayer
            config={config}
            metaOverrides={{
              chromeKind: map.meta?.chromeKind,
              chromeLeftLabel: map.meta?.chromeLeftLabel,
              chromeRightLabel: map.meta?.chromeRightLabel,
              chromeCircles: map.meta?.chromeCircles,
            }}
            totalWidth={matrixTotalWidth - (Y_AXIS_BAND_W + LABEL_W + GUTTER)}
            colCount={map.cols.length}
          />
        </div>
      )}
      {/* X-axis band — leftOffset aligns the label with the first column. */}
      <XAxisBand
        label={xLabel}
        agentBusy={agentBusy}
        onChange={(v) => p.commitOps([{ op: "setMapMeta", key: "xAxisLabel", value: v }])}
        leftOffset={MATRIX_CONTENT_LEFT_OFFSET}
      />

      {/* Header row: y-label gutter + col headers */}
      <SortableContext items={colIds} strategy={horizontalListSortingStrategy}>
        <div
          className="flex items-stretch mb-3"
          style={{ gap: GUTTER, paddingLeft: Y_AXIS_BAND_W }}
        >
          <div className="shrink-0" style={{ width: LABEL_W }} />
          {map.cols.map((col, idx) => (
            <SortableHandle
              key={col.id}
              id={col.id}
              kind="col-handle"
              payloadId={col.id}
              agentBusy={agentBusy || !!config.fixedCols}
              className="flex-1 cursor-grab active:cursor-grabbing"
              style={cellMinWStyle}
            >
              <ColHeader
                label={col.label}
                index={config.id === "competitive-map" ? null : idx}
                kind={col.kind}
                isSelected={false}
                isSubject={col.kind === "subject"}
                agentBusy={agentBusy}
                onClick={() => p.onColSelect(col.id)}
                onLabelChange={(l) =>
                  p.commitOps([{ op: "renameCol", colId: col.id, label: l }])
                }
                onRemove={
                  config.fixedCols
                    ? undefined
                    : () => p.commitOps([{ op: "removeCol", colId: col.id }])
                }
                onContextMenu={(e) => p.onColContextMenu(e, col.id)}
              />
            </SortableHandle>
          ))}
          {!config.fixedCols && (
            <AddSlotButton
              label={`Add ${config.colNoun}`}
              agentBusy={agentBusy}
              onAdd={() =>
                p.commitOps([
                  { op: "addCol", label: `New ${config.colNoun}`, atIndex: map.cols.length },
                ])
              }
            />
          )}
        </div>
      </SortableContext>

      {/* Body grid with relative wrapper for the Y-axis band */}
      <div className="relative" style={{ paddingLeft: Y_AXIS_BAND_W }}>
        <YAxisBand
          label={yLabel}
          agentBusy={agentBusy}
          width={Y_AXIS_BAND_W}
          onChange={(v) => p.commitOps([{ op: "setMapMeta", key: "yAxisLabel", value: v }])}
        />

        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col" style={{ gap: GUTTER }}>
          {map.rows.map((row) => (
            <div
              key={row.id}
              className="flex items-stretch"
              style={{ gap: GUTTER, minHeight: MATRIX_ROW_MIN_H }}
            >
              <SortableHandle
                id={row.id}
                kind="row-handle"
                payloadId={row.id}
                agentBusy={agentBusy || !!config.fixedRows}
                className="cursor-grab active:cursor-grabbing"
              >
                <RowLabelRail
                  label={row.label}
                  kind={row.kind ?? "neutral"}
                  isSelected={p.selectedRowId === row.id}
                  agentBusy={agentBusy}
                  width={LABEL_W}
                  minHeight={MATRIX_ROW_MIN_H}
                  onClick={() => p.onRowSelect(row.id)}
                  onLabelChange={(l) =>
                    p.commitOps([{ op: "renameRow", rowId: row.id, label: l }])
                  }
                  onRemove={
                    config.fixedRows
                      ? undefined
                      : () => p.commitOps([{ op: "removeRow", rowId: row.id }])
                  }
                  onContextMenu={(e) => p.onRowContextMenu(e, row.id)}
                />
              </SortableHandle>
              {map.cols.map((col) => {
                const cards = cardsByPos[`${col.id}:${row.id}`] ?? [];
                const isSubjectCol = col.kind === "subject";
                return (
                  <div
                    key={col.id}
                    className="flex-1"
                    style={cellMinWStyle}
                    onContextMenu={(e) => p.onColContextMenu(e, col.id)}
                  >
                    <SectionContainer
                      kind={isSubjectCol ? "subject" : (row.kind ?? "neutral")}
                      emphasized={isSubjectCol}
                    >
                      <ColCardStack
                        colId={col.id}
                        rowId={row.id}
                        rowKind={row.kind ?? "neutral"}
                        cards={cards}
                        childrenByParent={p.childrenByParent}
                        agentBusy={agentBusy}
                        selectedCardIds={p.selectedCardIds}
                        draggingGroupIds={p.draggingGroupIds}
                        draggingAnchorId={p.draggingAnchorId}
                        onCardSelect={p.onCardSelect}
                        onEditCard={p.onEditCard}
                        onChangeMeta={p.onChangeMeta}
                        onRemoveCard={p.onRemoveCard}
                        onAddCard={() => p.onAddCardAt(col.id, row.id)}
                        onAddSubItem={p.onAddSubItem}
                        onPromoteChild={p.onPromoteChild}
                        onCardContextMenu={p.onCardContextMenu}
                        onSlotContextMenu={p.onSlotContextMenu}
                        metaFields={config.cardMetaFields}
                        compact
                      />
                    </SectionContainer>
                  </div>
                );
              })}
            </div>
          ))}

          {!config.fixedRows && (
            <div className="flex items-center" style={{ gap: GUTTER }}>
              <AddSlotButton
                label={`Add ${config.rowNoun}`}
                agentBusy={agentBusy}
                onAdd={() =>
                  p.commitOps([
                    { op: "addRow", label: `New ${config.rowNoun}`, atIndex: map.rows.length },
                  ])
                }
                fullWidth
                width={LABEL_W}
              />
            </div>
          )}
        </div>
        </SortableContext>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ColCardStack — used inside both kanban SectionContainers and matrix cells
// ═════════════════════════════════════════════════════════════════════════════

function ColCardStack({
  colId,
  rowId,
  rowKind,
  cards,
  childrenByParent,
  agentBusy,
  selectedCardIds,
  draggingGroupIds,
  draggingAnchorId,
  onCardSelect,
  onEditCard,
  onChangeMeta,
  onRemoveCard,
  onAddCard,
  onAddSubItem,
  onPromoteChild,
  onCardContextMenu,
  onSlotContextMenu,
  metaFields,
  compact = false,
}: {
  colId: string;
  rowId: string;
  rowKind: string;
  cards: Card[];
  childrenByParent: Map<string, Card[]>;
  agentBusy: boolean;
  selectedCardIds: Set<string>;
  draggingGroupIds: Set<string>;
  draggingAnchorId: string | null;
  onCardSelect: (id: string, additive: boolean) => void;
  onEditCard: (id: string, text: string) => void;
  onChangeMeta: (id: string, key: string, value: string | null) => void;
  onRemoveCard: (id: string) => void;
  onAddCard: () => void;
  onAddSubItem: (parentCardId: string) => void;
  onPromoteChild: (childId: string) => void;
  onCardContextMenu: (e: React.MouseEvent, cardId: string) => void;
  onSlotContextMenu: (e: React.MouseEvent, colId: string, rowId: string) => void;
  metaFields?: CardMetaField[];
  compact?: boolean;
}) {
  const drop = useDroppable({
    id: `slot:${colId}:${rowId}`,
    data: { kind: "slot", colId, rowId },
  });
  const sorted = [...cards].sort((a, b) => a.order - b.order);

  // Phase C: split positioned cards (meta.x set) from stacked cards.
  const positioned = sorted.filter((c) => inferPresentMode(c) !== "stacked");
  const stacked = sorted.filter((c) => inferPresentMode(c) === "stacked");
  const hasPositioned = positioned.length > 0;

  return (
    <div
      ref={drop.setNodeRef}
      className={[
        "flex flex-col gap-2 rounded-xl transition-colors",
        compact ? "min-h-[120px] p-1" : "min-h-[140px] p-1",
        hasPositioned ? "relative overflow-visible" : "",
        drop.isOver ? "bg-ink-primary/[0.05] ring-2 ring-ink-primary/30 ring-inset" : "",
      ].join(" ")}
    >
      {sorted.length === 0 ? (
        <EmptySlot
          droppableId={`slot:${colId}:${rowId}`}
          droppableData={{ kind: "slot", colId, rowId }}
          agentBusy={agentBusy}
          onAdd={onAddCard}
          size="short"
          label="Add card"
          onContextMenu={(e) => onSlotContextMenu(e, colId, rowId)}
        />
      ) : (
        <>
          {positioned.map((card) => {
            const mode = inferPresentMode(card);
            if (mode === "stacked") return null;
            return (
              <PresentedCard
                key={card.id}
                card={card}
                themeKind={rowKind}
                mode={mode}
                isSelected={selectedCardIds.has(card.id)}
                agentBusy={agentBusy}
                onSelect={onCardSelect}
                onTextChange={onEditCard}
                onContextMenu={onCardContextMenu}
              />
            );
          })}
          {stacked.map((card) => (
            <GridCard
              key={card.id}
              card={card}
              themeKind={rowKind}
              metaFields={metaFields}
              layoutMode="stack"
              isSelected={selectedCardIds.has(card.id)}
              isInDragGroup={
                draggingGroupIds.has(card.id) && card.id !== draggingAnchorId
              }
              agentBusy={agentBusy}
              subItems={childrenByParent.get(card.id)}
              selectedChildIds={selectedCardIds}
              onChildSelect={onCardSelect}
              onChildTextChange={onEditCard}
              onChildRemove={onRemoveCard}
              onChildPromote={onPromoteChild}
              onAddChild={onAddSubItem}
              onSelect={onCardSelect}
              onTextChange={onEditCard}
              onMetaChange={onChangeMeta}
              onRemove={onRemoveCard}
              onContextMenu={onCardContextMenu}
            />
          ))}
          {!hasPositioned && <AddCardButton agentBusy={agentBusy} onAdd={onAddCard} />}
        </>
      )}
    </div>
  );
}

function SubGroup({
  label,
  kind,
  colId,
  rowId,
  cards,
  childrenByParent,
  agentBusy,
  selectedCardIds,
  draggingGroupIds,
  draggingAnchorId,
  onCardSelect,
  onEditCard,
  onChangeMeta,
  onRemoveCard,
  onAddCard,
  onAddSubItem,
  onPromoteChild,
  onCardContextMenu,
  onSlotContextMenu,
  metaFields,
}: {
  label: string;
  kind: string;
  colId: string;
  rowId: string;
  cards: Card[];
  childrenByParent: Map<string, Card[]>;
  agentBusy: boolean;
  selectedCardIds: Set<string>;
  draggingGroupIds: Set<string>;
  draggingAnchorId: string | null;
  onCardSelect: (id: string, additive: boolean) => void;
  onEditCard: (id: string, text: string) => void;
  onChangeMeta: (id: string, key: string, value: string | null) => void;
  onRemoveCard: (id: string) => void;
  onAddCard: () => void;
  onAddSubItem: (parentCardId: string) => void;
  onPromoteChild: (childId: string) => void;
  onCardContextMenu: (e: React.MouseEvent, cardId: string) => void;
  onSlotContextMenu: (e: React.MouseEvent, colId: string, rowId: string) => void;
  metaFields?: CardMetaField[];
}) {
  const theme = kindTheme(kind);
  const Icon = theme.Icon;
  return (
    <div className="flex flex-col gap-1.5">
      {/* SubGroup divider — gives affinity card-type rows real visual weight inside their col */}
      <div
        className={[
          "flex items-center gap-2 px-2 py-1 rounded-md border-l-2",
          theme.accentBorder,
          "bg-ink-primary/[0.03]",
        ].join(" ")}
      >
        <Icon className={`h-3.5 w-3.5 ${theme.accentText}`} />
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-secondary">
          {label}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-muted">
          {cards.length.toString().padStart(2, "0")}
        </span>
      </div>
      <ColCardStack
        colId={colId}
        rowId={rowId}
        rowKind={kind}
        cards={cards}
        childrenByParent={childrenByParent}
        agentBusy={agentBusy}
        selectedCardIds={selectedCardIds}
        draggingGroupIds={draggingGroupIds}
        draggingAnchorId={draggingAnchorId}
        onCardSelect={onCardSelect}
        onEditCard={onEditCard}
        onChangeMeta={onChangeMeta}
        onRemoveCard={onRemoveCard}
        onAddCard={onAddCard}
        onAddSubItem={onAddSubItem}
        onPromoteChild={onPromoteChild}
        onCardContextMenu={onCardContextMenu}
        onSlotContextMenu={onSlotContextMenu}
        metaFields={metaFields}
        compact
      />
    </div>
  );
}

// Tiny add-another button used at the bottom of populated card stacks.
function AddCardButton({
  agentBusy,
  onAdd,
}: {
  agentBusy: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      disabled={agentBusy}
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      className="w-full h-8 rounded-md border border-dashed border-border-soft hover:border-border-medium hover:bg-white/40 text-ink-muted hover:text-ink-secondary text-[10px] font-mono tracking-[0.18em] uppercase transition-colors flex items-center justify-center gap-1.5"
    >
      <span className="text-[12px] leading-none">+</span>
      Card
    </button>
  );
}
