import type { Config } from "tailwindcss";

// Lane CSS classes are built dynamically via template interpolation in
// lib/row-kind-theme.ts — Tailwind's JIT scanner can't resolve ${kind},
// so we must safelist them explicitly.
const LANE_KINDS = [
  // Journey-map originals
  "actions", "touchpoints", "thoughts", "emotions", "pain_points",
  "opportunities", "metrics", "stakeholders", "systems", "channels",
  "decisions", "artifacts", "neutral",
  // JTBD section kinds
  "functional_jobs", "emotional_jobs", "social_jobs",
  "desired_outcomes", "current_solutions",
  "context_triggers", "hiring_criteria", "firing_criteria",
  // Affinity card-type kinds + theme/ungrouped
  "observation", "quote", "insight", "need", "theme", "ungrouped",
  // Competitive map roles
  "subject", "competitor", "criterion",
  // 2x2 matrix quadrant accents
  "quadrant_high", "quadrant_low",
];
const laneSafelist: string[] = [];
for (const kind of LANE_KINDS) {
  laneSafelist.push(
    `bg-[rgb(var(--lane-${kind}-tint)/1)]`,
    `bg-[rgb(var(--lane-${kind}-chip-bg)/1)]`,
    `bg-[rgb(var(--lane-${kind}-highlight-bg)/0.8)]`,
    `text-[rgb(var(--lane-${kind}-accent)/1)]`,
    `text-[rgb(var(--lane-${kind}-chip-text)/1)]`,
    `text-[rgb(var(--lane-${kind}-highlight-text)/1)]`,
    `border-[rgb(var(--lane-${kind}-border)/1)]`,
  );
}

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  safelist: laneSafelist,
  theme: {
    extend: {
      fontFamily: {
        // Theme overrides use --jm-font-* so we never clobber next/font's --font-sans / --font-mono on <html>.
        sans: [
          "var(--jm-font-sans, var(--font-sans))",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--jm-font-mono, var(--font-mono))",
          "ui-monospace",
          "monospace",
        ],
      },
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-subtle": "rgb(var(--surface-subtle) / <alpha-value>)",
        "surface-hover": "rgb(var(--surface-hover) / <alpha-value>)",
        "ink-primary": "rgb(var(--ink-primary) / <alpha-value>)",
        "ink-secondary": "rgb(var(--ink-secondary) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        "border-soft": "rgb(var(--border-soft) / <alpha-value>)",
        "border-medium": "rgb(var(--border-medium) / <alpha-value>)",
        // Single brand accent — used for selection rings, primary buttons,
        // focus, and the optional card accent stripe.
        accent: "rgb(var(--accent) / <alpha-value>)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
    },
  },
  plugins: [],
} satisfies Config;
