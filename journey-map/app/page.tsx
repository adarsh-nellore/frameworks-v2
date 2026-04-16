"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyDesignTokenCssVars,
  applyTheme,
  loadStoredDesignTokenCssVarsJson,
  loadStoredThemeJson,
  parseThemeImport,
} from "@/lib/theme";
import { Canvas } from "@/components/Canvas";
import { Copilot } from "@/components/Copilot";
import { GenerationOverlay } from "@/components/GenerationOverlay";
import { TopBar } from "@/components/TopBar";
import { ZoomControls } from "@/components/ZoomControls";
import { getFramework, listFrameworks } from "@/lib/frameworks";
import type { AnyFrameworkModule } from "@/lib/frameworks";
import type { JourneyMapSelection } from "@/lib/frameworks/journey-map/types";
import type { GenerateEvent } from "@/lib/pipeline/events";
import { ZoomProvider, useZoom } from "@/lib/zoom-context";

const DEFAULT_FRAMEWORK_ID = "journey-map";
const STORAGE_KEY = "framework-id";

export default function Page() {
  return (
    <ZoomProvider>
      <PageInner />
    </ZoomProvider>
  );
}

function PageInner() {
  const [frameworkId, setFrameworkId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlFw = params.get("framework");
      if (urlFw) {
        try { getFramework(urlFw); return urlFw; } catch { /* fall through */ }
      }
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { getFramework(stored); return stored; } catch { /* fall through */ }
      }
    }
    return DEFAULT_FRAMEWORK_ID;
  });

  const framework = getFramework(frameworkId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [map, setMap] = useState<any>(framework.seed);
  const [selection, setSelection] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [generation, setGeneration] = useState<GenerateEvent<any> | null>(null);
  const cancelGenerationRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { fitToContent } = useZoom();
  const [frameworkMenuOpen, setFrameworkMenuOpen] = useState(false);

  // Persist selected framework to session storage and URL
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, frameworkId);
    const url = new URL(window.location.href);
    if (frameworkId !== DEFAULT_FRAMEWORK_ID) {
      url.searchParams.set("framework", frameworkId);
    } else {
      url.searchParams.delete("framework");
    }
    window.history.replaceState(null, "", url.toString());
  }, [frameworkId]);

  function switchFramework(fw: AnyFrameworkModule) {
    setFrameworkMenuOpen(false);
    if (fw.id === frameworkId) return;
    setFrameworkId(fw.id);
    setMap(fw.seed);
    setSelection(null);
    setGeneration(null);
  }

  const generationActive =
    generation !== null &&
    generation.phase !== "result" &&
    generation.phase !== "error";

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelGenerationRef.current = cancel;
  }, []);

  const onGenerationCancel = useCallback(() => {
    cancelGenerationRef.current?.();
    setGeneration(null);
  }, []);

  const Component = framework.Component;

  const fitNow = useCallback(() => {
    const node = stageRef.current;
    if (!node) return;
    fitToContent(
      { width: node.scrollWidth, height: node.scrollHeight },
      { width: window.innerWidth, height: window.innerHeight },
      0.86
    );
  }, [fitToContent]);

  // Re-fit when we switch frameworks
  const prevFrameworkId = useRef(frameworkId);
  useLayoutEffect(() => {
    if (prevFrameworkId.current !== frameworkId) {
      prevFrameworkId.current = frameworkId;
      requestAnimationFrame(fitNow);
    }
  }, [frameworkId, fitNow]);

  useEffect(() => {
    const onResize = () => fitNow();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitNow]);

  // Close framework menu on outside click
  useEffect(() => {
    if (!frameworkMenuOpen) return;
    function handler(e: MouseEvent) {
      const t = e.target as Element | null;
      if (!t?.closest("[data-framework-menu]")) setFrameworkMenuOpen(false);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [frameworkMenuOpen]);

  const onTitleChange = useCallback((title: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMap((m: any) => ({ ...m, title }));
  }, []);

  useLayoutEffect(() => {
    try {
      const raw = loadStoredThemeJson();
      if (raw) {
        try {
          const parsed = parseThemeImport(JSON.parse(raw) as unknown);
          if (parsed.ok) applyTheme(parsed.theme);
        } catch { /* ignore corrupt storage */ }
      }
      const extra = loadStoredDesignTokenCssVarsJson();
      if (extra) {
        try {
          applyDesignTokenCssVars(JSON.parse(extra) as Record<string, string>);
        } catch {
          applyDesignTokenCssVars(undefined);
        }
      } else {
        applyDesignTokenCssVars(undefined);
      }
    } catch {
      applyDesignTokenCssVars(undefined);
    }
  }, []);

  const allFrameworks = listFrameworks();

  return (
    <div className="fixed inset-0">
      <Canvas locked={generationActive}>
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
              map={map}
              onChange={setMap}
              busy={busy}
              selection={selection}
              onSelectionChange={setSelection}
            />
          </div>
        </div>
      </Canvas>

      {/* Framework switcher — fixed bottom-left */}
      <div
        data-framework-menu
        className="fixed bottom-4 left-4 z-40"
      >
        {frameworkMenuOpen && (
          <div className="mb-2 flex flex-col gap-1 rounded-xl bg-white shadow-lg ring-1 ring-slate-200 p-1.5">
            {allFrameworks.map((fw) => (
              <button
                key={fw.id}
                onClick={() => switchFramework(fw)}
                className={[
                  "rounded-lg px-3 py-2 text-left text-sm transition",
                  fw.id === frameworkId
                    ? "bg-indigo-100 text-indigo-700 font-medium"
                    : "text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                {fw.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setFrameworkMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-md ring-1 ring-slate-200 hover:ring-slate-300 transition"
        >
          <span className="text-slate-400">⊞</span>
          {framework.label}
          <span className="text-slate-400 text-xs">{frameworkMenuOpen ? "▲" : "▼"}</span>
        </button>
      </div>

      <TopBar
        title={map.title ?? ""}
        onTitleChange={onTitleChange}
        map={map}
        exportLocked={generationActive}
      />

      <Copilot
        frameworkId={framework.id}
        map={map}
        onMapChange={setMap}
        exampleInstructions={framework.exampleInstructions}
        onBusyChange={setBusy}
        focus={selection as JourneyMapSelection | null}
        onFocusClear={() => setSelection(null)}
        onGenerationProgress={setGeneration}
        registerGenerationCancel={registerCancel}
      />

      <ZoomControls onFit={fitNow} />

      <GenerationOverlay
        active={generationActive}
        progress={generation}
        onCancel={onGenerationCancel}
      />
    </div>
  );
}
