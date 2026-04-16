"use client";

import type { ReactNode } from "react";
import { kindTheme } from "@/lib/row-kind-theme";

type Props = {
  /** Drives the optional left-accent stripe color (kind name from row-kind-theme). */
  kind?: string;
  /** When true, gives the container a subtle ink-primary tinted accent (e.g. competitive map subject). */
  emphasized?: boolean;
  children: ReactNode;
};

/**
 * Kanban / matrix column wrapper. Gives every column the same structural
 * weight as a journey-map row track: subtle bg tint, soft ring, padding,
 * optional kind-accent stripe.
 *
 * Without this, columns float as bare flex items and the layout reads as a
 * spreadsheet. With it, kanban + matrix feel like proper "boards".
 */
export function SectionContainer({ kind, emphasized = false, children }: Props) {
  const theme = kind ? kindTheme(kind) : null;

  return (
    <div
      className={[
        "relative flex flex-col gap-3 rounded-2xl p-3 ring-1 transition-colors",
        emphasized
          ? "bg-ink-primary/[0.04] ring-ink-primary/15"
          : "bg-ink-primary/[0.02] ring-border-soft/60",
      ].join(" ")}
    >
      {/* Subtle left-accent stripe in the section's kind color (skipped for neutral) */}
      {theme && kind !== "neutral" && kind !== "ungrouped" ? (
        <span
          aria-hidden
          className={[
            "absolute left-0 top-2 bottom-2 w-[3px] rounded-full",
            theme.accentBorder,
            "border-l-[3px]",
          ].join(" ")}
        />
      ) : null}
      {children}
    </div>
  );
}
