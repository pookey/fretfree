/**
 * Pure layout maths for the <TabStaff> SVG. Units are CSS px at the design
 * size; the SVG scales between `minScale` (keeps each line's tap band ≥ 44pt)
 * and `MAX_SCALE`. Tab reads the same for either hand, so nothing mirrors.
 */

export const LINE_GAP = 48;
export const COL_W = 56;
/** The gutter at the left that holds the string names. */
export const NAME_W = 48;
export const PAD_X = 12;
export const PAD_TOP = 8;
/** Room under the bottom line for the cursor caret. */
export const PAD_BOTTOM = 22;
export const MIN_HIT = 44;
export const MAX_SCALE = 1.25;

export interface TabGeometry {
  width: number;
  height: number;
  columns: number;
  /** x of the opening and closing bar lines. */
  staffLeft: number;
  staffRight: number;
  /** x of the string names' centre. */
  nameX: number;
  lineY(string: number): number;
  /** Centre x of a note column (0-based). */
  columnX(column: number): number;
  /** Top and bottom of the lines' tap bands. */
  top: number;
  bottom: number;
}

export function computeTabGeometry(opts: { lineCount: number; columns: number }): TabGeometry {
  const columns = Math.max(1, opts.columns);
  const staffLeft = PAD_X + NAME_W;
  const staffRight = staffLeft + columns * COL_W;
  const top = PAD_TOP;
  const bottom = top + opts.lineCount * LINE_GAP;
  return {
    width: staffRight + PAD_X,
    height: bottom + PAD_BOTTOM,
    columns,
    staffLeft,
    staffRight,
    nameX: PAD_X + NAME_W / 2,
    // String 1 (high E) is the top line.
    lineY: (string) => top + LINE_GAP / 2 + (string - 1) * LINE_GAP,
    columnX: (column) => staffLeft + (column + 0.5) * COL_W,
    top,
    bottom,
  };
}

/** The smallest render scale that keeps each line's tap band ≥ 44pt tall. */
export function minScale(): number {
  return MIN_HIT / LINE_GAP;
}

/**
 * The column each note sits in. Notes fill one column each; when the staff
 * has more columns than notes (`minColumns`), the notes sit in the middle.
 */
export function noteColumns(
  noteCount: number,
  minColumns = 0,
): { columns: number; offset: number } {
  const columns = Math.max(1, noteCount, minColumns);
  return { columns, offset: Math.floor((columns - noteCount) / 2) };
}
