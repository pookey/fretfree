import { NECK_JOINT_Y, SCALE } from '../geometry';
import { inset, smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Les Paul: a round upper bout, one pointed cutaway on the treble side, a
 * lower bout much wider than the upper, a bound top; two humbuckers, a bar
 * bridge with a stop tailpiece, four knobs and a toggle. Only the name is
 * the model's.
 *
 * Outline source: the body path (only) of Openclipart 16769, "Gibson Les
 * Paul" by Piemaster (2008, public domain), rescaled to the dimension
 * table, centred on its lower bout, resampled and smoothed (outline method,
 * `outline.ts`). The bass bout beside the neck is redrawn as one arc. The
 * headstock is our own.
 *
 * Dimensions, in inches: 13 wide × 17.25 long, the tail 134 mm behind the
 * saddles. The points start at the tail and run clockwise. The jack is on
 * the rim, so the top has none.
 */
const OUTLINE: readonly Pt[] = [
  [12.0, 782.0],
  [-7.0, 781.5],
  [-25.0, 779.5],
  [-43.5, 776.0],
  [-61.5, 771.0],
  [-79.0, 764.5],
  [-95.5, 756.0],
  [-111.0, 745.0],
  [-124.5, 732.5],
  [-137.0, 718.0],
  [-147.5, 702.5],
  [-156.0, 685.5],
  [-162.0, 667.5],
  [-165.0, 649.0],
  [-164.5, 630.0],
  [-161.5, 611.0],
  [-155.5, 593.0],
  [-147.0, 576.0],
  [-137.0, 560.0],
  [-126.5, 544.5],
  [-115.5, 529.0],
  [-106.0, 512.5],
  [-98.0, 495.5],
  [-96.5, 476.5],
  [-100.5, 458.0],
  [-107.0, 440.5],
  [-114.5, 423.0],
  [-120.0, 404.5],
  [-120.5, 385.5],
  [-113.5, 368.0],
  [-100.5, 355.0],
  [-84.0, 346.5],
  [-65.5, 344.0],
  [-50.0, 350.0],
  [-37.0, 355.5],
  [-26.0, 360.5],
  [-8.0, 362.5],
  [10.0, 353.0],
  [22.0, 352.0],
  [26.0, 370.5],
  [33.0, 388.0],
  [46.0, 401.0],
  [64.0, 402.0],
  [80.5, 393.5],
  [95.5, 382.5],
  [108.5, 389.0],
  [110.0, 408.0],
  [105.0, 426.5],
  [97.0, 443.5],
  [91.0, 461.5],
  [89.0, 480.5],
  [95.0, 498.5],
  [105.0, 514.5],
  [116.0, 530.0],
  [127.0, 545.5],
  [138.0, 561.0],
  [148.0, 577.0],
  [156.0, 594.0],
  [162.0, 612.0],
  [165.0, 630.5],
  [164.5, 649.5],
  [161.0, 668.5],
  [155.0, 686.5],
  [148.0, 704.0],
  [139.5, 721.0],
  [129.0, 737.0],
  [116.5, 750.5],
  [101.5, 762.0],
  [85.0, 770.5],
  [67.0, 775.5],
  [49.0, 779.0],
  [30.5, 781.0],
];

const J = NECK_JOINT_Y;
const outline = smoothClosed(OUTLINE);

const lesPaul: BodyShape = {
  name: 'Les Paul',
  outline,
  // A broad raised teardrop, about 68 mm across the top: tucked against
  // the board's treble edge (x ≈ 30) down to the neck pickup's ring and
  // under the cutaway, its inner edge then along the rings (x ≈ 47), its
  // outer edge running nearly straight to a point by the bridge pickup.
  pickguard: smoothClosed([
    [30, J + 34],
    [40, J + 30],
    [58, J + 32],
    [76, J + 30],
    [92, J + 24],
    [96, J + 33],
    [91, J + 52],
    [86, J + 72],
    [81, J + 96],
    [77, J + 136],
    [68, J + 176],
    [57, SCALE - 40],
    [48, SCALE - 52],
    [47, J + 150],
    [47, J + 100],
    [43, J + 84],
    [31, J + 78],
    [30, J + 56],
  ]),
  pickups: [
    { type: 'humbucker', x: 0, y: SCALE - 152 },
    { type: 'humbucker', x: 0, y: SCALE - 40 },
  ],
  bridge: { type: 'tune-o-matic', x: 0, y: SCALE },
  tailpiece: { type: 'stop', x: 0, y: SCALE + 58 },
  controls: {
    // Two volumes, two tones, in a trapezoid well inside the lower bout.
    knobs: [
      { x: 76, y: SCALE + 24 },
      { x: 114, y: SCALE + 12 },
      { x: 86, y: SCALE + 66 },
      { x: 124, y: SCALE + 54 },
    ],
    switch: (() => {
      const [x, y] = inset(outline, 'bass', J + 16, 30);
      return { type: 'toggle' as const, x, y };
    })(),
  },
  neckJoint: { y: J },
  binding: true,
};

export default lesPaul;
