import { soundholeDetails, type Soundhole } from '../acoustic';
import { SCALE, fretY } from '../geometry';
import { smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Classical (nylon string): round, gentle shoulders, a soft waist and a
 * round lower bout; 12 frets clear of the body. A round soundhole with a
 * wide mosaic rosette, a tie-block bridge, no pickguard and no
 * electronics. The neck is the wide, flat classical neck, with nylon
 * trebles, and the headstock is our own slotted design.
 *
 * Outline source: drawn from the dimension table below, not traced: key
 * points were placed on those widths and depths, the curve fitted through
 * them and resampled by curvature (outline method, `outline.ts`). The
 * headstock is our own.
 *
 * Dimensions, in inches (published, Torres pattern: 19.1 long; upper bout
 * 11, waist 9.4, lower bout 14.4). Upper bout widest 4.3 below the top,
 * waist 7.8, lower bout 13.5. The body is drawn at 0.90 of that, 329 x
 * 437 mm, so it fits the shared frame below a 12th-fret joint.
 * The points start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [0.0, 760.6],
  [-15.0, 760.2],
  [-30.9, 758.7],
  [-46.7, 756.1],
  [-62.2, 752.3],
  [-77.5, 747.3],
  [-92.3, 741.3],
  [-106.5, 734.0],
  [-119.8, 725.0],
  [-131.8, 714.5],
  [-142.4, 702.6],
  [-151.2, 689.2],
  [-157.8, 674.7],
  [-161.9, 659.2],
  [-164.1, 643.4],
  [-164.5, 627.4],
  [-161.2, 611.8],
  [-155.2, 596.9],
  [-148.2, 582.5],
  [-139.6, 569.1],
  [-130.5, 555.9],
  [-121.6, 542.6],
  [-113.9, 528.6],
  [-108.6, 513.5],
  [-107.5, 499.6],
  [-111.0, 486.1],
  [-116.9, 471.2],
  [-121.5, 455.9],
  [-124.7, 440.2],
  [-125.7, 425.2],
  [-124.8, 409.3],
  [-121.8, 393.6],
  [-116.6, 378.5],
  [-108.4, 364.7],
  [-97.9, 352.8],
  [-85.2, 343.0],
  [-71.0, 335.6],
  [-56.0, 330.1],
  [-40.4, 326.7],
  [-24.5, 324.9],
  [-8.5, 324.1],
  [0.0, 324.1],
  [8.5, 324.1],
  [24.5, 324.9],
  [40.4, 326.7],
  [56.0, 330.1],
  [71.0, 335.6],
  [85.2, 343.0],
  [97.9, 352.8],
  [108.4, 364.7],
  [116.6, 378.5],
  [121.8, 393.6],
  [124.8, 409.3],
  [125.7, 425.2],
  [124.7, 440.2],
  [121.5, 455.9],
  [116.9, 471.2],
  [111.0, 486.1],
  [107.5, 499.6],
  [108.6, 513.5],
  [113.9, 528.6],
  [121.6, 542.6],
  [130.5, 555.9],
  [139.6, 569.1],
  [148.2, 582.5],
  [155.2, 596.9],
  [161.2, 611.8],
  [164.5, 627.4],
  [164.1, 643.4],
  [161.9, 659.2],
  [157.8, 674.7],
  [151.2, 689.2],
  [142.4, 702.6],
  [131.8, 714.5],
  [119.8, 725.0],
  [106.5, 734.0],
  [92.3, 741.3],
  [77.5, 747.3],
  [62.2, 752.3],
  [46.7, 756.1],
  [30.9, 758.7],
  [15.0, 760.2],
];

/** Ø 77 mm, its top edge just below the board's end (19 frets). */
const HOLE: Soundhole = { y: 477, r: 38.5, rosette: 12, gap: 2.5 };

const classical: BodyShape = {
  name: 'Classical',
  outline: smoothClosed(OUTLINE),
  pickups: [],
  bridge: { type: 'tie-block', x: 0, y: SCALE },
  controls: { knobs: [] },
  // 12 frets clear of the body.
  neckJoint: { y: fretY(12) },
  frets: 19,
  neck: 'classical',
  headstock: 'slotted',
  binding: true,
  details: soundholeDetails(HOLE),
};

export default classical;
