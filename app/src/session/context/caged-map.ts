import type { Handedness } from '../../engine/model';
import type { CagedContent, ChainLink } from '../../screens/explore/views/caged';
import {
  cagedShape,
  shapeSpan,
  triadCore,
  type CagedShapeName,
  type FretRange,
} from '../../theory';

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
export const MAP_BAND_H = 16;
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

/**
 * The chain with the current shape moved to the octave the learner met it in.
 * `cagedContent` places each shape once, lowest on the neck, but a drill may
 * place it 12 frets up (D9's E shape of E at frets 12–14). `rootFret` is the
 * fret of the shape's root on its root string, as on the neck; in another
 * tuning it may sit a fret or two off the standard-tuning chain, so the
 * nearest octave is taken. The chain stays sorted lowest first.
 */
export function placeCurrent(
  content: CagedContent,
  current: CagedShapeName,
  rootFret: number | undefined,
): CagedContent {
  const link = content.chain.find((l) => l.shape.shape === current);
  if (!link || rootFret === undefined) return content;
  const octaves = Math.round((rootFret - link.shape.rootFret) / 12);
  if (octaves === 0) return content;
  const shape = cagedShape(current, link.shape.root, {
    quality: link.shape.quality,
    minFret: link.span.from + 12 * octaves,
  });
  const moved: ChainLink = { shape, core: triadCore(shape), span: shapeSpan(shape) };
  const chain = content.chain
    .map((l) => (l === link ? moved : l))
    .sort((a, b) => a.span.from - b.span.from);
  return { ...content, chain };
}
