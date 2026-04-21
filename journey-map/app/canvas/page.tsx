"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@/components/Canvas";
import { Copilot } from "@/components/Copilot";
import { CustomFrameworkDialog } from "@/components/CustomFrameworkDialog";
import { TopBar } from "@/components/TopBar";
import { ZoomControls } from "@/components/ZoomControls";
import { BoardFrame } from "@/components/BoardFrame";
import { WorkspaceMenu } from "@/components/WorkspaceMenu";
import { CanvasContextMenuProvider } from "@/components/ui/CanvasContextMenu";
import {
  getFramework,
  isDynamicFramework,
  listFrameworks,
} from "@/lib/frameworks";
import type { GenerateEvent } from "@/lib/pipeline/events";
import type { FrameworkConfig } from "@/lib/frameworks/universal/config";
import type { UniversalMap } from "@/lib/frameworks/universal/types";
import { ZoomProvider, useZoom } from "@/lib/zoom-context";
import { useCanvas, useActiveBoard } from "@/lib/canvas/context";
import { getAttachmentAsFile } from "@/lib/canvas/attachments-store";
import type { Board } from "@/lib/canvas/types";

export default function CanvasPage() {
  return (
    <ZoomProvider>
      <CanvasContextMenuProvider>
        <CanvasPageInner />
      </CanvasContextMenuProvider>
    </ZoomProvider>
  );
}

