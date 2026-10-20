import { BOTTOM, TOP_LINE, type StaffPosition } from './position';

/**
 * Pure layout maths for <Staff>, in VexFlow's units (design px at scale 1,
 * 10 between staff lines). The vertical layout is exact: it fixes where
 * VexFlow draws the stave, so the hit bands and highlights line up before
 * VexFlow has even loaded. The width here is an estimate for the placeholder;
 * the engraving reports the width it really needs.
 */

/** VexFlow's distance between staff lines. */
export const SPACE = 10;
/** One staff position: a line to the next space. */
export const STEP = SPACE / 2;
export const TAB_SPACE = 13;
export const TAB_LINES = 6;
export const PAD_X = 8;
export const PAD_Y = 4;
/** Clear space between the staff's lowest reach and the tab's top line. */
export const TAB_GAP = 14;
/** Room the clef, key and time signatures and the note area need, roughly. */
export const CLEF_W = 38;
export const KEY_ACC_W = 10;
export const TIME_W = 26;
/** An empty bar's answer column, where marks and the tap ghost sit. */
export const ANSWER_W = 48;
export const END_PAD = 12;

/**
 * Render scales. Reading: lines 12.5–26pt apart, larger than print, for a
 * guitar on the knee and the iPad on a stand. Interactive (hit-testing on): lines at
 * least 44pt apart, so each line or space band is 22pt and a line with its
 * space above is a 44pt target. A press shows a ghost note that follows the
 * finger, so the learner sees and corrects the position before letting go.
 */
export const READING_SCALE = { min: 1.25, max: 2.6 } as const;
export const MIN_LINE_GAP_PT = 44;
export const INTERACTIVE_SCALE = { min: MIN_LINE_GAP_PT / SPACE, max: 5.5 } as const;

/** Stems reach 3.5 spaces from the notehead (7 positions). */
const STEM = 7;
/** VexFlow stems notes below the middle line up. */
const MIDDLE_LINE = 4;
/** How far the treble 8vb clef reaches above the top line and below the bottom line. */
const CLEF_ABOVE = 4;
const CLEF_BELOW = 6;

export type PositionRange = readonly [low: StaffPosition, high: StaffPosition];

export interface StaffLayoutInput {
  /** The positions of every notehead, in note order (a chord gives several). */
  notePositions: readonly (readonly StaffPosition[])[];
  /** Positions that must stay on screen (marks, the hit range). */
  extraPositions?: readonly StaffPosition[];
  /** The tappable positions; defaults to the staff plus one step beyond the notes. */
  range?: PositionRange;
  keyAccidentals?: number;
  timeSignature?: boolean;
  tab?: boolean;
}

export interface StaffGeometry {
  width: number;
  height: number;
  range: PositionRange;
  /** y of the top and bottom staff lines. */
  topLineY: number;
  bottomLineY: number;
  /** The y VexFlow's `Stave` takes (four spaces above the top line). */
  staveY: number;
  positionY(position: StaffPosition): number;
  /** The position nearest a y, clamped to the range. */
  positionAt(y: number): StaffPosition;
  /** The tab's top line and VexFlow `TabStave` y, when there is tab. */
  tabTopLineY?: number;
  tabStaveY?: number;
  /** The x of the answer column, used when there are no notes yet. */
  answerX: number;
}

/** The default tap range: the staff and its outer spaces, plus a step beyond any note. */
export function defaultRange(positions: readonly StaffPosition[]): PositionRange {
  return [
    Math.min(BOTTOM - 1, ...positions.map((p) => p - 1)),
    Math.max(TOP_LINE + 1, ...positions.map((p) => p + 1)),
  ];
}

export function computeStaffGeometry(input: StaffLayoutInput): StaffGeometry {
  const heads = input.notePositions.flat();
  const range = input.range ?? defaultRange([...heads, ...(input.extraPositions ?? [])]);
  const extra = input.extraPositions ?? [];

  // How far up and down the engraving reaches, in positions.
  const reachUp = input.notePositions.map((ps) =>
    ps.length === 0 ? 0 : Math.max(...ps) + (avg(ps) < MIDDLE_LINE ? STEM : 1),
  );
  const reachDown = input.notePositions.map((ps) =>
    ps.length === 0 ? 0 : Math.min(...ps) - (avg(ps) >= MIDDLE_LINE ? STEM : 1),
  );
  const top = Math.max(range[1], TOP_LINE + CLEF_ABOVE, ...reachUp, ...extra) + 1;
  const bottom = Math.min(range[0], BOTTOM - CLEF_BELOW, ...reachDown, ...extra) - 1;

  const topLineY = PAD_Y + (top - TOP_LINE) * STEP;
  const positionY = (p: StaffPosition) => topLineY + (TOP_LINE - p) * STEP;
  const staffBottom = positionY(bottom);

  const tabTopLineY = input.tab ? staffBottom + TAB_GAP : undefined;
  const height =
    tabTopLineY === undefined
      ? staffBottom + PAD_Y
      : tabTopLineY + (TAB_LINES - 1) * TAB_SPACE + TAB_SPACE + PAD_Y;

  const modifiers =
    CLEF_W + (input.keyAccidentals ?? 0) * KEY_ACC_W + (input.timeSignature ? TIME_W : 0);
  const notesW = input.notePositions.length === 0 ? ANSWER_W : input.notePositions.length * 34;
  const width = PAD_X * 2 + modifiers + notesW + END_PAD;

  return {
    width,
    height,
    range,
    topLineY,
    bottomLineY: positionY(BOTTOM),
    staveY: topLineY - 4 * SPACE,
    positionY,
    positionAt: (y) =>
      Math.min(range[1], Math.max(range[0], TOP_LINE - Math.round((y - topLineY) / STEP))),
    tabTopLineY,
    tabStaveY: tabTopLineY === undefined ? undefined : tabTopLineY - 4 * TAB_SPACE,
    answerX: PAD_X + modifiers + ANSWER_W / 2,
  };
}

function avg(ps: readonly number[]): number {
  return ps.reduce((a, b) => a + b, 0) / ps.length;
}

/** The scale bounds for a staff: interactive staves keep 44pt between lines. */
export function scaleFor(interactive: boolean): { min: number; max: number } {
  return interactive ? INTERACTIVE_SCALE : READING_SCALE;
}
