"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/themes/prism.min.css";
import { Download, Loader2, Palette, RotateCcw, Upload } from "lucide-react";
import type { JourneyMap } from "@/lib/frameworks/journey-map/types";
import type { ThemeV1 } from "@/lib/theme";
import {
  applyDesignTokenCssVars,
  applyTheme,
  buildHandoffJson,
  clearAppliedTheme,
  clearStoredTheme,
  DEFAULT_THEME_V1,
  loadStoredThemeJson,
  parseThemeImport,
  type ParseResult,
  saveStoredDesignTokenCssVarsJson,
  saveStoredThemeJson,
  serializeTheme,
} from "@/lib/theme";

type Props = {
  map: JourneyMap;
};

type OkParse = Extract<ParseResult, { ok: true }>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\u00a0/g, " ");
}

function highlightJson(code: string): string {
  if (!code.trim()) return "";
  try {
    return Prism.highlight(code, Prism.languages.json, "json");
  } catch {
    return escapeHtml(code);
  }
}

function applyParsedTheme(parsed: OkParse): void {
  applyTheme(parsed.theme);
  applyDesignTokenCssVars(parsed.designTokenCssVars);
  saveStoredThemeJson(serializeTheme(parsed.theme));
  saveStoredDesignTokenCssVarsJson(
    parsed.designTokenCssVars ? JSON.stringify(parsed.designTokenCssVars) : null
  );
}

async function normalizeThemeWithAi(rawText: string): Promise<OkParse> {
  const res = await fetch("/api/theme-normalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawText }),
  });
  const data = (await res.json()) as { error?: string; theme?: ThemeV1 };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  if (!data.theme) {
    throw new Error("Response missing theme");
  }
  return { ok: true, theme: data.theme };
}

export function ThemeMenu({ map }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raw = loadStoredThemeJson();
    setDraft(raw ?? serializeTheme(DEFAULT_THEME_V1));
    setPasteError(null);
    setAiBusy(false);
  }, [open]);

  const onImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPasteError(null);
    try {
      const text = await file.text();
      let parsed: ParseResult;
      try {
        parsed = parseThemeImport(JSON.parse(text) as unknown);
      } catch {
        window.alert("Invalid JSON file.");
        return;
      }
      if (!parsed.ok) {
        setAiBusy(true);
        try {
          const ok = await normalizeThemeWithAi(text);
          applyParsedTheme(ok);
          setDraft(serializeTheme(ok.theme));
          setOpen(false);
        } catch (err) {
          window.alert(
            `${parsed.error}\n\nAI conversion failed: ${err instanceof Error ? err.message : String(err)}`
          );
        } finally {
          setAiBusy(false);
        }
        return;
      }
      applyParsedTheme(parsed);
      setDraft(serializeTheme(parsed.theme));
      setOpen(false);
    } catch {
      window.alert("Could not read file.");
    }
  }, []);

  const onApplyPaste = useCallback(async () => {
    setPasteError(null);
    try {
      const json = JSON.parse(draft) as unknown;
      let parsed = parseThemeImport(json);
      if (!parsed.ok) {
        const parseErr = parsed.error;
        setAiBusy(true);
        try {
          const ok = await normalizeThemeWithAi(draft);
          parsed = ok;
        } catch (err) {
          setPasteError(
            `${parseErr} — AI conversion failed: ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        } finally {
          setAiBusy(false);
        }
      }
      applyParsedTheme(parsed);
      setDraft(serializeTheme(parsed.theme));
      setOpen(false);
    } catch {
      setPasteError("Invalid JSON syntax.");
    }
  }, [draft]);

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
        const p = parseThemeImport(JSON.parse(raw) as unknown);
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
            aria-label="Close theme panel"
            className="fixed inset-0 z-[45] cursor-default bg-ink-primary/[0.12]"
            onClick={() => setOpen(false)}
          />
          <div
            className={[
              "fixed left-1/2 top-14 z-[60] w-[min(36rem,calc(100vw-1.5rem))] max-h-[min(85vh,calc(100vh-4rem))]",
              "-translate-x-1/2 rounded-2xl border border-border-soft bg-surface shadow-panel",
              "flex flex-col overflow-hidden text-left",
            ].join(" ")}
            role="dialog"
            aria-label="Theme"
          >
            <div className="shrink-0 border-b border-border-soft px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-muted">
                  Design tokens
                </p>
                <p className="text-[13px] font-medium text-ink-primary">
                  Paste or import theme JSON
                </p>
                <p className="text-[11px] text-ink-muted mt-0.5 max-w-[22rem] leading-snug">
                  Accepts journey-map <span className="font-mono">theme.v1</span> (RGB triplets) or grouped{" "}
                  <span className="font-mono">tokens</span>. If the shape does not match, we call the API to
                  convert it (needs <span className="font-mono">ANTHROPIC_API_KEY</span>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] text-ink-muted hover:text-ink-primary px-2 py-1 rounded-md hover:bg-surface-hover"
              >
                Close
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-3 overflow-y-auto">
              <div className="rounded-xl border border-border-soft max-h-[min(42vh,26rem)] min-h-[220px] overflow-y-auto overflow-x-auto bg-[rgb(var(--surface-subtle)/1)] overscroll-contain [scrollbar-gutter:stable]">
                <Editor
                  value={draft}
                  onValueChange={setDraft}
                  highlight={highlightJson}
                  padding={12}
                  tabSize={2}
                  insertSpaces
                  className="font-mono text-[12px] leading-relaxed min-h-[220px] text-ink-primary"
                  textareaClassName="outline-none bg-transparent min-h-[220px]"
                  style={{
                    fontFamily:
                      "var(--jm-font-mono, var(--font-mono)), ui-monospace, monospace",
                  }}
                />
              </div>
              {pasteError ? (
                <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  {pasteError}
                </p>
              ) : null}
              {aiBusy ? (
                <p className="text-[12px] text-ink-secondary flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Converting with AI…
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onApplyPaste()}
                  disabled={aiBusy}
                  className="px-3 py-1.5 rounded-lg bg-ink-primary text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Apply theme
                </button>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => {
                    setDraft(serializeTheme(DEFAULT_THEME_V1));
                    setPasteError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border-soft text-[12px] text-ink-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  Load default template
                </button>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => inputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-border-soft text-[12px] text-ink-secondary hover:bg-surface-hover inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import file…
                </button>
              </div>

              <div className="h-px bg-border-soft" />

              <div className="flex flex-wrap gap-2 text-[12px]">
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={onExportThemeOnly}
                  className="inline-flex items-center gap-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download default JSON
                </button>
                <span className="text-ink-muted/50">·</span>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={onExportHandoff}
                  className="inline-flex items-center gap-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export handoff
                </button>
                <span className="text-ink-muted/50">·</span>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={onReset}
                  className="inline-flex items-center gap-1.5 text-rose-700 hover:text-rose-900 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset theme
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