function CanvasPageInner() {
  const router = useRouter();
  const {
    hydrated,
    boards,
    activeBoardId,
    addBoard,
    removeBoard,
    duplicateBoard,
    updateBoardMap,
    updateBoardTitle,
    moveBoard,
    setBoardSelection,
    setActiveBoardId,
    attachFileToBoard,
    removeAttachment,
    pending,
    cancelPending,
  } = useCanvas();
  const activeBoard = useActiveBoard();
  const { projects } = useCanvas();

  // First-time user (exactly one project, no boards, and that project's single
  // canvas is also empty) → send to the landing page which IS the "add your
  // first board" surface. Users with multiple projects are allowed to sit on
  // an empty project — switching back to it is a valid state.
  useEffect(() => {
    if (!hydrated) return;
    if (boards.length > 0) return;
    if (projects.length > 1) return;
    const onlyProject = projects[0];
    const totalBoards = onlyProject?.canvases.reduce(
      (acc, c) => acc + c.boards.length,
      0
    ) ?? 0;
    if (totalBoards > 0) return;
    router.replace("/");
  }, [hydrated, boards.length, projects, router]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, setBusy] = useState(false);
  const [generation, setGeneration] = useState<GenerateEvent<UniversalMap> | null>(null);
  const cancelGenerationRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { fitToContent, x: panX, y: panY, scale } = useZoom();

  const activeFramework = activeBoard ? safelyGetFramework(activeBoard.frameworkId) : null;

  const generationActive =
    generation !== null && generation.phase !== "result" && generation.phase !== "error";
  const isPendingGenerate = activeBoard?.status === "pending-generate";
  const isPendingDescribe = activeBoard?.status === "pending-describe";

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelGenerationRef.current = cancel;
  }, []);

  // Fit the union of all boards to the viewport. Used on first mount and after
  // a new board is added so the user sees the full workspace.
  const fitAll = useCallback(() => {
    const node = stageRef.current;
    if (!node) return;
    fitToContent(
      { width: node.scrollWidth, height: node.scrollHeight },
      { width: window.innerWidth, height: window.innerHeight },
      0.86
    );
  }, [fitToContent]);

  const prevBoardsLen = useRef(boards.length);
  useLayoutEffect(() => {
    if (prevBoardsLen.current !== boards.length) {
      prevBoardsLen.current = boards.length;
      requestAnimationFrame(fitAll);
    }
  }, [boards.length, fitAll]);

  useEffect(() => {
    const onResize = () => fitAll();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitAll]);

  // Keyboard shortcuts at the workspace level — one place, works across every
  // framework layout. The hierarchy is: Cards ⊂ rows/cols ⊂ boards ⊂ canvas.
  // Each shortcut dispatches to the finest-grained active level.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isContentEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || isContentEditable) return;

      if (e.key === "Escape") {
        if (activeBoardId) setActiveBoardId(null);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        if (!activeBoard || !activeFramework) return;
        const sel = activeBoard.selection as
          | { type: "cards"; ids: string[] }
          | { type: "col"; id: string }
          | { type: "row"; id: string }
          | null;
        if (sel?.type === "cards" && sel.ids.length > 0) {
          type AnyOp = { op: string; [k: string]: unknown };
          const ops: AnyOp[] = [];
          for (const id of sel.ids) {
            const card = activeBoard.map.cards.find((c) => c.id === id);
            if (!card) continue;
            ops.push({
              op: "addCard",
              colId: card.colId,
              rowId: card.rowId,
              text: card.text,
              meta: card.meta ? { ...card.meta } : undefined,
            });
          }
          if (ops.length === 0) return;
          const result = activeFramework.applyOps(activeBoard.map, ops as never);
          if (result.ok) updateBoardMap(activeBoard.id, result.map);
          return;
        }
        if (sel?.type === "col") {
          const col = activeBoard.map.cols.find((c) => c.id === sel.id);
          if (!col) return;
          const idx = activeBoard.map.cols.findIndex((c) => c.id === sel.id);
          const result = activeFramework.applyOps(activeBoard.map, [
            {
              op: "addCol",
              label: `${col.label} copy`,
              kind: col.kind,
              atIndex: idx + 1,
            },
          ] as never);
          if (result.ok) updateBoardMap(activeBoard.id, result.map);
          return;
        }
        if (sel?.type === "row") {
          const row = activeBoard.map.rows.find((r) => r.id === sel.id);
          if (!row) return;
          const idx = activeBoard.map.rows.findIndex((r) => r.id === sel.id);
          const result = activeFramework.applyOps(activeBoard.map, [
            {
              op: "addRow",
              label: `${row.label} copy`,
              kind: row.kind,
              atIndex: idx + 1,
            },
          ] as never);
          if (result.ok) updateBoardMap(activeBoard.id, result.map);
          return;
        }
        duplicateBoard(activeBoard.id);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!activeBoard || !activeFramework) return;
        const sel = activeBoard.selection as
          | { type: "cards"; ids: string[] }
          | { type: "col"; id: string }
          | { type: "row"; id: string }
          | null;
        if (sel) {
          // Finest-grained delete — remove just the selection inside the board.
          e.preventDefault();
          type AnyOp = { op: string; [k: string]: unknown };
          const ops: AnyOp[] =
            sel.type === "cards"
              ? sel.ids.map((id) => ({ op: "removeCard", cardId: id }))
              : sel.type === "col"
                ? [{ op: "removeCol", colId: sel.id }]
                : [{ op: "removeRow", rowId: sel.id }];
          const result = activeFramework.applyOps(activeBoard.map, ops as never);
          if (result.ok) {
            updateBoardMap(activeBoard.id, result.map);
            setBoardSelection(activeBoard.id, null);
          }
          return;
        }
        // No sub-selection → board is the delete target. Plain Delete needs a
        // confirm to prevent accidental board loss while panning (the user may
        // not realize the board is still "active" after clicking in the canvas
        // margins). Cmd/Ctrl+Delete is the power-user path and skips the
        // confirm — same intent, keyboard-committed.
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          removeBoard(activeBoard.id);
          return;
        }
        const ok = window.confirm(
          `Delete board "${activeBoard.title || "Untitled"}"? This cannot be undone.`
        );
        if (ok) removeBoard(activeBoard.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeBoardId,
    activeBoard,
    activeFramework,
    setActiveBoardId,
    updateBoardMap,
    setBoardSelection,
    duplicateBoard,
    removeBoard,
  ]);

  const onTitleChange = useCallback(
    (title: string) => {
      if (!activeBoard) return;
      updateBoardTitle(activeBoard.id, title);
    },
    [activeBoard, updateBoardTitle]
  );

  function handleCustomGenerated(cfg: FrameworkConfig, populatedMap: UniversalMap) {
    const placement = viewportCenterInCanvasCoords(panX, panY, scale, boards);
    addBoard({
      frameworkId: cfg.id,
      customConfig: cfg,
      title: populatedMap.title || cfg.label,
      map: populatedMap,
      x: placement.x,
      y: placement.y,
      makeActive: true,
    });
    setDialogOpen(false);
  }

  function addBoardFromTemplate(fwId: string) {
    const fw = listFrameworks().find((f) => f.id === fwId);
    if (!fw) return;
    const placement = viewportCenterInCanvasCoords(panX, panY, scale, boards);
    addBoard({
      frameworkId: fw.id,
      customConfig: isDynamicFramework(fw.id) ? (fw.config as FrameworkConfig) : undefined,
      title: fw.seed.title || fw.label,
      map: fw.seed,
      x: placement.x,
      y: placement.y,
      makeActive: true,
    });
  }

  const allFrameworks = listFrameworks();

  if (hydrated && boards.length === 0 && projects.length <= 1) {
    return <div className="fixed inset-0" />;
  }

  function onCanvasBackgroundClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-board-frame]")) return;
    if (target.closest("[data-floating]")) return;
    if (target.closest("input,textarea,button,a,select,[role='button']")) return;
    if (activeBoardId) setBoardSelection(activeBoardId, null);
    setActiveBoardId(null);
  }

  const copilotDisabled =
    !activeBoard ||
    !activeFramework ||
    // Archetype boards are view-only until ops-over-archetype-doc ships —
    // universal apply_operations can't speak TableDoc / CartesianDoc / etc.
    Boolean(activeBoard?.archetypeId);
  const frameworkOptions = allFrameworks.map((fw) => ({ id: fw.id, label: fw.label }));

  return (
    <div className="fixed inset-0" onPointerDown={onCanvasBackgroundClick}>
      <Canvas locked={generationActive || isPendingGenerate || isPendingDescribe}>
        <div ref={stageRef} className="relative p-12" style={{ minWidth: 800, minHeight: 600 }}>
          {boards.length === 0 && hydrated && (
            <div
              data-floating
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
            >
              <div className="text-[15px] text-ink-secondary mb-1">
                This canvas is empty.
              </div>
              <div className="text-[13px] text-ink-muted">
                Use the Copilot on the right to pick or generate a framework.
              </div>
            </div>
          )}
          {boards.map((board) => (
            <BoardFrame
              key={board.id}
              board={board}
              framework={safelyGetFramework(board.frameworkId)}
              isActive={board.id === activeBoardId}
              pendingStatusLabel={
                pending && pending.boardId === board.id
                  ? statusLabel(pending.lastEvent, pending.kind, !!pending.error)
                  : undefined
              }
              onActivate={() => setActiveBoardId(board.id)}
              onTitleChange={(title) => updateBoardTitle(board.id, title)}
              onMapChange={(next) => updateBoardMap(board.id, next)}
              onSelectionChange={(sel) => setBoardSelection(board.id, sel)}
              onDelete={() => removeBoard(board.id)}
              onDuplicate={() => duplicateBoard(board.id)}
              onMove={(x, y) => moveBoard(board.id, x, y)}
              locked={
                generationActive ||
                (pending?.boardId === board.id && !pending?.error) ||
                (board.status === "pending-generate" || board.status === "pending-describe")
              }
            />
          ))}
        </div>
      </Canvas>

      <CustomFrameworkDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleCustomGenerated}
        existingIds={allFrameworks.map((fw) => fw.id)}
      />

      {/* TopBar is still bound to the active board — it shows the board title
          and export controls. Without an active board there is nothing to put
          there, so we only mount it when a board is active. */}
      {activeBoard && activeFramework && (
        <TopBar
          title={activeBoard.map.title ?? activeBoard.title ?? ""}
          onTitleChange={onTitleChange}
          map={activeBoard.map}
          exportLocked={generationActive}
        />
      )}

      {/* Copilot is persistent. When there's no active board or framework it
          renders in its disabled/empty state — greyed chrome + library/generate
          entry surfaced as the body so the user can get unstuck without
          hunting for another button. */}
      <Copilot
        frameworkId={activeFramework?.id ?? null}
        frameworkLabel={
          activeBoard?.archetypeId
            ? `${activeBoard.archetypeId} (view-only)`
            : (activeFramework?.label ?? "No framework")
        }
        frameworkConfig={activeFramework?.config}
        customConfig={
          activeFramework && isDynamicFramework(activeFramework.id)
            ? activeFramework.config
            : undefined
        }
        frameworkSubtitle={activeFramework?.config.chatSubtitle}
        chatPlaceholder={activeFramework?.config.chatPlaceholder}
        frameworkOptions={frameworkOptions}
        onFrameworkChange={(nextId) => {
          const next = allFrameworks.find((fw) => fw.id === nextId);
          if (!next || !activeBoard) {
            addBoardFromTemplate(nextId);
            return;
          }
          updateBoardMap(activeBoard.id, next.seed);
        }}
        onAddFromLibrary={addBoardFromTemplate}
        onOpenCustomDialog={() => setDialogOpen(true)}
        map={activeBoard?.map ?? null}
        onMapChange={(next) => {
          if (activeBoard) updateBoardMap(activeBoard.id, next);
        }}
        applyOps={
          activeFramework
            ? activeFramework.applyOps
            : // When disabled the composer is locked so applyOps is never invoked — but a
              // function-shaped default keeps the type happy and avoids a null guard at
              // every call site in Copilot.
              (_m: unknown, _ops: unknown[]) => ({
                ok: false as const,
                reason: "disabled",
              })
        }
        exampleInstructions={activeFramework?.exampleInstructions ?? []}
        onBusyChange={setBusy}
        focus={activeBoard?.selection ?? null}
        onFocusClear={() => activeBoard && setBoardSelection(activeBoard.id, null)}
        onGenerationProgress={setGeneration}
        registerGenerationCancel={registerCancel}
        boardAttachments={activeBoard?.attachments ?? []}
        onAttachFile={
          activeBoard
            ? (f) => attachFileToBoard(activeBoard.id, f).then(() => {})
            : undefined
        }
        onRemoveAttachment={
          activeBoard ? (id) => removeAttachment(activeBoard.id, id) : undefined
        }
        loadPersistedFiles={
          activeBoard
            ? async () => {
                const metas = activeBoard.attachments ?? [];
                const out: File[] = [];
                for (const m of metas) {
                  try {
                    const f = await getAttachmentAsFile(
                      activeBoard.id,
                      m.id,
                      m.name,
                      m.mediaType
                    );
                    if (f) out.push(f);
                  } catch {
                    /* skip missing / unreadable */
                  }
                }
                return out;
              }
            : undefined
        }
        disabled={copilotDisabled}
      />

      <WorkspaceMenu pendingBoardId={pending?.boardId ?? null} />

      <ZoomControls onFit={fitAll} />

      {pending?.error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 glass rounded-xl px-4 py-3 pr-9 text-[13px] text-rose-900 bg-rose-50/80 border border-rose-100 max-w-md">
          {pending.error}
          <button
            type="button"
            onClick={cancelPending}
            className="absolute top-2 right-2 h-5 w-5 grid place-items-center rounded hover:bg-rose-100 text-rose-700"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function safelyGetFramework(id: string) {
  try {
    return getFramework(id);
  } catch {
    return null;
  }
}

function viewportCenterInCanvasCoords(
  panX: number,
  panY: number,
  scale: number,
  existing: Board[]
): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const halfW = 450;
  const halfH = 300;
  const x = (vw / 2 - panX) / scale - halfW;
  const y = (vh / 2 - panY) / scale - halfH;
  for (const b of existing) {
    if (Math.abs(b.x - x) < 80 && Math.abs(b.y - y) < 80) {
      return { x: b.x + 40, y: b.y + 40 };
    }
  }
  return { x, y };
}

function statusLabel(
  ev: GenerateEvent<UniversalMap> | null,
  kind: "describe" | "generate",
  hasError: boolean
): string {
  if (hasError) return "Error";
  if (kind === "describe") return "Designing structure and filling in content…";
  if (!ev) return "Starting…";
  switch (ev.phase) {
    case "ingesting":
      return "Reading source material…";
    case "subject_id":
      return "Identifying the subject…";
    case "extracting":
      return "Extracting key details…";
    case "synthesizing":
      return "Structuring into a framework…";
    case "critiquing":
      return "Critiquing output quality…";
    case "revising":
      return "Revising based on critique…";
    default:
      return "Working…";
  }
}
