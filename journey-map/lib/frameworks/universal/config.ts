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
   * - "grid"     = sparse 2D grid (journey map): row labels left, col headers top
   * - "kanban"   = vertical card stacks per col (JTBD, affinity): no left label column
   * - "matrix"   = dense fixed NxM grid (2x2, competitive map): both axes labelled
   * - "freeform" = Miro-style canvas: cards positioned by (x, y) on the board.
   *                Position is stored in card.meta.x / card.meta.y as stringified
   *                pixel coordinates. cols/rows still exist (used for grouping
   *                cards into semantic clusters + tool ops), but are rendered as
   *                soft labels, not grid lines. Freeform also supports "shape
   *                cards" — cards with meta.shapeKind that render as geometric
   *                outlines (diamond, rectangle, circle) behind content cards.
   *                Double Diamond and similar spatial frameworks compose from
   *                shape cards + content cards on a freeform board.
   */
  layout: "grid" | "kanban" | "matrix" | "freeform";

  // ── Optional decorative chrome ──────────────────────────────────────────────
  /**
   * Visual chrome rendered behind/above the tabular column layout. Purely
   * decorative — it signals the framework's identity (Double Diamond, Venn,
   * Kano curve, etc.) without changing how cards are organized. Cards stay
   * in their semantic cols × rows. Chrome scales with the table's geometry
   * so any number of columns / cards works.
   */
  chrome?:
    | { kind: "double-diamond"; leftLabel?: string; rightLabel?: string }
    | { kind: "venn"; circles?: string[] }
    | { kind: "kano-curve" }
    | { kind: "funnel" }
    | { kind: "concentric" };

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
