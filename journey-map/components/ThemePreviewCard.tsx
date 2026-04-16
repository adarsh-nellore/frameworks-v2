"use client";

import type { ThemeV1 } from "@/lib/theme/types";

type Props = {
  theme: ThemeV1;
  notes: string;
  onApply: () => void;
  onCancel: () => void;
};

function rgb(triplet: string): string {
  return `rgb(${triplet.replace(/ /g, ", ")})`;
}

const eyebrow =
  "font-mono text-[9px] tracking-[0.22em] uppercase text-ink-muted";

export function ThemePreviewCard({ theme, notes, onApply, onCancel }: Props) {
  const { semantic, lanes, fonts } = theme;

  const surfaceSwatches: { key: keyof typeof semantic; label: string }[] = [
    { key: "canvas", label: "canvas" },
    { key: "surface", label: "surface" },
    { key: "surfaceSubtle", label: "surfaceSubtle" },
    { key: "surfaceHover", label: "surfaceHover" },
  ];

  const inkSamples: { key: keyof typeof semantic; label: string }[] = [
    { key: "inkPrimary", label: "inkPrimary" },
    { key: "inkSecondary", label: "inkSecondary" },
    { key: "inkMuted", label: "inkMuted" },
  ];

  const borderSamples: { key: keyof typeof semantic; label: string }[] = [
    { key: "borderSoft", label: "borderSoft" },
    { key: "borderMedium", label: "borderMedium" },
  ];

  const laneEntries = Object.entries(lanes);

  return (
    <div
      className="overflow-y-auto"
      style={{ maxHeight: "min(60vh, 520px)" }}
    >
      <div className="flex flex-col gap-4 p-4 pb-0">
        {/* ── 1. Header ────────────────────────────────────── */}
        <div>
          <p className={eyebrow}>Preview</p>
          <p className="text-[12px] text-ink-secondary mt-1 leading-snug">
            {notes}
          </p>
        </div>

        {/* ── 2. Surfaces ──────────────────────────────────── */}
        <div>
          <p className={eyebrow}>Surfaces</p>
          <div className="flex gap-3 mt-2">
            {surfaceSwatches.map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1">
                <div
                  className="rounded-lg"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: rgb(semantic[key]),
                    border: `1px solid ${rgb(semantic.borderSoft)}`,
                  }}
                />
                <span className="text-[10px] text-ink-muted">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3. Ink & Borders ─────────────────────────────── */}
        <div>
          <p className={eyebrow}>Ink &amp; borders</p>

          <div className="flex gap-3 mt-2">
            {inkSamples.map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1">
                <div
                  className="rounded-lg flex items-center justify-center"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: rgb(semantic.surface),
                    border: `1px solid ${rgb(semantic.borderSoft)}`,
                  }}
                >
                  <span
                    className="text-[16px] font-semibold select-none"
                    style={{ color: rgb(semantic[key]) }}
                  >
                    Aa
                  </span>
                </div>
                <span className="text-[10px] text-ink-muted">{label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 mt-3">
            {borderSamples.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <div
                  style={{
                    height: 1,
                    flex: 1,
                    backgroundColor: rgb(semantic[key]),
                  }}
                />
                <span className="text-[10px] text-ink-muted shrink-0">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. Lanes ─────────────────────────────────────── */}
        <div>
          <p className={eyebrow}>Lanes</p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {laneEntries.map(([name, lane]) => (
              <div
                key={name}
                className="rounded-lg p-2 flex flex-col gap-1.5"
                style={{
                  backgroundColor: rgb(lane.tint),
                  borderLeft: `3px solid ${rgb(lane.accent)}`,
                }}
              >
                <span
                  className="rounded text-[9px] font-mono uppercase px-1.5 py-0.5 self-start"
                  style={{
                    backgroundColor: rgb(lane.chipBg),
                    color: rgb(lane.chipText),
                  }}
                >
                  {name}
                </span>
                <span
                  className="rounded px-1 text-[10px] self-start"
                  style={{
                    backgroundColor: rgb(lane.highlightBg),
                    color: rgb(lane.highlightText),
                  }}
                >
                  highlight
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 5. Fonts ─────────────────────────────────────── */}
        {fonts && (fonts.sansGoogle || fonts.monoGoogle) ? (
          <div>
            <p className={eyebrow}>Fonts</p>
            <div className="flex flex-col gap-2 mt-2">
              {fonts.sansGoogle ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-ink-muted">
                    {fonts.sansGoogle}
                  </span>
                  <span
                    className="text-[13px] text-ink-primary"
                    style={{
                      fontFamily: `"${fonts.sansGoogle}", ${fonts.sansStack || "sans-serif"}`,
                    }}
                  >
                    The quick brown fox
                  </span>
                </div>
              ) : null}
              {fonts.monoGoogle ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-ink-muted">
                    {fonts.monoGoogle}
                  </span>
                  <span
                    className="text-[13px] text-ink-primary"
                    style={{
                      fontFamily: `"${fonts.monoGoogle}", ${fonts.monoStack || "monospace"}`,
                    }}
                  >
                    {"0123 {}"}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 6. Action buttons (sticky) ───────────────────── */}
      <div className="sticky bottom-0 bg-surface p-4 pt-3 border-t border-border-soft mt-4">
        <button
          type="button"
          onClick={onApply}
          className="bg-ink-primary text-white rounded-xl h-9 text-[13px] font-medium w-full"
        >
          Apply theme
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-border-soft rounded-xl h-9 text-[13px] text-ink-secondary hover:bg-surface-hover w-full mt-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
