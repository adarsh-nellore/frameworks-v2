import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
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
