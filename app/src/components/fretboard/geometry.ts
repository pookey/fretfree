import type { Handedness } from '../../engine/model';
import { DOUBLE_INLAY_FRETS, INLAY_FRETS, type FretRange } from '../../theory';
import type { MarkerStyle } from './Fretboard';

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
/**
 * The string names' own column, beyond the open-string column at the nut end
 * (M1-49), so an open-string marker never covers a name. It replaces PAD_X at
 * that end whenever the window includes the nut, at every guide level, so the
 * neck doesn't shift as guides fade.
 */
export const NAME_W = 32;
/** String names: font size and the wood halo's stroke (Fretboard.module.css). */
export const NAME_FONT = 15;
export const NAME_HALO = 4;

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
  /** The string names' column (`NAME_W`), when the window includes the nut. */
  names?: { x: number; w: number; cx: number };
}

export function computeGeometry(opts: {
  fretRange: FretRange;
  stringCount: number;
  handedness: Handedness;
  /** Leave room for string names at the nut (default true; the heatmap labels its own). */
  nameGutter?: boolean;
}): NeckGeometry {
  const { fretRange, stringCount, handedness, nameGutter = true } = opts;
  const withNames = nameGutter && fretRange.from === 0;
  const raw: { fret: number; x: number; w: number }[] = [];
  let x = withNames ? NAME_W : PAD_X;
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
    names: withNames ? { x: mirror(0, NAME_W), w: NAME_W, cx: mirror(NAME_W / 2) } : undefined,
  };
}

export const MIN_HIT = 44;

/** The smallest render scale that keeps every hit cell ≥ 44pt in both directions. */
export function minScale(g: Pick<NeckGeometry, 'cells'>): number {
  const narrowest = Math.min(...g.cells.map((c) => c.w));
  return Math.max(MIN_HIT / narrowest, MIN_HIT / STRING_GAP);
}

/** An axis-aligned box in neck units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Marker outlines, drawn by <Fretboard>: shape and colour together tell markers apart. */
export type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon';

/** Each marker style's shape: a root is a square, a wrong answer a diamond, a 5th a triangle. */
export const MARKER_SHAPE: Readonly<Record<MarkerStyle, MarkerShape>> = {
  target: 'circle',
  root: 'square',
  tone: 'circle',
  correct: 'circle',
  wrong: 'diamond',
  ghost: 'circle',
  third: 'circle',
  fifth: 'triangle',
  seventh: 'hexagon',
};

export const MARKER = {
  circleR: 18,
  squareHalf: 17,
  /** Half the side of the square that turns 45° into the diamond. */
  diamondHalf: 16,
  /** The triangle's apex above, base below and half-width from the centre. */
  triangle: { up: 24, down: 17, half: 26 },
  hexagonR: 20,
  /** A worked example's ring: a copy of the shape stroked this wide (Fretboard.module.css). */
  ringStroke: 13,
  /** The widest stroke any shape draws on its own edge. */
  edgeStroke: 5,
} as const;

/** How far a shape reaches left, right, up and down from its centre, before strokes. */
function reach(shape: MarkerShape): { x: number; up: number; down: number } {
  switch (shape) {
    case 'circle':
      return { x: MARKER.circleR, up: MARKER.circleR, down: MARKER.circleR };
    case 'square':
      return { x: MARKER.squareHalf, up: MARKER.squareHalf, down: MARKER.squareHalf };
    case 'diamond': {
      const d = MARKER.diamondHalf * Math.SQRT2;
      return { x: d, up: d, down: d };
    }
    case 'triangle':
      return { x: MARKER.triangle.half, up: MARKER.triangle.up, down: MARKER.triangle.down };
    case 'hexagon':
      return { x: MARKER.hexagonR, up: MARKER.hexagonR, down: MARKER.hexagonR };
  }
}

/** The box a marker paints at rest, with its stroke and a worked example's ring. */
export function markerBox(shape: MarkerShape, cx: number, cy: number, emphasis = false): Box {
  const r = reach(shape);
  const stroke = (emphasis ? MARKER.ringStroke : MARKER.edgeStroke) / 2;
  return {
    x: cx - r.x - stroke,
    y: cy - r.up - stroke,
    w: 2 * (r.x + stroke),
    h: r.up + r.down + 2 * stroke,
  };
}

/**
 * A generous box for a string name's glyphs and halo: bold capitals are at
 * most about 0.8em wide, an accidental less, and the text is centred on the
 * string.
 */
export function stringNameBox(g: NeckGeometry, string: number, text: string): Box | undefined {
  if (!g.names) return undefined;
  const em = [...text].reduce((sum, ch) => sum + (/[A-G]/.test(ch) ? 0.8 : 0.6), 0);
  const w = em * NAME_FONT + NAME_HALO;
  const h = NAME_FONT + NAME_HALO;
  return { x: g.names.cx - w / 2, y: g.stringY(string) - h / 2, w, h };
}
