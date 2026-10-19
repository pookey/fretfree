import type { Handedness } from '../../engine/model';
import type { CagedShapeName, FretRange } from '../../theory';

/**
 * Pure layout for the session's CAGED chain mini-map (design §7 session
 * context panel): the five shapes of a chord as bands over a small whole neck,
 * so the shape just built is placed among its neighbours. Units are SVG px at
 * the panel's width (`--context-w`, 20rem less padding); the SVG scales.
 */

/** Width of one fret cell; fret 0 (open strings) gets a cell left of the nut. */
export const MAP_CELL = 18;
/** Gap between strings. */
export const MAP_STRING_GAP = 7;
/** Height of one row of shape bands. Neighbours share edge frets, so bands use two rows. */
export const MAP_BAND_H = 13;
export const MAP_PAD = 4;

export interface MapBand {
  shape: CagedShapeName;
  /** Left edge and width, mirrored for left-handed players. */
  x: number;
  width: number;
  /** 0 or 1: alternate rows, so overlapping neighbours stay apart. */
  row: number;
  y: number;
  current: boolean;
}

export interface MapLayout {
  width: number;
  height: number;
  /** Top and bottom of the strings. */
  neckTop: number;
  neckBottom: number;
  /** The nut's x, or null when the range starts above fret 0. */
  nutX: number | null;
  /** x of each fret wire, low frets first. */
  wires: number[];
  /** Centre x of a fret's cell. */
  fretX(fret: number): number;
  /** y of a string: string 1 (high) at the top, as on the neck. */
  stringY(string: number): number;
  bands: MapBand[];
}

export function cagedMapLayout(opts: {
  range: FretRange;
  /** The chain's shapes, lowest on the neck first. */
  spans: readonly { shape: CagedShapeName; span: FretRange }[];
  current: CagedShapeName;
  strings: number;
  handedness: Handedness;
}): MapLayout {
  const { range, spans, current, strings, handedness } = opts;
  const cells = range.to - range.from + 1;
  const width = cells * MAP_CELL;
  const neckTop = MAP_PAD + 2 * MAP_BAND_H + MAP_PAD;
  const neckBottom = neckTop + (strings - 1) * MAP_STRING_GAP;
  const height = neckBottom + MAP_PAD;
  const mirror = (x: number, w = 0) => (handedness === 'left' ? width - x - w : x);
  const left = (fret: number) => (fret - range.from) * MAP_CELL;
  const fretX = (fret: number) => mirror(left(fret) + MAP_CELL / 2);
  // A wire sits at the high edge of each fretted cell; fret 0's edge is the nut.
  const wires: number[] = [];
  for (let f = Math.max(range.from, 1); f <= range.to; f++) wires.push(mirror(left(f + 1)));
  const nutX = range.from === 0 ? mirror(left(1)) : null;
  const bands = spans.map(({ shape, span }, i): MapBand => {
    const w = (span.to - span.from + 1) * MAP_CELL;
    const row = i % 2;
    return {
      shape,
      x: mirror(left(span.from), w),
      width: w,
      row,
      y: MAP_PAD + row * MAP_BAND_H,
      current: shape === current,
    };
  });
  return {
    width,
    height,
    neckTop,
    neckBottom,
    nutX,
    wires,
    fretX,
    stringY: (s) => neckTop + (s - 1) * MAP_STRING_GAP,
    bands,
  };
}

/** "frets 3–5", "fret 0". */
export function fretsText(span: FretRange): string {
  return span.from === span.to ? `fret ${span.from}` : `frets ${span.from}–${span.to}`;
}
