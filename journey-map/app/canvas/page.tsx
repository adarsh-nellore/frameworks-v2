"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyDesignSystem,
  applyDesignTokenCssVars,
  applyTheme,
  loadStoredDesignSystemJson,
  loadStoredDesignTokenCssVarsJson,
  loadStoredThemeJson,
  parseDesignSystem,
  parseThemeImport,
} from "@/lib/theme";
import { Canvas } from "@/components/Canvas";
import { Copilot } from "@/components/Copilot";
import { CustomFrameworkDialog } from "@/components/CustomFrameworkDialog";
import { FrameworkLibrary } from "@/components/FrameworkLibrary";
import { GenerationOverlay } from "@/components/GenerationOverlay";
import { TopBar } from "@/components/TopBar";
import { ZoomControls } from "@/components/ZoomControls";
import { BoardFrame } from "@/components/BoardFrame";
import { BoardsPanel } from "@/components/BoardsPanel";
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
import type { Board } from "@/lib/canvas/types";

export default function CanvasPage() {
  return (
    <ZoomProvider>
      <CanvasPageInner />
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
    pending,
    cancelPending,
  } = useCanvas();
  const activeBoard = useActiveBoard();

  // No boards in the workspace? Send the user back to the landing instead of
  // showing an empty-state page — the landing IS the home. This keeps the app
  // to two meaningful surfaces: the prompt hero and the board workspace.
  useEffect(() => {
    if (hydrated && boards.length === 0) {
      router.replace("/");
    }
  }, [hydrated, boards.length, router]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState<GenerateEvent<UniversalMap> | null>(null);
  const cancelGenerationRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { fitToContent, x: panX, y: panY, scale } = useZoom();

  const activeFramework = activeBoard ? safelyGetFramework(activeBoard.frameworkId) : null;
  const pendingForActive =
    pending && activeBoard && pending.boardId === activeBoard.id ? pending : null;

  const generationActive =
    generation !== null && generation.phase !== "result" && generation.phase !== "error";
  const isPendingGenerate = activeBoard?.status === "pending-generate";
  const isPendingDescribe = activeBoard?.status === "pending-describe";

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelGenerationRef.current = cancel;
  }, []);

  const onGenerationCancel = useCallback(() => {
    cancelGenerationRef.current?.();
    setGeneration(null);
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

  // Re-fit whenever the number of boards changes (new board appears) or the
  // active board changes to something out of view.
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

  // Keyboard: Escape deactivates the current board (Miro/Figma parity —
  // "click off" without actually clicking). Ignored when a text input is
  // focused so we don't eat Escape in titles or copilot.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (activeBoardId) setActiveBoardId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeBoardId, setActiveBoardId]);

  // Apply stored theme/DS globally to the canvas root rather than per-board,
  // so every board on the workspace shares one visual language.
  useLayoutEffect(() => {
    const target = document.documentElement;
    try {
      const themeRaw = loadStoredThemeJson();
      if (themeRaw) {
        try {
          const parsed = parseThemeImport(JSON.parse(themeRaw) as unknown);
          if (parsed.ok) applyTheme(parsed.theme, target);
        } catch { /* ignore */ }
      }
      const extra = loadStoredDesignTokenCssVarsJson();
      if (extra) {
        try {
          applyDesignTokenCssVars(JSON.parse(extra) as Record<string, string>, target);
        } catch {
          applyDesignTokenCssVars(undefined, target);
        }
      } else {
        applyDesignTokenCssVars(undefined, target);
      }
      const dsRaw = loadStoredDesignSystemJson();
      if (dsRaw) {
        try {
          const parsed = parseDesignSystem(JSON.parse(dsRaw) as unknown);
          if (parsed.ok) applyDesignSystem(parsed.ds, target);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, []);

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

  // Hydrated but no boards → the redirect effect above will fire; render
  // nothing for a beat rather than flashing the old empty state.
  if (hydrated && boards.length === 0) {
    return <div className="fixed inset-0" />;
  }

  // Clicking blank canvas space deactivates the current board. Skip any
  // click that lands inside a board, any floating chrome (copilot, topbar,
  // zoom controls, library toggle), or an interactive form control —
  // otherwise typing in the copilot would silently unselect the board.
  function onCanvasBackgroundClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-board-frame]")) return;
    if (target.closest("[data-floating]")) return;
    if (target.closest("input,textarea,button,a,select,[role='button']")) return;
    setActiveBoardId(null);
  }

  return (
    <div className="fixed inset-0" onPointerDown={onCanvasBackgroundClick}>
      <Canvas locked={generationActive || isPendingGenerate || isPendingDescribe}>
        <div ref={stageRef} className="relative p-12" style={{ minWidth: 800, minHeight: 600 }}>
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

      {/* Library toggle — fixed bottom-left. Opens the same pill picker as the
          landing, but here clicking a framework creates a new board beside the
          current ones rather than replacing the active board. */}
      <div className="fixed bottom-4 left-4 z-40" data-floating>
        <button
          onClick={() => setLibraryOpen((o) => !o)}
          className="glass rounded-xl px-3 py-2 text-[12px] font-medium text-ink-primary inline-flex items-center gap-2 hover:bg-white/90 transition"
        >
          <span className="text-ink-muted">⊞</span>
          Add from library
        </button>
      </div>

      {libraryOpen && (
        <div
          data-floating
          className="fixed bottom-16 left-4 z-40 w-[320px] max-h-[70vh] overflow-y-auto glass rounded-2xl p-4"
        >
          <FrameworkLibrary
            compact
            selectedId={null}
            onSelect={(id) => {
              if (id === null) {
                setDialogOpen(true);
                setLibraryOpen(false);
                return;
              }
              addBoardFromTemplate(id);
              setLibraryOpen(false);
            }}
          />
        </div>
      )}

      <CustomFrameworkDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleCustomGenerated}
        existingIds={allFrameworks.map((fw) => fw.id)}
      />

      {/* TopBar + Copilot are bound to the ACTIVE board. If nothing is active,
          they render nothing meaningful — user clicks a board first. */}
      {activeBoard && activeFramework && (
        <>
          <TopBar
            title={activeBoard.map.title ?? activeBoard.title ?? ""}
            onTitleChange={onTitleChange}
            map={activeBoard.map}
            exportLocked={generationActive}
          />

          <Copilot
            frameworkId={activeFramework.id}
            frameworkLabel={activeFramework.label}
            frameworkConfig={activeFramework.config}
            customConfig={isDynamicFramework(activeFramework.id) ? activeFramework.config : undefined}
            frameworkSubtitle={activeFramework.config.chatSubtitle}
            chatPlaceholder={activeFramework.config.chatPlaceholder}
            frameworkOptions={allFrameworks.map((fw) => ({ id: fw.id, label: fw.label }))}
            onFrameworkChange={(nextId) => {
              // Changing the active board's framework — reseed the map. This
              // matches the pre-refactor UX; down the line we may want to ask
              // before clobbering a populated board.
              const next = allFrameworks.find((fw) => fw.id === nextId);
              if (!next || !activeBoard) return;
              updateBoardMap(activeBoard.id, next.seed);
            }}
            map={activeBoard.map}
            onMapChange={(next) => updateBoardMap(activeBoard.id, next)}
            applyOps={activeFramework.applyOps}
            exampleInstructions={activeFramework.exampleInstructions}
            onBusyChange={setBusy}
            focus={activeBoard.selection}
            onFocusClear={() => setBoardSelection(activeBoard.id, null)}
            onGenerationProgress={setGeneration}
            registerGenerationCancel={registerCancel}
          />
        </>
      )}

      <BoardsPanel
        boards={boards}
        activeBoardId={activeBoardId}
        pendingBoardId={pending?.boardId ?? null}
        onActivate={setActiveBoardId}
      />

      <ZoomControls onFit={fitAll} />

      {(activeBoard && (isPendingGenerate || generationActive)) && (
        <GenerationOverlay
          active
          progress={pendingForActive?.lastEvent ?? generation}
          onCancel={() => {
            if (isPendingGenerate) cancelPending();
            else onGenerationCancel();
          }}
          frameworkLabel={activeFramework?.label ?? "your framework"}
        />
      )}

      {/* Bottom-center error toast for pending failures */}
      {pendingForActive?.error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 glass rounded-xl px-4 py-3 text-[13px] text-rose-900 bg-rose-50/80 border border-rose-100 max-w-md">
          {pendingForActive.error}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function safelyGetFramework(id: string) {
  try {
    return getFramework(id);
  } catch {
    return null;
  }
}

/** Canvas-space position for a new board, centered on the current viewport.
 *  Canvas coords = (screen - pan) / scale. Returns the top-left of a ~900x600
 *  board so its visual center lands near the viewport center. */
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
  // If this exact position is already very close to another board, nudge to avoid overlap.
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
