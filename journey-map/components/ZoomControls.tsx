"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { MAX_SCALE, MIN_SCALE, STEP, useZoom } from "@/lib/zoom-context";

type Props = {
  onFit?: () => void;
};

export function ZoomControls({ onFit }: Props) {
  const { scale, zoomBy, reset } = useZoom();
  const pct = Math.round(scale * 100);

  return (
    <div
      data-floating
      className="fixed top-4 right-5 z-50 glass rounded-full px-1.5 py-1 flex items-center gap-0.5 shadow-card"
    >
      <IconBtn
        label="Zoom out"
        disabled={scale <= MIN_SCALE + 0.001}
        onClick={() => zoomBy(1 / STEP)}
      >
        <Minus className="h-3.5 w-3.5" />
      </IconBtn>
      <button
        type="button"
        onClick={reset}
        className="px-2.5 min-w-[3.5rem] text-center font-mono text-[11px] tabular-nums text-ink-secondary hover:text-ink-primary"
        title="Reset to 100%"
      >
        {pct}%
      </button>
      <IconBtn
        label="Zoom in"
        disabled={scale >= MAX_SCALE - 0.001}
        onClick={() => zoomBy(STEP)}
      >
        <Plus className="h-3.5 w-3.5" />
      </IconBtn>
      <div className="w-px h-4 bg-border-soft mx-0.5" />
      <IconBtn label="Fit to screen" onClick={onFit}>
        <Maximize2 className="h-3 w-3" />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-7 w-7 inline-flex items-center justify-center rounded-full",
        "text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/[0.06]",
        "transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-secondary",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
