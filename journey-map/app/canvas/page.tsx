"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
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
import { PendingBoardSkeleton } from "@/components/PendingBoardSkeleton";

export default function CanvasPage() {
  return (
    <ZoomProvider>
      <CanvasPageInner />
    </ZoomProvider>
  );
}

function CanvasPageInner() {
  const {
    hydrated,
    boards,
    activeBoardId,
    addBoard,
    updateBoardMap,
    updateBoardTitle,
    setBoardSelection,
    pending,
    cancelPending,
  } = useCanvas();
  const activeBoard = useActiveBoard();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState<GenerateEvent<UniversalMap> | null>(null);
  const cancelGenerationRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { fitToContent } = useZoom();

  // Resolve the framework the active board is showing. When there is no active
  // board (empty workspace), we render a placeholder and skip the copilot.
  const framework = activeBoard ? safelyGetFramework(activeBoard.frameworkId, activeBoard.customConfig) : null;

  const generationActive =
    generation !== null && generation.phase !== "result" && generation.phase !== "error";

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelGenerationRef.current = cancel;
  }, []);

  const onGenerationCancel = useCallback(() => {
    cancelGenerationRef.current?.();
    setGeneration(null);
  }, []);

  const fitNow = useCallback(() => {
    const node = stageRef.current;
    if (!node) return;
    fitToContent(
      { width: node.scrollWidth, height: node.scrollHeight },
      { width: window.innerWidth, height: window.innerHeight },
      0.86
    );
  }, [fitToContent]);

  const prevBoardId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (prevBoardId.current !== activeBoardId) {
      prevBoardId.current = activeBoardId;
      requestAnimationFrame(fitNow);
    }
  }, [activeBoardId, fitNow]);

  useEffect(() => {
    const onResize = () => fitNow();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitNow]);

  // Apply stored theme/DS to [data-map-page] whenever the active board changes.
  // (Phase 2 will shift this to a canvas-root target; for now keep behavior
  // identical to the pre-refactor single-board page so theming doesn't regress.)
  useLayoutEffect(() => {
    let cancelled = false;
    let tries = 0;
    function applyFromStorage() {
      if (cancelled) return;
      const target = document.querySelector<HTMLElement>("[data-map-page]");
      if (!target) {
        if (tries++ < 20) requestAnimationFrame(applyFromStorage);
        return;
      }
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
    }
    applyFromStorage();
    return () => { cancelled = true; };
  }, [activeBoardId]);

  const onTitleChange = useCallback(
    (title: string) => {
      if (!activeBoard) return;
      updateBoardTitle(activeBoard.id, title);
    },
    [activeBoard, updateBoardTitle]
  );

  function handleCustomGenerated(cfg: FrameworkConfig, populatedMap: UniversalMap) {
    addBoard({
      frameworkId: cfg.id,
      customConfig: cfg,
      title: populatedMap.title || cfg.label,
      map: populatedMap,
      makeActive: true,
    });
    setDialogOpen(false);
  }

  const allFrameworks = listFrameworks();

  // ── Empty state ────────────────────────────────────────────────────────────
  if (hydrated && boards.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="max-w-sm text-center space-y-4 px-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-primary/[0.06] text-ink-primary mx-auto">
            <Plus className="h-5 w-5" />
          </div>
          <h1 className="text-[18px] font-medium text-ink-primary">Empty workspace</h1>
          <p className="text-[13px] text-ink-muted leading-relaxed">
            Head back to the home screen to describe what you want to build, or pick a framework from the library.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink-primary text-white px-4 py-2 text-[13px] font-medium hover:bg-[#1b1c20] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Start from home
            </Link>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-border-soft hover:border-border-medium px-4 py-2 text-[13px] text-ink-primary transition-colors"
            >
              Describe a framework
            </button>
          </div>
        </div>
        <CustomFrameworkDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSuccess={handleCustomGenerated}
          existingIds={allFrameworks.map((fw) => fw.id)}
        />
      </div>
    );
  }

  if (!activeBoard) {
    return <div className="fixed inset-0" />;
  }

  const isPendingDescribe = activeBoard.status === "pending-describe";
  const isPendingGenerate = activeBoard.status === "pending-generate";
  const pendingForActive = pending && pending.boardId === activeBoard.id ? pending : null;

  // If the active board is waiting for describe, we render the skeleton and
  // skip the framework renderer entirely (the board's frameworkId is a
  // placeholder until describe resolves).
  if (isPendingDescribe) {
    return (
      <div className="fixed inset-0">
        <Canvas locked>
          <div ref={stageRef} className="p-12">
            <PendingBoardSkeleton
              title={activeBoard.title || "Designing framework…"}
              prompt={activeBoard.pendingPrompt}
              statusLabel={
                pendingForActive?.error
                  ? "Error"
                  : "Designing structure and filling in content…"
              }
            />
          </div>
        </Canvas>

        <GenerationOverlay
          active={!pendingForActive?.error}
          progress={null}
          onCancel={() => {
            cancelPending();
          }}
          frameworkLabel="your framework"
        />

        {pendingForActive?.error && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 glass rounded-xl px-4 py-3 text-[13px] text-rose-900 bg-rose-50/80 border border-rose-100 max-w-md">
            {pendingForActive.error}
          </div>
        )}
      </div>
    );
  }

  // For pending-generate OR ready boards we need the framework component.
  if (!framework) {
    return <div className="fixed inset-0" />;
  }

  const Component = framework.Component;

  return (
    <div className="fixed inset-0">
      <Canvas locked={generationActive || isPendingGenerate}>
        <div ref={stageRef} className="p-12">
          <div
            data-map-page
            className={[
              "inline-block rounded-3xl bg-surface",
              "px-10 py-10 md:px-12 md:py-12",
              "shadow-panel ring-1 ring-border-soft/70",
            ].join(" ")}
          >
            <Component
              map={activeBoard.map}
              onChange={(next) => updateBoardMap(activeBoard.id, next)}
              busy={busy || isPendingGenerate}
              selection={activeBoard.selection}
              onSelectionChange={(sel) =>
                setBoardSelection(activeBoard.id, (sel ?? null) as never)
              }
            />
          </div>
        </div>
      </Canvas>

      {/* Library toggle — fixed bottom-left */}
      <div className="fixed bottom-4 left-4 z-40">
        <button
          onClick={() => setLibraryOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-md ring-1 ring-slate-200 hover:ring-slate-300 transition"
        >
          <span className="text-slate-400">⊞</span>
          Library
        </button>
      </div>

      {libraryOpen && (
        <div
          className="fixed bottom-16 left-4 z-40 w-[320px] max-h-[70vh] overflow-y-auto rounded-2xl bg-white shadow-panel ring-1 ring-border-soft p-4"
        >
          <FrameworkLibrary
            compact
            hideCustomCard={false}
            selectedId={null}
            onSelect={(id) => {
              if (id === null) {
                setDialogOpen(true);
                setLibraryOpen(false);
                return;
              }
              const fw = allFrameworks.find((f) => f.id === id);
              if (!fw) return;
              addBoard({
                frameworkId: fw.id,
                customConfig: isDynamicFramework(fw.id) ? fw.config : undefined,
                title: fw.seed.title || fw.label,
                map: fw.seed,
                makeActive: true,
              });
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

      <TopBar
        title={activeBoard.map.title ?? ""}
        onTitleChange={onTitleChange}
        map={activeBoard.map}
        exportLocked={generationActive}
      />

      <Copilot
        frameworkId={framework.id}
        frameworkLabel={framework.label}
        frameworkConfig={framework.config}
        customConfig={isDynamicFramework(framework.id) ? framework.config : undefined}
        frameworkSubtitle={framework.config.chatSubtitle}
        chatPlaceholder={framework.config.chatPlaceholder}
        frameworkOptions={allFrameworks.map((fw) => ({ id: fw.id, label: fw.label }))}
        onFrameworkChange={(nextId) => {
          // Switch the active board to use a different framework — applies the
          // new framework's seed as the board's map (matches pre-refactor UX).
          const next = allFrameworks.find((fw) => fw.id === nextId);
          if (!next || !activeBoard) return;
          updateBoardMap(activeBoard.id, next.seed);
        }}
        map={activeBoard.map}
        onMapChange={(next) => updateBoardMap(activeBoard.id, next)}
        applyOps={framework.applyOps}
        exampleInstructions={framework.exampleInstructions}
        onBusyChange={setBusy}
        focus={activeBoard.selection}
        onFocusClear={() => setBoardSelection(activeBoard.id, null)}
        onGenerationProgress={setGeneration}
        registerGenerationCancel={registerCancel}
      />

      <ZoomControls onFit={fitNow} />

      <GenerationOverlay
        active={generationActive || isPendingGenerate}
        progress={pendingForActive?.lastEvent ?? generation}
        onCancel={() => {
          if (isPendingGenerate) cancelPending();
          else onGenerationCancel();
        }}
        frameworkLabel={framework.label}
      />

      {pendingForActive?.error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 glass rounded-xl px-4 py-3 text-[13px] text-rose-900 bg-rose-50/80 border border-rose-100 max-w-md">
          {pendingForActive.error}
        </div>
      )}
    </div>
  );
}

// Guarded getFramework — if a board references a custom framework that failed
// to re-register (shouldn't happen after hydration, but defend anyway), fall
// back to returning null so the page renders the empty state instead of crashing.
function safelyGetFramework(id: string, customConfig?: FrameworkConfig) {
  try {
    return getFramework(id);
  } catch {
    if (customConfig) {
      // This should be unreachable because context.tsx registers customConfig
      // on load and on addBoard — keep the guard minimal.
      return null;
    }
    return null;
  }
}
