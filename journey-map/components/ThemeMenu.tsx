"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Palette, RotateCcw, Upload } from "lucide-react";
import type { JourneyMap } from "@/lib/frameworks/journey-map/types";
import {
  applyTheme,
  buildHandoffJson,
  clearAppliedTheme,
  clearStoredTheme,
  DEFAULT_THEME_V1,
  loadStoredThemeJson,
  parseThemeV1,
  saveStoredThemeJson,
  serializeTheme,
} from "@/lib/theme";

type Props = {
  map: JourneyMap;
};

export function ThemeMenu({ map }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);

  const onImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const parsed = parseThemeV1(json);
      if (!parsed.ok) {
        window.alert(parsed.error);
        return;
      }
      applyTheme(parsed.theme);
      saveStoredThemeJson(serializeTheme(parsed.theme));
      setOpen(false);
    } catch {
      window.alert("Invalid JSON file.");
    }
  }, []);

  const onReset = useCallback(() => {
    clearStoredTheme();
    clearAppliedTheme();
    applyTheme(DEFAULT_THEME_V1);
    setOpen(false);
  }, []);

  const onExportHandoff = useCallback(() => {
    const raw = loadStoredThemeJson();
    let theme = null;
    if (raw) {
      try {
        const p = parseThemeV1(JSON.parse(raw) as unknown);
        if (p.ok) theme = p.theme;
      } catch {
        /* ignore */
      }
    }
    const blob = new Blob([buildHandoffJson(map, theme)], {
      type: "application/json;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "journey-map-handoff.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setOpen(false);
  }, [map]);

  const onExportThemeOnly = useCallback(() => {
    const blob = new Blob([serializeTheme(DEFAULT_THEME_V1)], {
      type: "application/json;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "journey-map-theme-default.v1.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setOpen(false);
  }, []);

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportFile}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-ink-primary/[0.06] hover:bg-ink-primary/[0.10] text-ink-secondary hover:text-ink-primary transition-colors"
        title="Theme"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Palette className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-border-soft bg-surface py-1 shadow-panel text-left"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-[12px] text-ink-primary hover:bg-surface-hover flex items-center gap-2"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              Import theme…
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-[12px] text-ink-primary hover:bg-surface-hover flex items-center gap-2"
              onClick={onExportThemeOnly}
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              Download default theme
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-[12px] text-ink-primary hover:bg-surface-hover flex items-center gap-2"
              onClick={onExportHandoff}
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              Export handoff JSON
            </button>
            <div className="my-1 h-px bg-border-soft" />
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-[12px] text-rose-700 hover:bg-rose-50 flex items-center gap-2"
              onClick={onReset}
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              Reset theme
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
