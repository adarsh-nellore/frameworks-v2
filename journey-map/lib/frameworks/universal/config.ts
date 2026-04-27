import type { UniversalMap, ConnectorRouting } from "./types";

// ---------------------------------------------------------------------------
// FrameworkConfig — replaces per-framework types/schema/prompt files.
// All behaviour that varies between frameworks lives here.
// ---------------------------------------------------------------------------

/**
 * How the framework should visually render. Three-layer synthesis: the
 * structuringPrompt captures semantic meaning; this renderingPlan captures
 * visual intent; the populate step translates both into per-card meta.
 */
export type RenderingPlan = {
  /** Card visual treatment. "stacked" = flow vertically in cells (default).
   *  "horizontal-bar" = pills along a time axis (Gantt). "dot" = markers at
   *  (x,y) continuous positions (scatter). "mixed" = combinations. */
  cardOrientation: "stacked" | "horizontal-bar" | "dot" | "mixed";
  /** Continuity model. "cell-discrete" = one (col,row) per card. "axis-continuous"
   *  = one continuous axis (time), cards carry meta.x. "xy-continuous" = both
   *  axes continuous, cards carry meta.x AND meta.y. */
  spatialContinuity: "cell-discrete" | "axis-continuous" | "xy-continuous";
  /** Population density target for the populate step. */
  density: "sparse" | "moderate" | "dense";
  /** Plain-English visual brief. The populate step uses this as a top-priority
   *  directive when deciding how to set each card's meta.x / meta.y / meta.width. */
  summary: string;
};

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
    | { kind: "concentric" }
    | { kind: "coordinate-cross" };

  // ── Rendering plan (visual layer) ──────────────────────────────────────────
  /**
   * How the framework should visually render. Separate from structuringPrompt
   * (semantic layer). The renderer reads cardOrientation to switch between
   * stacked-cards, horizontal-bars (Gantt/roadmap), and dots (scatter/cartesian)
   * modes. The populate step reads `summary` as a top-priority visual directive.
   *
   * Well-known meta conventions it implies on Card.meta:
   *   cardOrientation: "horizontal-bar" → card.meta.x (px offset in col) +
   *     card.meta.width (px span). width === "0" renders as diamond (milestone).
   *   cardOrientation: "dot" → card.meta.x + card.meta.y (both absolute within
   *     the plot area, 0–1000 range).
   */
  renderingPlan?: RenderingPlan;

  // ── Vocabulary (used in prompts and UI labels) ──────────────────────────────
  colNoun: string;   // "Stage" | "Section" | "Competitor" | "Theme"
  rowNoun: string;   // "Lane" | "Criterion" | "Card Type"
  cardNoun: string;  // "Card" | "Item" | "Assessment"

  // ── Connectors (optional relationships between cards) ───────────────────────
  /**
   * Opt-in per framework. When enabled, the renderer shows 4 edge handles on
   * card hover and an SVG overlay draws arrows between connected cards. The
   * universal ops (addConnector, removeConnector, updateConnector) and AI tool
   * schema only expose connector affordances when this is set.
   */
  connectors?: {
    enabled: boolean;
    /** Allowed semantic kinds for connectors (e.g. "sequence", "handoff"). */
    allowedKinds?: string[];
    /** Default routing when a connector omits routing. Defaults to "orthogonal". */
    defaultRouting?: ConnectorRouting;
  };

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

  // ── Cell groups (clustered variant only) ────────────────────────────────
  /**
   * Named cell groupings for the clustered variant of the ShapeContract. Each
   * group labels a set of (colId, rowId) pairs and the renderer draws a
   * labeled rounded rectangle behind those cells (CellGroupChrome). This is
   * how mind maps, post-mortem canvases, strategy boards — everything we
   * used to call "freeform with regions" — present as a single grid with
   * visual grouping chrome instead of absolute-positioned cards.
   *
   * Server-stamped from the ShapeContract; the synth agent does not emit it.
   */
  cellGroups?: Array<{
    id: string;
    label: string;
    cells: Array<{ colId: string; rowId: string }>;
    chromeStyle?: "box" | "region" | "radial-petal" | "none";
  }>;
  /** Optional layout hint for group positioning ("3x2 grid", "radial", etc.). */
  cellGroupLayoutHint?: string;

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
