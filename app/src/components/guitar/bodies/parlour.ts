import { soundholeDetails, type Soundhole } from '../acoustic';
import { SCALE, fretY } from '../geometry';
import { smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Parlour: a small, slim flat-top with a narrow upper bout; 12 frets clear
 * of the body, so the soundhole sits near the waist and the bridge low in
 * the lower bout. A round soundhole with a rosette, a pinned bridge, a
 * teardrop guard and no electronics. Only the type's name is used.
 *
 * Outline source: drawn from the dimension table below, not traced: key
 * points were placed on those widths and depths, the curve fitted through
 * them and resampled by curvature (outline method, `outline.ts`). The
 * headstock is our own.
 *
 * Dimensions, in inches (published: 18 long; upper bout 9.75, waist 8.25,
 * lower bout 13.5). Upper bout widest 3.9 below the top, waist 7.3, lower
 * bout 12.7. The body is drawn at 0.88 of that, 302 x 402 mm: close to the
 * steel-string bodies' scale, so it reads as the small one.
 * The points start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [0.0, 726.3],
  [-15.0, 725.9],
  [-30.9, 724.3],
  [-46.6, 721.4],
  [-62.1, 717.3],
  [-77.1, 711.9],
  [-91.6, 705.1],
  [-105.1, 696.5],
  [-117.3, 686.2],
  [-127.9, 674.2],
  [-136.4, 661.9],
  [-143.9, 647.7],
  [-148.7, 632.5],
  [-150.9, 616.7],
  [-149.7, 600.8],
  [-143.5, 586.1],
  [-135.1, 572.4],
  [-126.0, 559.3],
  [-116.7, 546.3],
  [-108.3, 533.9],
  [-100.2, 520.1],
  [-94.2, 505.3],
  [-92.1, 489.5],
  [-94.7, 473.7],
  [-99.6, 458.5],
  [-104.4, 443.2],
  [-107.7, 427.6],
  [-109.0, 411.7],
  [-108.0, 396.7],
  [-104.2, 381.2],
  [-97.5, 366.7],
  [-88.1, 353.8],
  [-76.3, 343.1],
  [-62.5, 335.0],
  [-47.5, 329.4],
  [-31.9, 326.0],
  [-16.0, 324.4],
  [-1.0, 324.0],
  [0.0, 324.0],
  [1.0, 324.0],
  [16.0, 324.4],
  [31.9, 326.0],
  [47.5, 329.4],
  [62.5, 335.0],
  [76.3, 343.1],
  [88.1, 353.8],
  [97.5, 366.7],
  [104.2, 381.2],
  [108.0, 396.7],
  [109.0, 411.7],
  [107.7, 427.6],
  [104.4, 443.2],
  [99.6, 458.5],
  [94.7, 473.7],
  [92.1, 489.5],
  [94.2, 505.3],
  [100.2, 520.1],
  [108.3, 533.9],
  [116.7, 546.3],
  [126.0, 559.3],
  [135.1, 572.4],
  [143.5, 586.1],
  [149.7, 600.8],
  [150.9, 616.7],
  [148.7, 632.5],
  [143.9, 647.7],
  [136.4, 661.9],
  [127.9, 674.2],
  [117.3, 686.2],
  [105.1, 696.5],
  [91.6, 705.1],
  [77.1, 711.9],
  [62.1, 717.3],
  [46.6, 721.4],
  [30.9, 724.3],
  [15.0, 725.9],
];

/** Ø 83 mm, its top edge just below the board's end (19 frets). */
const HOLE: Soundhole = { y: 480, r: 41.5, rosette: 6.5, gap: 2.5 };

const parlour: BodyShape = {
  name: 'Parlour',
  outline: smoothClosed(OUTLINE),
  // A small teardrop on the treble side: its point beside the board's end, its
  // inner edge following the rosette and its broad end below the soundhole.
  // Drawn round the soundhole, so it sits on the top: the convex hull of a
  // small round tip and a broad lobe, less the rosette, every corner eased
  // to a radius of at least 8 mm.
  pickguard: smoothClosed([
    [49.4, 415.8],
    [55.7, 418.6],
    [60.5, 423.6],
    [64.9, 428.9],
    [69.0, 434.6],
    [72.7, 440.4],
    [76.0, 446.5],
    [78.8, 452.9],
    [81.0, 459.5],
    [82.8, 466.2],
    [83.9, 473.0],
    [84.7, 479.9],
    [84.9, 486.9],
    [84.6, 493.8],
    [83.7, 500.7],
    [82.6, 507.6],
    [81.2, 514.4],
    [79.4, 521.1],
    [77.4, 527.7],
    [75.0, 534.2],
    [71.9, 540.5],
    [67.9, 546.1],
    [62.8, 550.8],
    [56.9, 554.5],
    [50.5, 557.0],
    [43.6, 558.3],
    [36.7, 558.1],
    [29.9, 556.6],
    [23.6, 553.8],
    [18.2, 549.5],
    [15.2, 543.4],
    [15.6, 536.5],
    [19.1, 530.6],
    [24.9, 526.8],
    [30.8, 523.1],
    [36.1, 518.7],
    [40.9, 513.7],
    [44.9, 508.0],
    [48.2, 501.9],
    [50.7, 495.4],
    [52.2, 488.7],
    [52.9, 481.8],
    [52.7, 474.8],
    [51.6, 468.0],
    [49.6, 461.3],
    [46.7, 455.0],
    [43.0, 449.1],
    [38.6, 443.8],
    [34.0, 438.6],
    [31.7, 432.1],
    [32.8, 425.3],
    [36.6, 419.6],
    [42.5, 416.1],
  ]),
  pickups: [],
  bridge: { type: 'acoustic', x: 0, y: SCALE },
  controls: { knobs: [] },
  // 12 frets clear of the body.
  neckJoint: { y: fretY(12) },
  frets: 19,
  neck: 'acoustic',
  binding: true,
  details: soundholeDetails(HOLE),
};

export default parlour;
