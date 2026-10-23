import { soundholeDetails, type Soundhole } from '../acoustic';
import { SCALE, fretY } from '../geometry';
import { smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Concert (OM): an orchestra-model flat-top. Rounder, sloping shoulders
 * than a dreadnought, a clear waist and a lower bout of 15 in; 14 frets
 * clear of the body. A round soundhole with a rosette, a pinned bridge, a
 * teardrop guard and no electronics. Only the type's name is used.
 *
 * Outline source: drawn from the dimension table below, not traced: key
 * points were placed on those widths and depths, the curve fitted through
 * them and resampled by curvature (outline method, `outline.ts`). The
 * headstock is our own.
 *
 * Dimensions, in inches (published: 19.375 long; upper bout 11.25, waist
 * 9.5, lower bout 15). Upper bout widest 3.9 below the top, waist 7.9,
 * lower bout 13.5. The body is drawn at 0.86 of that, as the dreadnought
 * is, 328 x 423 mm.
 * The points start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [0.0, 782.6],
  [-15.0, 782.1],
  [-30.9, 780.4],
  [-46.7, 777.7],
  [-62.1, 773.5],
  [-77.2, 768.3],
  [-91.8, 761.8],
  [-105.6, 753.6],
  [-118.5, 744.2],
  [-130.7, 733.8],
  [-141.6, 722.0],
  [-150.7, 708.9],
  [-157.7, 694.6],
  [-162.1, 679.2],
  [-163.8, 663.3],
  [-162.3, 647.4],
  [-157.0, 633.4],
  [-149.4, 619.4],
  [-141.2, 605.6],
  [-131.9, 592.6],
  [-122.5, 579.7],
  [-113.4, 566.5],
  [-106.2, 552.2],
  [-103.7, 536.5],
  [-106.2, 520.7],
  [-110.7, 505.4],
  [-116.1, 490.3],
  [-120.2, 474.9],
  [-122.6, 459.1],
  [-122.8, 443.1],
  [-120.4, 427.3],
  [-115.7, 412.0],
  [-108.7, 398.7],
  [-98.3, 386.6],
  [-85.6, 376.9],
  [-71.3, 369.8],
  [-56.1, 364.8],
  [-40.4, 361.7],
  [-24.5, 360.0],
  [-8.5, 359.4],
  [0.0, 359.4],
  [8.5, 359.4],
  [24.5, 360.0],
  [40.4, 361.7],
  [56.1, 364.8],
  [71.3, 369.8],
  [85.6, 376.9],
  [98.3, 386.6],
  [108.7, 398.7],
  [115.7, 412.0],
  [120.4, 427.3],
  [122.8, 443.1],
  [122.6, 459.1],
  [120.2, 474.9],
  [116.1, 490.3],
  [110.7, 505.4],
  [106.2, 520.7],
  [103.7, 536.5],
  [106.2, 552.2],
  [113.4, 566.5],
  [122.5, 579.7],
  [131.9, 592.6],
  [141.2, 605.6],
  [149.4, 619.4],
  [157.0, 633.4],
  [162.3, 647.4],
  [163.8, 663.3],
  [162.1, 679.2],
  [157.7, 694.6],
  [150.7, 708.9],
  [141.6, 722.0],
  [130.7, 733.8],
  [118.5, 744.2],
  [105.6, 753.6],
  [91.8, 761.8],
  [77.2, 768.3],
  [62.1, 773.5],
  [46.7, 777.7],
  [30.9, 780.4],
  [15.0, 782.1],
];

/** Ø 84 mm, its top edge just below the board's end (20 frets). */
const HOLE: Soundhole = { y: 493, r: 42, rosette: 7, gap: 3 };

const concert: BodyShape = {
  name: 'Concert (OM)',
  outline: smoothClosed(OUTLINE),
  // A teardrop on the treble side: its point beside the board's end, its inner
  // edge following the rosette and its broad end below the soundhole.
  // Drawn round the soundhole, so it sits on the top: the convex hull of a
  // small round tip and a broad lobe, less the rosette, every corner eased
  // to a radius of at least 8 mm.
  pickguard: smoothClosed([
    [47.9, 425.0],
    [54.4, 427.3],
    [59.4, 432.1],
    [63.8, 437.5],
    [68.1, 442.9],
    [72.2, 448.6],
    [76.0, 454.4],
    [79.5, 460.4],
    [82.7, 466.5],
    [85.4, 473.0],
    [87.8, 479.5],
    [89.6, 486.2],
    [91.0, 493.0],
    [91.9, 499.9],
    [92.2, 506.8],
    [92.1, 513.8],
    [91.5, 520.7],
    [90.5, 527.6],
    [89.1, 534.4],
    [87.5, 541.2],
    [85.3, 547.8],
    [82.5, 554.1],
    [78.7, 559.9],
    [74.0, 565.0],
    [68.5, 569.2],
    [62.4, 572.6],
    [55.8, 574.7],
    [48.9, 575.9],
    [42.0, 575.8],
    [35.1, 574.7],
    [28.6, 572.4],
    [22.5, 569.1],
    [17.2, 564.6],
    [14.2, 558.4],
    [14.6, 551.5],
    [18.2, 545.7],
    [24.0, 541.9],
    [30.1, 538.4],
    [35.6, 534.2],
    [40.6, 529.3],
    [44.9, 523.9],
    [48.5, 518.0],
    [51.2, 511.6],
    [53.2, 504.9],
    [54.2, 498.0],
    [54.4, 491.1],
    [53.7, 484.2],
    [52.2, 477.4],
    [49.8, 470.9],
    [46.5, 464.7],
    [42.6, 459.0],
    [37.9, 453.9],
    [33.2, 448.8],
    [30.9, 442.3],
    [31.7, 435.5],
    [35.3, 429.6],
    [41.1, 425.7],
  ]),
  pickups: [],
  bridge: { type: 'acoustic', x: 0, y: SCALE },
  controls: { knobs: [] },
  // 14 frets clear of the body.
  neckJoint: { y: fretY(14) },
  frets: 20,
  neck: 'acoustic',
  binding: true,
  details: soundholeDetails(HOLE),
};

export default concert;
