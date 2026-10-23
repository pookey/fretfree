import { soundholeDetails, type Soundhole } from '../acoustic';
import { SCALE, fretY } from '../geometry';
import { smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Jumbo: the largest flat-top. Round shoulders, a narrow waist and a very
 * wide, round lower bout; 14 frets clear of the body. A round soundhole with
 * a rosette, a pinned bridge, a teardrop guard and no electronics. Only the
 * type's name is used.
 *
 * Outline source: drawn from the dimension table below, not traced: key
 * points were placed on those widths and depths, the curve fitted through
 * them and resampled by curvature (outline method, `outline.ts`). The
 * headstock is our own.
 *
 * Dimensions, in inches (published: 21 long; upper bout 11.875, waist
 * 9.75, lower bout 16.875). Upper bout widest 4.3 below the top, waist 8.1,
 * lower bout 14.4. The body is drawn at 0.82 of that, 352 x 437 mm: the
 * true width and length don't fit the shared frame below a 14th-fret joint.
 * The points start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [0.0, 796.7],
  [-15.0, 796.5],
  [-31.0, 795.5],
  [-46.9, 793.6],
  [-62.6, 790.7],
  [-78.0, 786.5],
  [-93.1, 781.0],
  [-107.5, 774.2],
  [-121.1, 765.6],
  [-133.6, 755.7],
  [-144.9, 744.4],
  [-154.8, 731.8],
  [-162.8, 718.0],
  [-169.1, 703.3],
  [-173.4, 687.9],
  [-175.8, 672.1],
  [-175.4, 656.1],
  [-171.4, 640.7],
  [-164.9, 626.0],
  [-156.6, 612.4],
  [-147.0, 599.5],
  [-136.3, 587.6],
  [-125.3, 576.0],
  [-114.7, 564.0],
  [-105.9, 550.7],
  [-101.6, 535.4],
  [-103.1, 519.5],
  [-108.0, 504.3],
  [-114.6, 489.8],
  [-120.1, 474.7],
  [-123.2, 459.0],
  [-123.6, 443.1],
  [-121.2, 427.3],
  [-115.9, 412.2],
  [-108.1, 398.2],
  [-97.8, 386.0],
  [-85.2, 376.2],
  [-70.9, 369.0],
  [-55.7, 364.1],
  [-39.9, 361.3],
  [-24.0, 359.9],
  [-8.0, 359.4],
  [0.0, 359.4],
  [8.0, 359.4],
  [24.0, 359.9],
  [39.9, 361.3],
  [55.7, 364.1],
  [70.9, 369.0],
  [85.2, 376.2],
  [97.8, 386.0],
  [108.1, 398.2],
  [115.9, 412.2],
  [121.2, 427.3],
  [123.6, 443.1],
  [123.2, 459.0],
  [120.1, 474.7],
  [114.6, 489.8],
  [108.0, 504.3],
  [103.1, 519.5],
  [101.6, 535.4],
  [105.9, 550.7],
  [114.7, 564.0],
  [125.3, 576.0],
  [136.3, 587.6],
  [147.0, 599.5],
  [156.6, 612.4],
  [164.9, 626.0],
  [171.4, 640.7],
  [175.4, 656.1],
  [175.8, 672.1],
  [173.4, 687.9],
  [169.1, 703.3],
  [162.8, 718.0],
  [154.8, 731.8],
  [144.9, 744.4],
  [133.6, 755.7],
  [121.1, 765.6],
  [107.5, 774.2],
  [93.1, 781.0],
  [78.0, 786.5],
  [62.6, 790.7],
  [46.9, 793.6],
  [31.0, 795.5],
  [15.0, 796.5],
];

/** Ø 83 mm, its top edge just below the board's end (20 frets). */
const HOLE: Soundhole = { y: 492, r: 41.5, rosette: 7, gap: 3 };

const jumbo: BodyShape = {
  name: 'Jumbo',
  outline: smoothClosed(OUTLINE),
  // A teardrop on the treble side: its point beside the board's end, its inner
  // edge following the rosette and its broad end below the soundhole.
  // Drawn round the soundhole, so it sits on the top: the convex hull of a
  // small round tip and a broad lobe, less the rosette, every corner eased
  // to a radius of at least 8 mm.
  pickguard: smoothClosed([
    [45.5, 424.3],
    [52.3, 425.7],
    [57.8, 430.0],
    [62.3, 435.3],
    [66.7, 440.8],
    [71.0, 446.3],
    [75.1, 451.9],
    [78.9, 457.8],
    [82.4, 463.9],
    [85.5, 470.2],
    [88.2, 476.6],
    [90.6, 483.2],
    [92.3, 490.0],
    [93.6, 496.9],
    [94.4, 503.8],
    [94.8, 510.8],
    [94.8, 517.8],
    [94.2, 524.8],
    [93.4, 531.8],
    [92.1, 538.6],
    [90.5, 545.5],
    [88.2, 552.1],
    [84.8, 558.2],
    [80.6, 563.8],
    [75.5, 568.6],
    [69.9, 572.7],
    [63.6, 575.9],
    [57.0, 578.0],
    [50.1, 579.2],
    [43.1, 579.3],
    [36.1, 578.3],
    [29.4, 576.3],
    [23.1, 573.3],
    [17.3, 569.3],
    [12.3, 564.5],
    [9.6, 558.1],
    [10.2, 551.2],
    [14.2, 545.5],
    [20.2, 542.1],
    [26.5, 539.0],
    [32.4, 535.2],
    [37.7, 530.6],
    [42.4, 525.5],
    [46.3, 519.7],
    [49.5, 513.5],
    [51.9, 506.9],
    [53.4, 500.0],
    [54.0, 493.1],
    [53.7, 486.1],
    [52.4, 479.2],
    [50.3, 472.5],
    [47.4, 466.2],
    [43.7, 460.2],
    [39.2, 454.8],
    [34.2, 449.9],
    [30.8, 443.9],
    [30.8, 436.9],
    [33.6, 430.6],
    [38.8, 426.0],
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

export default jumbo;
