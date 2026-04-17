"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/themes/prism.min.css";
import { Download, Palette, RotateCcw } from "lucide-react";
import type { BrandInput, DesignSystem, ThemeV1 } from "@/lib/theme";
import {
  applyDesignSystem,
  applyDesignTokenCssVars,
  applyTheme,
  clearAppliedTheme,
  clearStoredBrand,
  clearStoredTheme,
  DEFAULT_THEME_V1,
  deriveTheme,
  isDesignSystemShape,
  loadStoredBrand,
  loadStoredDesignSystemJson,
  loadStoredThemeJson,
  looksLikeCss,
  parseDesignSystem,
  parseTailwindCss,
  parseThemeImport,
  saveStoredBrand,
  saveStoredDesignSystemJson,
  saveStoredDesignTokenCssVarsJson,
  saveStoredThemeJson,
  serializeDesignSystem,
  serializeTheme,
} from "@/lib/theme";
import { hexToTriplet } from "@/lib/theme/color-math";
import { triggerDownload } from "@/lib/export";
import { ThemeUploadPanel } from "@/components/ThemeUploadPanel";
import { ThemePreviewCard } from "@/components/ThemePreviewCard";

// Apply helpers fan out over every visible board (data-map-page elements)
// and dispatch a change event so BoardFrame's hydrator picks up any that
// mount later. Keeps theming scoped to boards — never the app chrome.
function applyDesignSystemEverywhere(ds: DesignSystem): void {
  if (typeof document === "undefined") return;
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-map-page]"));
  if (roots.length === 0) {
    applyDesignSystem(ds);
  } else {
    for (const el of roots) applyDesignSystem(ds, el);
  }
  window.dispatchEvent(new CustomEvent("frameworks:theme-changed"));
}

function applyThemeEverywhere(theme: ThemeV1): void {
  if (typeof document === "undefined") return;
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-map-page]"));
  if (roots.length === 0) {
    applyTheme(theme);
  } else {
    for (const el of roots) applyTheme(theme, el);
  }
  window.dispatchEvent(new CustomEvent("frameworks:theme-changed"));
}

function applyDesignTokensEverywhere(flat: Record<string, string> | undefined): void {
  if (typeof document === "undefined") return;
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-map-page]"));
  if (roots.length === 0) {
    applyDesignTokenCssVars(flat);
  } else {
    for (const el of roots) applyDesignTokenCssVars(flat, el);
  }
  window.dispatchEvent(new CustomEvent("frameworks:theme-changed"));
}

function clearAppliedThemeEverywhere(): void {
  if (typeof document === "undefined") return;
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-map-page]"));
  if (roots.length === 0) {
    clearAppliedTheme();
  } else {
    for (const el of roots) clearAppliedTheme(el);
  }
  window.dispatchEvent(new CustomEvent("frameworks:theme-changed"));
}


type Stage = "brand" | "upload" | "advanced";

// Defaults for the brand pickers.
const DEFAULT_BRAND: BrandInput = {
  primary: "#3b5998",
  secondary: "#fafafa",
  accent: "#5b9bd5",
};

// Compose a flat DesignSystem from a derived ThemeV1 + the original brand.
// The primary hex becomes the single --accent; semantic tokens map 1:1.
function designSystemFromDerivedTheme(theme: ThemeV1, brand: BrandInput): DesignSystem {
  return {
    version: 1,
    accent: hexToTriplet(brand.primary),
    canvas: theme.semantic.canvas,
    surface: theme.semantic.surface,
    surfaceSubtle: theme.semantic.surfaceSubtle,
    surfaceHover: theme.semantic.surfaceHover,
    inkPrimary: theme.semantic.inkPrimary,
    inkSecondary: theme.semantic.inkSecondary,
    inkMuted: theme.semantic.inkMuted,
    borderSoft: theme.semantic.borderSoft,
    borderMedium: theme.semantic.borderMedium,
    ...(brand.sansFont ? { fontSans: brand.sansFont } : {}),
    ...(brand.monoFont ? { fontMono: brand.monoFont } : {}),
  };
}

