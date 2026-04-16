import type { UniversalMap } from "./types";

// ---------------------------------------------------------------------------
// FrameworkConfig — replaces per-framework types/schema/prompt files.
// All behaviour that varies between frameworks lives here.
// ---------------------------------------------------------------------------

export type CardMetaField = {
  key: string;
  label: string;
  type: "select";
  options: string[];
  /** If true, the field can be set to null (removed) */
  nullable?: boolean;
};

export type HeroMetaField = {
  key: string;
  label: string;
  placeholder: string;
};

export type FrameworkConfig = {
  id: string;
  label: string;

  // ── Layout ─────────────────────────────────────────────────────────────────
  /**
   * How the grid renders:
   * - "grid"   = sparse 2D grid (journey map): row labels left, col headers top
   * - "kanban" = vertical card stacks per col (JTBD, affinity): no left label column
   * - "matrix" = dense fixed NxM grid (2x2, competitive map): both axes labelled
   */
  layout: "grid" | "kanban" | "matrix";

  // ── Vocabulary (used in prompts and UI labels) ──────────────────────────────
  colNoun: string;   // "Stage" | "Section" | "Competitor" | "Theme"
  rowNoun: string;   // "Lane" | "Criterion" | "Card Type"
  cardNoun: string;  // "Card" | "Item" | "Assessment"

  // ── Structure constraints ───────────────────────────────────────────────────
  /** If true, addCol/removeCol ops are forbidden (e.g. 2x2 fixed quadrants) */
  fixedCols?: boolean;
  /** If true, addRow/removeRow ops are forbidden (e.g. affinity card types) */
  fixedRows?: boolean;

  // ── Card metadata fields ────────────────────────────────────────────────────
  /** Optional card-level meta fields rendered as chips/dropdowns on each card */
  cardMetaFields?: CardMetaField[];

  // ── Top-level meta fields (rendered as hero banner above the grid) ──────────
  heroMetaFields?: HeroMetaField[];

  // ── Seed ───────────────────────────────────────────────────────────────────
  seed: UniversalMap;

  // ── AI integration ─────────────────────────────────────────────────────────
  /**
   * Framework-specific structuring prompt appended after the universal system prompt.
   * Explains what cols/rows mean in THIS framework. Short — no document reading logic.
   */
  structuringPrompt: string;

  /** Example instructions shown as copilot suggestion pills */
  exampleInstructions: string[];

  /**
   * Placeholder copy for the chat textarea. Lets the copilot reflect the
   * framework it's currently editing (e.g. "Refine the jobs canvas…")
   * instead of a generic "Reshape the map…".
   */
  chatPlaceholder?: string;

  /**
   * Optional one-liner shown next to the framework chip in the chat surface.
   * Reinforces what the agent is going to operate on.
   */
  chatSubtitle?: string;
};
