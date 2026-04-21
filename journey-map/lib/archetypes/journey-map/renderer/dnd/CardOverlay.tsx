"use client";

type Props = {
  text: string;
  num: number;
  groupCount: number; // 1 = single card, >1 = multi-card drag (shows "+N")
};

/**
 * Drag preview: compact card centered in the slot dnd-kit reserves (matches the
 * real cell’s viewport rect). We keep **two** direct children on the root so
 * @dnd-kit/core’s getMeasurableNode() measures this wrapper, not only the small
 * inner card — otherwise collision detection uses a tiny rect and drops feel wrong.
 */
export function CardOverlay({ text, num, groupCount }: Props) {
  return (
    <div className="relative h-full w-full pointer-events-none">
      <div aria-hidden className="absolute inset-0" />
      <div className="relative z-10 flex h-full w-full items-start justify-center px-1 pt-1">
        <div className="relative w-full max-w-[220px] shrink-0">
          {groupCount > 1 && (
            <div className="absolute inset-0 -translate-x-1 translate-y-1 rounded-xl border border-slate-300 bg-white shadow-[0_8px_20px_-6px_rgba(15,23,42,0.18)]" />
          )}
          <div
            className="relative min-h-[72px] rounded-xl border border-slate-400 bg-white p-2.5 shadow-[0_18px_40px_-12px_rgba(15,23,42,0.5)]"
            style={{ rotate: "-2deg" }}
          >
            <span
              className={[
                "font-mono text-[10px] leading-[1.35] tracking-tight break-words pr-6",
                text ? "text-slate-700" : "text-slate-300",
              ].join(" ")}
            >
              {text || "[text]"}
            </span>
            <span className="absolute top-2 right-2 font-mono text-[9px] tabular-nums text-slate-300">
              {num.toString().padStart(2, "0")}
            </span>
            {groupCount > 1 && (
              <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-slate-900 text-white font-mono text-[9px] shadow-[0_4px_8px_-2px_rgba(15,23,42,0.4)]">
                +{groupCount - 1}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