// Example DesignSystem JSON shown in the paste editor by default.
const DS_EXAMPLE: DesignSystem = {
  version: 1,
  accent: "#4f46e5",
  canvas: "#fafafa",
  surface: "#ffffff",
  surfaceSubtle: "#f9f8f9",
  surfaceHover: "#f1f0f2",
  inkPrimary: "#282a2f",
  inkSecondary: "#3e424b",
  inkMuted: "#8c8b8c",
  borderSoft: "#e8e8ea",
  borderMedium: "#d4d4d6",
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "16px",
  fontSans: "Inter",
  fontMono: "JetBrains Mono",
};

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

function ColorInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <label className="relative shrink-0 cursor-pointer">
        <span
          className="block h-9 w-9 rounded-lg border border-border-medium shadow-sm"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </label>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-muted mb-0.5">
          {label}
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
          }}
          disabled={disabled}
          className="w-full rounded-md bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2 py-1 text-[12px] font-mono text-ink-primary outline-none transition-colors"
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("brand");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Brand color picker state.
  const [primary, setPrimary] = useState(DEFAULT_BRAND.primary);
  const [secondary, setSecondary] = useState(DEFAULT_BRAND.secondary);
  const [accent, setAccent] = useState(DEFAULT_BRAND.accent);
  const [sansFont, setSansFont] = useState("");
  const [monoFont, setMonoFont] = useState("");

  // Advanced paste-JSON state.
  const [draft, setDraft] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Live-derived theme (updates instantly as user changes pickers).
  const brand: BrandInput = useMemo(
    () => ({
      primary,
      secondary,
      accent,
      ...(sansFont ? { sansFont } : {}),
      ...(monoFont ? { monoFont } : {}),
    }),
    [primary, secondary, accent, sansFont, monoFont]
  );
  const derivedTheme = useMemo(() => deriveTheme(brand), [brand]);

  // Reset state when dialog opens — but hydrate the Brand pickers from the
  // last applied brand (if any) so reopening shows the colors the user
  // actually chose, not DEFAULT_BRAND.
  useEffect(() => {
    if (!open) return;
    setStage("brand");
    setUploadBusy(false);
    setUploadError(null);
    const storedBrand = loadStoredBrand();
    const source = storedBrand ?? DEFAULT_BRAND;
    setPrimary(source.primary);
    setSecondary(source.secondary);
    setAccent(source.accent);
    setSansFont(source.sansFont ?? "");
    setMonoFont(source.monoFont ?? "");
    // Prefer a stored DesignSystem (new preferred shape); fall back to the
    // legacy theme.v1 blob; fall back to the DS example so new users see the
    // recommended shape immediately.
    const storedDs = loadStoredDesignSystemJson();
    if (storedDs) {
      setDraft(storedDs);
    } else {
      const legacy = loadStoredThemeJson();
      setDraft(legacy ?? JSON.stringify(DS_EXAMPLE, null, 2));
    }
    setPasteError(null);
  }, [open]);

  // Apply the derived brand theme + write the flat DesignSystem so the new
  // path takes precedence on next reload and the --accent token is set.
  // Also persists the raw hex inputs so reopening the dialog shows the user
  // the actual colors they picked (not DEFAULT_BRAND).
  const onApplyBrand = useCallback(() => {
    const ds = designSystemFromDerivedTheme(derivedTheme, brand);
    applyThemeEverywhere(derivedTheme);
    applyDesignSystemEverywhere(ds);
    applyDesignTokensEverywhere(undefined);
    saveStoredThemeJson(serializeTheme(derivedTheme));
    saveStoredDesignSystemJson(serializeDesignSystem(ds));
    saveStoredDesignTokenCssVarsJson(null);
    saveStoredBrand(brand);
    setOpen(false);
  }, [derivedTheme, brand]);

  // Upload → AI extracts brand → populate pickers.
  const onNormalized = useCallback(
    (theme: ThemeV1, notes: string, brandResult?: BrandInput) => {
      if (brandResult) {
        setPrimary(brandResult.primary);
        setSecondary(brandResult.secondary);
        setAccent(brandResult.accent);
        if (brandResult.sansFont) setSansFont(brandResult.sansFont);
        if (brandResult.monoFont) setMonoFont(brandResult.monoFont);
      }
      setStage("brand"); // Switch to Brand tab so user sees populated pickers + preview
    },
    []
  );

  // Paste CSS or JSON → apply.
  //   1. If the draft looks like CSS (starts with :root, @import, etc.) → parseTailwindCss
  //   2. Flat DesignSystem JSON → parseDesignSystem
  //   3. Legacy theme.v1 / design-token bundle → parseThemeImport
  const onApplyPaste = useCallback(() => {
    setPasteError(null);

    // ── CSS path (Tailwind v4 / shadcn :root blocks) ──
    if (looksLikeCss(draft)) {
      const parsed = parseTailwindCss(draft);
      if (!parsed.ok) {
        setPasteError(parsed.error);
        return;
      }
      applyDesignSystemEverywhere(parsed.ds);
      applyDesignTokensEverywhere(undefined);
      saveStoredDesignSystemJson(serializeDesignSystem(parsed.ds));
      saveStoredThemeJson("");
      saveStoredDesignTokenCssVarsJson(null);
      setOpen(false);
      return;
    }

    // ── JSON path ──
    let json: unknown;
    try {
      json = JSON.parse(draft) as unknown;
    } catch {
      setPasteError("Invalid input — paste a CSS :root block or a JSON theme object.");
      return;
    }
    if (isDesignSystemShape(json)) {
      const parsed = parseDesignSystem(json);
      if (!parsed.ok) {
        setPasteError(parsed.error);
        return;
      }
      applyDesignSystemEverywhere(parsed.ds);
      applyDesignTokensEverywhere(undefined);
      saveStoredDesignSystemJson(serializeDesignSystem(parsed.ds));
      saveStoredThemeJson("");
      saveStoredDesignTokenCssVarsJson(null);
      setOpen(false);
      return;
    }
    const parsed = parseThemeImport(json);
    if (!parsed.ok) {
      setPasteError(parsed.error);
      return;
    }
    applyThemeEverywhere(parsed.theme);
    applyDesignTokensEverywhere(parsed.designTokenCssVars);
    saveStoredThemeJson(serializeTheme(parsed.theme));
    saveStoredDesignSystemJson(null);
    saveStoredDesignTokenCssVarsJson(
      parsed.designTokenCssVars ? JSON.stringify(parsed.designTokenCssVars) : null
    );
    setOpen(false);
  }, [draft]);

  const onReset = useCallback(() => {
    clearStoredTheme();
    saveStoredDesignSystemJson(null);
    clearStoredBrand();
    clearAppliedThemeEverywhere();
    setOpen(false);
  }, []);

  const onExportThemeOnly = useCallback(() => {
    triggerDownload(
      new Blob([serializeTheme(DEFAULT_THEME_V1)], {
        type: "application/json;charset=utf-8",
      }),
      "journey-map-theme-default.v1.json"
    );
    setOpen(false);
  }, []);

  const busy = uploadBusy;

  return (
    <div className="relative shrink-0">
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
            {/* Header */}
            <div className="shrink-0 border-b border-border-soft px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-muted">
                  Branding
                </p>
                <p className="text-[13px] font-medium text-ink-primary">
                  {stage === "brand"
                    ? "Brand colors & fonts"
                    : stage === "upload"
                      ? "Upload design system"
                      : "Paste CSS or theme JSON"}
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

            {/* Tab strip */}
            <div className="flex items-center px-4 pt-2.5 pb-0 gap-1">
              {(
                [
                  ["brand", "Brand"],
                  ["upload", "Upload"],
                  ["advanced", "CSS / JSON"],
                ] as [Stage, string][]
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  disabled={busy}
                  onClick={() => setStage(tab)}
                  className={[
                    "px-2.5 py-1 rounded-md transition-colors",
                    "text-[10px] font-mono uppercase tracking-[0.18em]",
                    stage === tab
                      ? "text-ink-primary bg-ink-primary/[0.07]"
                      : "text-ink-muted hover:text-ink-secondary",
                    busy ? "opacity-50 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
              {/* BRAND tab */}
              {stage === "brand" && (
                <div className="px-4 py-3 flex flex-col gap-4">
                  {/* Color pickers */}
                  <div className="grid grid-cols-3 gap-3">
                    <ColorInput label="Primary" value={primary} onChange={setPrimary} />
                    <ColorInput label="Secondary" value={secondary} onChange={setSecondary} />
                    <ColorInput label="Accent" value={accent} onChange={setAccent} />
                  </div>

                  {/* Font inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-muted mb-1">
                        Sans font
                      </div>
                      <input
                        type="text"
                        value={sansFont}
                        onChange={(e) => setSansFont(e.target.value)}
                        placeholder="e.g. DM Sans"
                        className="w-full rounded-md bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2 py-1.5 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-muted mb-1">
                        Mono font
                      </div>
                      <input
                        type="text"
                        value={monoFont}
                        onChange={(e) => setMonoFont(e.target.value)}
                        placeholder="e.g. JetBrains Mono"
                        className="w-full rounded-md bg-white/60 border border-border-soft hover:border-border-medium focus:border-ink-primary focus:bg-white px-2 py-1.5 text-[12px] text-ink-primary placeholder:text-ink-muted outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Live preview */}
                  <ThemePreviewCard
                    theme={derivedTheme}
                    notes=""
                    onApply={onApplyBrand}
                    onCancel={() => setOpen(false)}
                  />
                </div>
              )}

              {/* UPLOAD tab */}
              {stage === "upload" && (
                <div className="px-4 py-3">
                  <p className="text-[11px] text-ink-muted leading-snug mb-3">
                    Drop a design system file — AI extracts 3 brand colors + fonts, then populates the Brand tab.
                  </p>
                  <ThemeUploadPanel
                    onNormalized={onNormalized}
                    onError={setUploadError}
                    busy={uploadBusy}
                    onBusyChange={setUploadBusy}
                  />
                  {uploadError && (
                    <p className="mt-2 text-[12px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                      {uploadError}
                    </p>
                  )}
                </div>
              )}

              {/* ADVANCED (paste JSON) tab */}
              {stage === "advanced" && (
                <div className="px-4 py-3 flex flex-col gap-3">
                  <p className="text-[11px] text-ink-muted leading-snug">
                    Paste a <span className="font-mono">Tailwind CSS / shadcn</span> <code className="font-mono text-[10px] bg-surface-subtle px-1 py-0.5 rounded">:root &#123; &#125;</code> block, or a flat <span className="font-mono">DesignSystem</span> / <span className="font-mono">theme.v1</span> JSON. Parsed locally — no AI.
                  </p>
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
                      style={{ fontFamily: "var(--jm-font-mono, var(--font-mono)), ui-monospace, monospace" }}
                    />
                  </div>
                  {pasteError && (
                    <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                      {pasteError}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onApplyPaste}
                      className="px-3 py-1.5 rounded-lg bg-ink-primary text-white text-[12px] font-medium hover:opacity-90"
                    >
                      Apply theme
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDraft(serializeTheme(DEFAULT_THEME_V1)); setPasteError(null); }}
                      className="px-3 py-1.5 rounded-lg border border-border-soft text-[12px] text-ink-secondary hover:bg-surface-hover"
                    >
                      Load default
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom actions */}
              <div className="px-4 pb-3 pt-1">
                <div className="h-px bg-border-soft mb-3" />
                <div className="flex flex-wrap gap-2 text-[12px]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onExportThemeOnly}
                    className="inline-flex items-center gap-1.5 text-ink-secondary hover:text-ink-primary disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Download default theme
                  </button>
                  <span className="text-ink-muted/50">&middot;</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onReset}
                    className="inline-flex items-center gap-1.5 text-rose-700 hover:text-rose-900 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset theme
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
