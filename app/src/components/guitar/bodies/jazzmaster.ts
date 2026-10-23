import { NECK_JOINT_Y, SCALE } from '../geometry';
import { along, inset, smoothClosed, stadium, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Jazzmaster: a long offset body, its waist higher on the bass side than
 * on the treble, a long bass horn and a short treble one, and a lower bout
 * that swells out on the bass side; two wide single coils, a floating
 * bridge and a vibrato tailpiece, under a large guard with the rhythm
 * circuit's roller plate on the bass horn. Only the name is the model's.
 *
 * Outline source: US design patent D186,826 (C. L. Fender, 1959; public
 * domain), Fig. 3. That figure is a back view, so it is mirrored left to
 * right. Its contour was traced from the scanned drawing, the neck cut
 * away along the pocket, rescaled to the dimension table, resampled and
 * smoothed (outline method, `outline.ts`). The headstock is our own.
 *
 * Dimensions, in inches (published: about 14 × 19.2): 13.75 wide, so it
 * fits the shared frame, × 19.2 long. Measured down from the bass horn's
 * tip: the upper bout 10.45 across at 4, the bass waist at 6.3 (10.1
 * across) and the treble waist at 10.65 (10.8 across), the bass bout
 * widest at 13.8 and the treble at 16; the bass horn's tip 1.8 above the
 * pocket and the treble horn's 0.7 below it. The body's centre sits 7 mm
 * to the treble side of the strings, and the tail is 148 mm behind the
 * saddles. The points start at the tail and run clockwise. The jack is on
 * the guard, so none is drawn.
 */
const OUTLINE: readonly Pt[] = [
  [24.2, 795.0],
  [4.3, 792.7],
  [-15.5, 789.7],
  [-35.1, 785.7],
  [-54.5, 781.0],
  [-73.8, 775.6],
  [-92.8, 769.6],
  [-111.7, 763.0],
  [-129.6, 754.2],
  [-145.7, 742.4],
  [-159.1, 727.5],
  [-169.6, 710.6],
  [-177.0, 692.1],
  [-180.8, 671.4],
  [-180.7, 651.5],
  [-176.7, 631.9],
  [-169.7, 613.2],
  [-161.2, 595.1],
  [-152.7, 577.0],
  [-143.1, 559.5],
  [-133.9, 541.7],
  [-124.3, 524.1],
  [-115.7, 506.1],
  [-110.3, 486.9],
  [-108.6, 467.0],
  [-110.6, 446.1],
  [-115.8, 426.8],
  [-121.1, 407.6],
  [-125.6, 388.1],
  [-129.2, 368.4],
  [-131.1, 348.5],
  [-130.3, 330.6],
  [-127.8, 322.0],
  [-122.1, 315.1],
  [-110.6, 309.2],
  [-99.7, 309.2],
  [-90.0, 314.1],
  [-82.2, 323.2],
  [-72.0, 339.2],
  [-63.0, 351.2],
  [-58.9, 355.6],
  [-53.4, 357.3],
  [-47.5, 356.1],
  [-34.6, 354.7],
  [-14.6, 354.0],
  [5.4, 354.1],
  [23.3, 355.1],
  [32.8, 358.1],
  [39.8, 363.8],
  [49.5, 373.8],
  [63.5, 381.4],
  [83.3, 382.3],
  [100.4, 376.9],
  [111.1, 374.6],
  [120.9, 376.3],
  [132.7, 383.7],
  [140.2, 395.4],
  [145.9, 413.5],
  [149.0, 434.2],
  [149.2, 454.2],
  [147.1, 474.1],
  [143.4, 493.7],
  [138.3, 513.1],
  [132.4, 532.2],
  [126.3, 551.2],
  [121.3, 570.5],
  [121.6, 590.5],
  [127.3, 609.6],
  [135.4, 627.8],
  [144.4, 645.7],
  [153.8, 664.4],
  [161.6, 682.9],
  [167.0, 702.1],
  [167.7, 722.0],
  [162.9, 741.4],
  [153.6, 759.0],
  [139.9, 773.5],
  [123.6, 785.0],
  [104.9, 791.9],
  [85.1, 795.0],
  [65.1, 796.0],
  [45.1, 796.0],
];

const J = NECK_JOINT_Y;
const outline = smoothClosed(OUTLINE);

/** The rhythm circuit's plate runs along the bass horn. */
const RHYTHM_A = inset(outline, 'bass', 334, 22);
const RHYTHM_B = inset(outline, 'bass', 384, 21);
const RHYTHM_ANGLE =
  (Math.atan2(RHYTHM_A[0] - RHYTHM_B[0], RHYTHM_B[1] - RHYTHM_A[1]) * 180) / Math.PI;

const jazzmaster: BodyShape = {
  name: 'Jazzmaster',
  outline,
  // Hand-placed on smooth curves, as the real part: across below both
  // horns, clear of the rhythm plate, down the bass side about 15 mm in, then one
  // convex sweep in to the bridge's bass end; tucked under the bridge,
  // down round the vibrato's treble side to a lobe that holds the knobs,
  // up the treble side 15 mm in and round the treble cutaway to the board.
  pickguard: smoothClosed([
    [-24, 386],
    [-40, 387],
    [-56, 389],
    [-72, 392],
    [-86, 397],
    // Round the upper bass corner, below the rhythm plate.
    [-97, 405],
    [-103, 416],
    [-104, 430],
    [-101, 445],
    [-98, 463],
    [-98, 481],
    [-101, 499],
    [-108, 516],
    [-117, 532],
    [-124, 548],
    // The bass side's lower edge: one convex sweep in to the bridge.
    [-125, 564],
    [-118, 580],
    [-106, 595],
    [-92, 609],
    [-77, 622],
    [-62, 634],
    [-48, 643],
    // Tucked under the bridge.
    [-36, 649],
    [0, 650],
    [36, 649],
    // Round the vibrato's treble side to the knob lobe.
    [49, 655],
    [58, 666],
    [65, 680],
    [71, 695],
    [78, 710],
    [87, 724],
    [98, 735],
    [111, 742],
    [125, 744],
    [138, 739],
    [147, 728],
    [151, 713],
    [151, 697],
    [147, 681],
    [141, 665],
    [133, 649],
    [125, 633],
    [117, 617],
    [111, 601],
    [107, 585],
    [106, 569],
    [108, 553],
    [113, 537],
    [119, 521],
    [124, 505],
    [128, 489],
    [130, 473],
    [131, 457],
    [130, 441],
    [127, 425],
    // Across under the treble cutaway, 15–20 mm in.
    [117, 408],
    [107, 403],
    [95, 401],
    [83, 399],
    [71, 396],
    [59, 392],
    [47, 389],
    [35, 387],
    [22, 386],
  ]),
  pickups: [
    { type: 'wide', x: 0, y: SCALE - 150 },
    { type: 'wide', x: 0, y: SCALE - 62 },
  ],
  bridge: { type: 'tune-o-matic', x: 0, y: SCALE },
  tailpiece: { type: 'vibrato', x: 0, y: SCALE + 64 },
  controls: {
    // Volume and tone on the lower treble bout, both on the guard.
    knobs: [
      { x: 112, y: SCALE + 20 },
      { x: 128, y: SCALE + 52 },
    ],
    // The pickup selector on the upper treble bout.
    switch: (() => {
      const [x, y] = inset(outline, 'treble', 440, 32);
      return { type: 'toggle' as const, x, y };
    })(),
    plate: stadium(RHYTHM_A, RHYTHM_B, 12),
    rollers: [0.3, 0.68].map((t) => {
      const [x, y] = along(RHYTHM_A, RHYTHM_B, t);
      return { x, y, angle: RHYTHM_ANGLE };
    }),
  },
  neckJoint: { y: J },
};

export default jazzmaster;
