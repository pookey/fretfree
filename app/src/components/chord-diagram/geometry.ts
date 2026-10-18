import type { Handedness } from '../../engine/model';

/**
 * Pure layout maths for the chart-view <ChordDiagram> (design §8): strings run
 * top to bottom as columns, frets are rows, the nut is at the top. Units are
 * CSS px at the design width; the SVG scales to its container.
 */

export const STRING_GAP = 44;
export const FRET_GAP = 52;
export const PAD_X = 30;
/** Room above the neck for the open and muted markers. */
export const HEAD_H = 40;
/** Room left of the neck for the position label (e.g. "5fr"). */
export const GUTTER_W = 36;
export const FOOT_H = 30;
export const NUT_H = 7;
export const DOT_R = 16;

export interface ChartGeometry {
  width: number;
  height: number;
  neckLeft: number;
  neckRight: number;
  neckTop: number;
  neckBottom: number;
  /** x of a string's line. */
  stringX(string: number): number;
  /** y of the `i`-th fret wire from the top; 0 is the top edge (the nut's edge). */
  wireY(i: number): number;
  /** y of the centre of a fret's row, where its dot sits. */
  fretY(fret: number): number;
  /** y of the open and muted markers above the nut. */
  headY: number;
  /** y of the string names below the neck. */
  footY: number;
}

export function computeChartGeometry(opts: {
  stringCount: number;
  baseFret: number;
  rows: number;
  handedness: Handedness;
}): ChartGeometry {
  const { stringCount, baseFret, rows, handedness } = opts;
  const neckLeft = GUTTER_W + PAD_X;
  const neckRight = neckLeft + (stringCount - 1) * STRING_GAP;
  const width = neckRight + PAD_X + GUTTER_W;
  const neckTop = HEAD_H;
  const neckBottom = neckTop + rows * FRET_GAP;
  const height = neckBottom + FOOT_H;
  // Chart view, right-handed: the low string on the left, as if the guitar
  // stood upright facing you. Left-handed mirrors it.
  const fromLeft = (string: number) => (handedness === 'left' ? string - 1 : stringCount - string);
  return {
    width,
    height,
    neckLeft,
    neckRight,
    neckTop,
    neckBottom,
    stringX: (s) => neckLeft + fromLeft(s) * STRING_GAP,
    wireY: (i) => neckTop + i * FRET_GAP,
    fretY: (fret) => neckTop + (fret - baseFret + 0.5) * FRET_GAP,
    headY: neckTop - HEAD_H / 2,
    footY: neckBottom + FOOT_H / 2,
  };
}

/** An upward triangle around a dot centre (the 5th, as on the neck). */
export function trianglePoints(cx: number, cy: number, r: number = DOT_R): string {
  const k = r / 18;
  return `${cx},${cy - 22 * k} ${cx + 22 * k},${cy + 15 * k} ${cx - 22 * k},${cy + 15 * k}`;
}

/** A flat-sided hexagon around a dot centre (the 7th, as on the neck). */
export function hexagonPoints(cx: number, cy: number, r: number = DOT_R): string {
  const rr = r * 1.1;
  return [0, 60, 120, 180, 240, 300]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
    })
    .join(' ');
}
