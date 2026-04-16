"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyTheme, loadStoredThemeJson, parseThemeV1 } from "@/lib/theme";
import { Canvas } from "@/components/Canvas";
import { Copilot } from "@/components/Copilot";
import { TopBar } from "@/components/TopBar";
import { ZoomControls } from "@/components/ZoomControls";
import { getFramework } from "@/lib/frameworks";
import type {
  JourneyMap as JM,
  JourneyMapSelection,
} from "@/lib/frameworks/journey-map/types";
import { ZoomProvider, useZoom } from "@/lib/zoom-context";

const FRAMEWORK_ID = "journey-map";

export default function Page() {
  return (
    <ZoomProvider>
      <PageInner />
    </ZoomProvider>
  );
}

function PageInner() {
  const framework = getFramework(FRAMEWORK_ID);
  const [map, setMap] = useState<JM>(framework.seed as JM);
  const [selection, setSelection] = useState<JourneyMapSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { fitToContent } = useZoom();

  const Component = framework.Component as React.ComponentType<{
    map: JM;
    onChange: (next: JM) => void;
    busy?: boolean;
    selection: JourneyMapSelection | null;
    onSelectionChange: (next: JourneyMapSelection | null) => void;
  }>;

  // Drop selection ids that no longer exist after agent / user edits.
  useEffect(() => {
    setSelection((sel) => {
      if (!sel) return null;
      if (sel.type === "blocks") {
        const valid = sel.ids.filter((id) => map.cells.some((c) => c.id === id));
        if (
          valid.length === sel.ids.length &&
          valid.every((id, i) => id === sel.ids[i])
        )
          return sel;
        return valid.length ? { type: "blocks", ids: valid } : null;
      }
      if (sel.type === "row") {
        return map.rows.some((r) => r.id === sel.id) ? sel : null;
      }
      const valid = sel.stageIds.filter((id) =>
        map.stages.some((s) => s.id === id)
      );
      const ordered = map.stages
        .map((s) => s.id)
        .filter((id) => valid.includes(id));
      if (
        ordered.length === sel.stageIds.length &&
        ordered.every((id, i) => id === sel.stageIds[i])
      )
        return sel;
      return ordered.length ? { type: "stages", stageIds: ordered } : null;
    });
  }, [map]);

  const fitNow = useCallback(() => {
    const node = stageRef.current;
    if (!node) return;
    // scrollWidth/scrollHeight are unaffected by the canvas's CSS transform,
    // so they give us the natural (unscaled) content size we need to fit.
    fitToContent(
      { width: node.scrollWidth, height: node.scrollHeight },
      { width: window.innerWidth, height: window.innerHeight },
      0.86
    );
  }, [fitToContent]);

  // Re-fit when the map changes shape (rows/stages count) so the framework
  // stays nicely framed after the agent reshapes it. Cell-text edits don't
  // change geometry, so we only refit on row/stage count changes.
  const sigRef = useRef("");
  useLayoutEffect(() => {
    const sig = `${map.rows.length}x${map.stages.length}`;
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    requestAnimationFrame(fitNow);
  }, [map.rows.length, map.stages.length, fitNow]);

  // Re-fit on viewport resize so things stay centered.
  useEffect(() => {
    const onResize = () => fitNow();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitNow]);

  const onTitleChange = useCallback((title: string) => {
    setMap((m) => ({ ...m, title }));
  }, []);

  // Hydrate saved design tokens before paint (localStorage).
  useLayoutEffect(() => {
    const raw = loadStoredThemeJson();
    if (!raw) return;
    try {
      const parsed = parseThemeV1(JSON.parse(raw) as unknown);
      if (parsed.ok) applyTheme(parsed.theme);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  return (
    <div className="fixed inset-0">
      <Canvas>
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

      <TopBar title={map.title} onTitleChange={onTitleChange} data={map} map={map} />

      <Copilot
        frameworkId={framework.id}
        map={map}
        onMapChange={setMap}
        exampleInstructions={framework.exampleInstructions}
        onBusyChange={setBusy}
        focus={selection}
        onFocusClear={() => setSelection(null)}
      />

      <ZoomControls onFit={fitNow} />
    </div>
  );
}
