import type { Handedness } from '../../engine/model';
import { DOUBLE_INLAY_FRETS, INLAY_FRETS, type FretRange } from '../../theory';

/**
 * Pure layout maths for the <Fretboard> SVG. Units are CSS px at the design
 * width; the SVG scales to its container. Fret widths shrink gently up the
 * neck ("real-ish" proportions) without letting late frets get too narrow.
 */

export const BASE_FRET_W = 72;
export const OPEN_W = 52;
export const STRING_GAP = 56;
export const PAD_X = 12;
export const PAD_TOP = 28;
export const PAD_BOTTOM = 34;
export const NUT_W = 6;

export function fretWidth(fret: number): number {
  return BASE_FRET_W * (0.55 + 0.45 * Math.pow(2, -fret / 12));
}

export interface Cell {
  fret: number;
  x: number;
  w: number;
  /** Centre of the cell, where markers sit. */
  cx: number;
}

export interface NeckGeometry {
  width: number;
  height: number;
  cells: Cell[];
  /** x of each fret wire (or the nut) at the high end of a cell. */
  wires: { fret: number; x: number; nut: boolean }[];
  stringY(string: number): number;
  cell(fret: number): Cell | undefined;
  inlays: { fret: number; cx: number; double: boolean }[];
  neckTop: number;
  neckBottom: number;
}

export function computeGeometry(opts: {
  fretRange: FretRange;
  stringCount: number;
  handedness: Handedness;
}): NeckGeometry {
  const { fretRange, stringCount, handedness } = opts;
  const raw: { fret: number; x: number; w: number }[] = [];
  let x = PAD_X;
  for (let fret = fretRange.from; fret <= fretRange.to; fret++) {
    const w = fret === 0 ? OPEN_W : fretWidth(fret);
    raw.push({ fret, x, w });
    x += w;
    if (fret === 0) x += NUT_W;
  }
  const width = x + PAD_X;
  const mirror = (px: number, w = 0) => (handedness === 'left' ? width - px - w : px);
  const cells: Cell[] = raw.map((c) => {
    const mx = mirror(c.x, c.w);
    return { fret: c.fret, x: mx, w: c.w, cx: mx + c.w / 2 };
  });
  const wires = raw.map((c) => {
    const edge = c.x + c.w + (c.fret === 0 ? NUT_W / 2 : 0);
    return { fret: c.fret, x: mirror(edge), nut: c.fret === 0 };
  });
  const neckTop = PAD_TOP;
  const neckBottom = PAD_TOP + (stringCount - 1) * STRING_GAP + STRING_GAP;
  const height = neckBottom + PAD_BOTTOM;
  // Player view: string 1 (high) at the top, the low string at the bottom.
  const stringY = (string: number) => neckTop + STRING_GAP / 2 + (string - 1) * STRING_GAP;
  const byFret = new Map(cells.map((c) => [c.fret, c]));
  const inlays = cells
    .filter((c) => INLAY_FRETS.includes(c.fret))
    .map((c) => ({ fret: c.fret, cx: c.cx, double: DOUBLE_INLAY_FRETS.includes(c.fret) }));
  return {
    width,
    height,
    cells,
    wires,
    stringY,
    cell: (f) => byFret.get(f),
    inlays,
    neckTop,
    neckBottom,
  };
}

export const MIN_HIT = 44;

/** The smallest render scale that keeps every hit cell ≥ 44pt in both directions. */
export function minScale(g: Pick<NeckGeometry, 'cells'>): number {
  const narrowest = Math.min(...g.cells.map((c) => c.w));
  return Math.max(MIN_HIT / narrowest, MIN_HIT / STRING_GAP);
}
