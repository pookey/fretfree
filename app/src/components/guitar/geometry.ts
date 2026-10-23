import { DOUBLE_INLAY_FRETS, INLAY_FRETS } from '../../theory';
import type { InlayShape, Point } from './types';

/**
 * The shared guitar frame (see `BodyShape` in `types.ts`), in millimetres.
 * One scale length and one neck for every body, so a body swap changes
 * only the body.
 */

/** Nut to saddles: 25.5 inches. */
export const SCALE = 648;
export const DEFAULT_FRETS = 22;
/** Where every neck enters its body: the 16th fret. */
export const NECK_JOINT_Y = fretY(16);

const NUT_WIDTH = 43;
const HEEL_WIDTH = 57;
/** Outer string to outer string, at the nut and at the saddles. */
const NUT_SPREAD = 35;
const BRIDGE_SPREAD = 52;

/** Distance from the nut to fret `n` (equal temperament). */
export function fretY(n: number): number {
  return SCALE * (1 - 2 ** (-n / 12));
}

/** Where the board ends: just past its last fret. */
export function boardEnd(frets: number): number {
  return fretY(frets) + 5;
}

/** Half the board's width at `y`: it widens linearly from nut to heel. */
export function boardHalfWidth(y: number): number {
  return (NUT_WIDTH + ((HEEL_WIDTH - NUT_WIDTH) * y) / boardEnd(DEFAULT_FRETS)) / 2;
}

/** The board as a closed path, from the nut to its end. */
export function boardPath(frets: number): string {
  const end = boardEnd(frets);
  const top = boardHalfWidth(0);
  const bottom = boardHalfWidth(end);
  return `M ${-top} 0 L ${top} 0 L ${bottom} ${end} L ${-bottom} ${end} Z`;
}

/** String 1 (high E) to 6 (low E), at `y`. The low E is on the left. */
export function stringX(string: number, y: number): number {
  const spread = NUT_SPREAD + ((BRIDGE_SPREAD - NUT_SPREAD) * y) / SCALE;
  return spread / 2 - ((string - 1) * spread) / 5;
}

/** Visual gauge, thicker towards the low E. */
export function stringWidth(string: number): number {
  return 0.55 + string * 0.17;
}

// ---- Headstock -------------------------------------------------------------

/**
 * An original three-a-side headstock: it flares from the nut into a
 * paddle whose top is cut on a slant, higher on the bass side, with soft
 * corners. It copies no maker's silhouette.
 */
export const HEADSTOCK_PATH = [
  'M -21.5 0',
  'C -23 -14 -38 -26 -43 -46',
  'C -45.5 -56 -46 -66 -46 -78',
  'L -46 -170',
  'C -46 -184 -38 -191 -26 -190',
  'L 34 -172',
  'C 43 -169 46 -164 46 -156',
  'L 46 -78',
  'C 46 -66 45.5 -56 43 -46',
  'C 38 -26 23 -14 21.5 0',
  'Z',
].join(' ');

/** Tuner post for each string, 1 to 6: three a side, the low E nearest the nut. */
export function tunerPost(string: number): Point {
  const bass = string >= 4;
  const rank = bass ? 6 - string : string - 1; // 0 nearest the nut
  return { x: bass ? -31 : 31, y: -62 - rank * 38 };
}

/** The tuner key outside the edge, beside its post. */
export function tunerKey(string: number): Point {
  const post = tunerPost(string);
  return { x: post.x < 0 ? -60 : 60, y: post.y };
}

// ---- Inlays ----------------------------------------------------------------

export interface InlayMark {
  fret: number;
  /** Closed paths for this fret's marks; two dots at the octave. */
  paths: readonly string[];
}

function circle(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

/**
 * The standard inlay positions on a board of `frets` frets, drawn as
 * `shape`. Only the shape changes, never the positions (design §3.8).
 */
export function inlayMarks(shape: InlayShape, frets: number): readonly InlayMark[] {
  return INLAY_FRETS.filter((f) => f <= frets).map((fret) => {
    const top = fretY(fret - 1);
    const bottom = fretY(fret);
    const cy = (top + bottom) / 2;
    const half = boardHalfWidth(cy);
    const span = bottom - top;
    if (shape === 'dots') {
      const r = Math.min(3.2, span * 0.18);
      const paths = DOUBLE_INLAY_FRETS.includes(fret)
        ? [circle(-half * 0.5, cy, r), circle(half * 0.5, cy, r)]
        : [circle(0, cy, r)];
      return { fret, paths };
    }
    const inset = span * 0.2;
    const y0 = top + inset;
    const y1 = bottom - inset;
    const w = half * 0.72;
    if (shape === 'blocks') {
      return { fret, paths: [`M ${-w} ${y0} L ${w} ${y0} L ${w} ${y1} L ${-w} ${y1} Z`] };
    }
    // Trapezoids: narrow towards the nut.
    const narrow = w * 0.62;
    return {
      fret,
      paths: [`M ${-narrow} ${y0} L ${narrow} ${y0} L ${w} ${y1} L ${-w} ${y1} Z`],
    };
  });
}
