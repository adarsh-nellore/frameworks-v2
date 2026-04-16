"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  JourneyMap as JM,
  JourneyMapSelection,
} from "@/lib/frameworks/journey-map/types";
import type { Op } from "@/lib/frameworks/journey-map/ops";
import { applyOps } from "@/lib/frameworks/journey-map/ops";
import { Cell } from "./Cell";
import { StageHeader } from "./StageHeader";
import { RowLabel } from "./RowLabel";
import { CardOverlay } from "./dnd/CardOverlay";
import { EdgeDroppable } from "./dnd/EdgeDroppable";
import { EmptySlot } from "./dnd/EmptySlot";

const LABEL_W = 200;
const CARD_W = 280;
const GUTTER_W = 24;

type ActiveDrag =
  | { kind: "card"; anchorId: string; ids: string[] }
  | { kind: "row"; id: string }
  | { kind: "stage"; id: string }
  | null;

type Props = {
  map: JM;
  onChange: (next: JM) => void;
  busy?: boolean;
  /** Controlled selection — typed `unknown` for framework registry compatibility. */
  selection: unknown;
  onSelectionChange: (next: unknown) => void;
};

export function JourneyMap({
  map,
  onChange,
  busy,
  selection: selectionProp,
  onSelectionChange,
}: Props) {
  const selection = (selectionProp ?? null) as JourneyMapSelection | null;

  const agentBusy = !!busy;
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [dragOverlayTarget, setDragOverlayTarget] = useState<HTMLElement | null>(
    null
  );

  useEffect(() => {
    setDragOverlayTarget(document.body);
  }, []);

  const stageIds = useMemo(() => map.stages.map((s) => s.id), [map.stages]);
  const rowIds = useMemo(() => map.rows.map((r) => r.id), [map.rows]);

  const cellsByPos = useMemo(() => {
    const out: Record<string, (typeof map.cells)[number]> = {};
    for (const c of map.cells) out[`${c.rowId}:${c.stageId}`] = c;
    return out;
  }, [map.cells]);

  // Walk row-major to assign each cell a 1-based display number.
  const cellNum = useMemo(() => {
    const out: Record<string, number> = {};
    let n = 1;
    for (const r of map.rows) {
      for (const s of map.stages) {
        const c = cellsByPos[`${r.id}:${s.id}`];
        if (c) out[c.id] = n++;
      }
    }
    return out;
  }, [map.rows, map.stages, cellsByPos]);

  const selectedBlockIds = useMemo(
    () =>
      selection?.type === "blocks"
        ? new Set(selection.ids)
        : new Set<string>(),
    [selection]
  );

  // Esc / click-outside to clear selection (keep focus when using floating copilot).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSelectionChange(null);
    }
    function onMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (
        !t.closest(
          [
            "[data-block]",
            "[data-row]",
            "[data-stage]",
            "[data-empty-slot]",
            "[data-floating]",
            "[data-copilot]",
            "[data-edge-zone]",
          ].join(",")
        )
      )
        onSelectionChange(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onSelectionChange]);

  // Apply ops and emit upward.
  function dispatch(ops: Op[]) {
    if (!ops.length) return;
    const result = applyOps(map, ops);
    if (result.ok) onChange(result.map);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    const a = event.active;
    const kind = a.data.current?.kind as string | undefined;
    if (kind === "card") {
      const cellId = String(a.id);
      const isInSel =
        selection?.type === "blocks" && selection.ids.includes(cellId);
      if (
        isInSel &&
        selection?.type === "blocks" &&
        selection.ids.length > 1
      ) {
        setActiveDrag({ kind: "card", anchorId: cellId, ids: selection.ids });
      } else {
        onSelectionChange({ type: "blocks", ids: [cellId] });
        setActiveDrag({ kind: "card", anchorId: cellId, ids: [cellId] });
      }
    } else if (kind === "row") {
      setActiveDrag({ kind: "row", id: String(a.id) });
    } else if (kind === "stage") {
      setActiveDrag({ kind: "stage", id: String(a.id) });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const drag = activeDrag;
    setActiveDrag(null);
    if (!over) return;

    const aKind = active.data.current?.kind as string | undefined;
    const oKind = over.data.current?.kind as string | undefined;
    const overId = String(over.id);
    const aId = String(active.id);

    if (aKind === "card") {
      // Drag-past-edge: add new stage / row, then move anchor into it.
      if (oKind === "add-stage") return handleDropOnNewStage(aId);
      if (oKind === "add-row") return handleDropOnNewRow(aId);

      // Drop onto empty slot → relocate (single card). Source becomes empty.
      if (oKind === "empty-slot") {
        const overData = over.data.current as {
          rowId: string;
          stageId: string;
        };
        dispatch([
          {
            op: "moveCell",
            cellId: aId,
            toRowId: overData.rowId,
            toStageId: overData.stageId,
          },
        ]);
        return;
      }

      // Cell-on-cell swap or block move.
      if (oKind === "card") {
        if (aId === overId) return;
        const ids: string[] =
          drag?.kind === "card" && drag.ids.includes(aId) ? drag.ids : [aId];
        if (ids.length === 1) {
          dispatch([{ op: "swapCells", aCellId: aId, bCellId: overId }]);
        } else {
          const overData = over.data.current as {
            rowId: string;
            colIdx: number;
          };
          dispatch([
            {
              op: "moveBlock",
              anchorCardId: aId,
              cardIds: ids,
              toRowId: overData.rowId,
              toIndex: overData.colIdx,
            },
          ]);
        }
      }
      return;
    }

    if (aKind === "row" && oKind === "row") {
      const oIdx = rowIds.indexOf(overId);
      if (oIdx >= 0 && aId !== overId)
        dispatch([{ op: "moveRow", rowId: aId, toIndex: oIdx }]);
      return;
    }

    if (aKind === "stage" && oKind === "stage") {
      const oIdx = stageIds.indexOf(overId);
      if (oIdx >= 0 && aId !== overId)
        dispatch([{ op: "moveStage", stageId: aId, toIndex: oIdx }]);
      return;
    }
  }

  function handleDropOnNewStage(anchorId: string) {
    const anchorCell = map.cells.find((c) => c.id === anchorId);
    if (!anchorCell) return;
    const after1 = applyOps(map, [{ op: "addStage", label: "New stage" }]);
    if (!after1.ok) return;
    const newStage = after1.map.stages[after1.map.stages.length - 1];
    const after2 = applyOps(after1.map, [
      {
        op: "moveCell",
        cellId: anchorId,
        toRowId: anchorCell.rowId,
        toStageId: newStage.id,
      },
    ]);
    onChange(after2.ok ? after2.map : after1.map);
  }

  function handleDropOnNewRow(anchorId: string) {
    const anchorCell = map.cells.find((c) => c.id === anchorId);
    if (!anchorCell) return;
    const after1 = applyOps(map, [
      { op: "addRow", label: "New row", kind: "actions" },
    ]);
    if (!after1.ok) return;
    const newRow = after1.map.rows[after1.map.rows.length - 1];
    const after2 = applyOps(after1.map, [
      {
        op: "moveCell",
        cellId: anchorId,
        toRowId: newRow.id,
        toStageId: anchorCell.stageId,
      },
    ]);
    onChange(after2.ok ? after2.map : after1.map);
  }

  // Selection / edit handlers — one mode at a time (blocks XOR row XOR stages).
  function onCellSelect(cellId: string, additive: boolean) {
    if (additive && selection?.type === "blocks") {
      const has = selection.ids.includes(cellId);
      const ids = has
        ? selection.ids.filter((i) => i !== cellId)
        : [...selection.ids, cellId];
      onSelectionChange(ids.length ? { type: "blocks", ids } : null);
      return;
    }
    onSelectionChange({ type: "blocks", ids: [cellId] });
  }
  function onCellTextChange(cellId: string, text: string) {
    dispatch([{ op: "setCellText", cellId, text }]);
  }
  function onRowClick(rowId: string) {
    onSelectionChange({ type: "row", id: rowId });
  }
  function onStageClick(stageId: string, e: React.MouseEvent) {
    if (!stageIds.includes(stageId)) return;
    const additive = e.metaKey || e.shiftKey || e.ctrlKey;
    if (additive && selection?.type === "stages") {
      const set = new Set(selection.stageIds);
      if (set.has(stageId)) set.delete(stageId);
      else set.add(stageId);
      const ordered = map.stages.map((s) => s.id).filter((id) => set.has(id));
      onSelectionChange(
        ordered.length ? { type: "stages", stageIds: ordered } : null
      );
      return;
    }
    onSelectionChange({ type: "stages", stageIds: [stageId] });
  }
  function onAddRow() {
    dispatch([{ op: "addRow", label: "New row", kind: "actions" }]);
  }
  function onAddStage() {
    dispatch([{ op: "addStage", label: "New stage" }]);
  }
  function onRowLabelChange(rowId: string, label: string) {
    dispatch([{ op: "renameRow", rowId, label }]);
  }
  function onStageLabelChange(stageId: string, label: string) {
    dispatch([{ op: "renameStage", stageId, label }]);
  }
  function onEmptySlotClick(rowId: string, stageId: string) {
    // Materialize an empty cell at this position; user can immediately edit it.
    const result = applyOps(map, [{ op: "createCell", rowId, stageId }]);
    if (!result.ok) return;
    onChange(result.map);
    const created = result.map.cells.find(
      (c) =>
        c.rowId === rowId &&
        c.stageId === stageId &&
        !map.cells.some((o) => o.id === c.id)
    );
    if (created) onSelectionChange({ type: "blocks", ids: [created.id] });
  }

  const canvasWidth =
    LABEL_W +
    map.stages.length * CARD_W +
    (map.stages.length + 1) * GUTTER_W +
    48; /* room for + button */

  const overlayCell =
    activeDrag?.kind === "card"
      ? map.cells.find((c) => c.id === activeDrag.anchorId)
      : null;
  const overlayCount = activeDrag?.kind === "card" ? activeDrag.ids.length : 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="relative pb-4">
          <div
            className="relative flex flex-col items-stretch"
            style={{ width: canvasWidth, minWidth: "100%" }}
          >
            {/* Header row (stages) */}
            <div
              className="flex items-stretch shrink-0 pb-4"
              style={{ paddingRight: GUTTER_W }}
            >
              <div className="shrink-0" style={{ width: LABEL_W }} />
              <div
                className="flex items-stretch"
                style={{ paddingLeft: GUTTER_W, paddingRight: GUTTER_W, gap: GUTTER_W }}
              >
                <SortableContext
                  items={stageIds}
                  strategy={horizontalListSortingStrategy}
                >
                  {map.stages.map((s, i) => (
                    <StageHeader
                      key={s.id}
                      stageId={s.id}
                      label={s.label}
                      index={i}
                      isSelected={
                        selection?.type === "stages" &&
                        selection.stageIds.includes(s.id)
                      }
                      agentBusy={agentBusy}
                      onClick={onStageClick}
                      onLabelChange={onStageLabelChange}
                    />
                  ))}
                </SortableContext>
              </div>
              {/* Reserve horizontal space so the + button stays aligned while the
                  add-stage drop strip lives beside the row stack (full grid height). */}
              {activeDrag?.kind === "card" ? (
                <div className="shrink-0 mx-1 w-[64px] pointer-events-none" aria-hidden />
              ) : null}
              <button
                type="button"
                onClick={onAddStage}
                disabled={agentBusy}
                data-add-ctrl
                className="ml-2 h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 shrink-0 disabled:opacity-50"
                aria-label="Add stage"
                title="Add stage"
              >
                +
              </button>
            </div>

            {/* Rows — open layout (no table borders); vertical rhythm via gap */}
            <SortableContext
              items={rowIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex items-stretch">
                <div className="flex min-w-0 flex-1 flex-col gap-6">
                  {map.rows.map((row) => (
                    <div
                      key={row.id}
                      className={[
                        "flex items-stretch rounded-2xl transition-[background-color,box-shadow] duration-150",
                        selection?.type === "row" && selection.id === row.id
                          ? "bg-ink-primary/[0.07] ring-2 ring-ink-primary/35 ring-offset-2 ring-offset-surface shadow-sm"
                          : "",
                      ].join(" ")}
                      data-row-shell
                      {...(selection?.type === "row" && selection.id === row.id
                        ? { "data-row-sel": "" }
                        : {})}
                    >
                      <div className="shrink-0" style={{ width: LABEL_W }}>
                        <RowLabel
                          rowId={row.id}
                          label={row.label}
                          kind={row.kind}
                          isSelected={
                            selection?.type === "row" && selection.id === row.id
                          }
                          agentBusy={agentBusy}
                          onClick={onRowClick}
                          onLabelChange={onRowLabelChange}
                        />
                      </div>
                      <div
                        data-row-track
                        data-row-id={row.id}
                        className="relative flex min-h-[180px] flex-1 items-stretch py-5"
                        style={{
                          paddingLeft: GUTTER_W,
                          paddingRight: GUTTER_W,
                          gap: GUTTER_W,
                        }}
                      >
                        {map.stages.map((stage, colIdx) => {
                          const cell = cellsByPos[`${row.id}:${stage.id}`];
                          if (!cell) {
                            return (
                              <EmptySlot
                                key={`${row.id}:${stage.id}`}
                                rowId={row.id}
                                stageId={stage.id}
                                agentBusy={agentBusy}
                                onClick={onEmptySlotClick}
                              />
                            );
                          }
                          return (
                            <Cell
                              key={cell.id}
                              cellId={cell.id}
                              rowId={row.id}
                              colIdx={colIdx}
                              text={cell.text}
                              num={cellNum[cell.id] ?? 0}
                              rowKind={row.kind}
                              isSelected={selectedBlockIds.has(cell.id)}
                              isInDragGroup={
                                activeDrag?.kind === "card" &&
                                activeDrag.ids.includes(cell.id) &&
                                activeDrag.anchorId !== cell.id
                              }
                              isRowSelected={
                                selection?.type === "row" &&
                                selection.id === row.id
                              }
                              isColumnSelected={
                                selection?.type === "stages" &&
                                selection.stageIds.includes(stage.id)
                              }
                              agentBusy={agentBusy}
                              onSelect={onCellSelect}
                              onTextChange={onCellTextChange}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <EdgeDroppable
                  id="__add-stage__"
                  orientation="vertical"
                  active={activeDrag?.kind === "card"}
                  label="+ stage"
                />
              </div>
            </SortableContext>

            {/* Drag-past-bottom-edge sentinel */}
            <EdgeDroppable
              id="__add-row__"
              orientation="horizontal"
              active={activeDrag?.kind === "card"}
              label="+ row"
            />

            <div className="flex items-center mt-1">
              <div className="shrink-0 px-2" style={{ width: LABEL_W }}>
                <button
                  type="button"
                  onClick={onAddRow}
                  disabled={agentBusy}
                  data-add-ctrl
                  className="h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                  aria-label="Add row"
                  title="Add row"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {agentBusy && (
            <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-start justify-end pointer-events-none">
              <div className="m-3 px-3 py-1.5 rounded-full bg-slate-900 text-white font-mono text-[10px] tracking-wide shadow flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                Rearranging…
              </div>
            </div>
          )}

        {dragOverlayTarget
          ? createPortal(
              <DragOverlay dropAnimation={null}>
                {overlayCell ? (
                  <CardOverlay
                    text={overlayCell.text}
                    num={cellNum[overlayCell.id] ?? 0}
                    groupCount={overlayCount}
                  />
                ) : null}
              </DragOverlay>,
              dragOverlayTarget
            )
          : null}
      </div>
    </DndContext>
  );
}
