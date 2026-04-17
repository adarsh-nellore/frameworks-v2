// Layout tokens — single source of truth for grid/matrix/kanban sizing.
// Every layout imports from here so proportions stay consistent across
// frameworks (journey-map grid, 2×2 matrix, competitive map, kanban).
//
// When tuning spacing, edit here — not in individual layout files.

/** Horizontal gap between columns and the row-label rail. */
export const GUTTER = 16;

/** Width of the row-label rail (shared across grid + matrix). */
export const LABEL_W = 180;

/** Fixed card width in sparse grid layouts (journey-map). */
export const CARD_W = 280;

/** Column width in kanban layouts (JTBD, affinity). */
export const KANBAN_COL_W = 296;

/** Minimum width of each matrix cell (2×2, competitive map). */
export const MATRIX_CELL_MIN_W = 264;

/** Minimum row height in sparse grid layouts. */
export const ROW_MIN_H = 196;

/** Minimum row height in matrix layouts — larger so quadrants feel substantial. */
export const MATRIX_ROW_MIN_H = 200;

/** Width of the rotated Y-axis label band on the left of a matrix. */
export const Y_AXIS_BAND_W = 28;

/**
 * Pixel offset at which the first matrix column begins, measured from the
 * matrix body's left edge. Used to align the X-axis band label with the
 * cells beneath it.
 */
export const MATRIX_CONTENT_LEFT_OFFSET = Y_AXIS_BAND_W + LABEL_W + GUTTER;
