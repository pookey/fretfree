import { NECK_JOINT_Y, SCALE } from '../geometry';
import { edgeAngle, inset, insetOutline, smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Stratocaster: a contoured double cutaway with a long bass horn and a
 * shorter treble horn, a clear waist and an offset lower bout; three single
 * coils, a tremolo and a contoured guard. Only the name is the model's.
 *
 * Outline source: the body path (only) of Openclipart 16768, "Fender
 * Stratocaster" by Piemaster (2008, public domain), rescaled to the
 * dimension table, centred on its lower bout, resampled and smoothed
 * (outline method, `outline.ts`). The headstock is our own.
 *
 * Dimensions, in inches: 13 wide × 18 long, the tail 131 mm behind the
 * saddles. The points start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [13.0, 779.0],
  [-7.5, 778.5],
  [-27.5, 777.5],
  [-48.0, 775.5],
  [-68.5, 773.0],
  [-88.5, 768.5],
  [-107.5, 761.0],
  [-124.5, 750.5],
  [-139.5, 736.5],
  [-151.5, 720.0],
  [-160.5, 701.5],
  [-165.0, 681.5],
  [-164.0, 661.0],
  [-160.0, 641.0],
  [-154.0, 621.5],
  [-147.0, 602.5],
  [-139.0, 583.5],
  [-130.0, 565.5],
  [-120.5, 547.0],
  [-113.5, 528.0],
  [-111.0, 507.5],
  [-115.0, 487.5],
  [-120.5, 468.0],
  [-126.0, 448.0],
  [-131.5, 428.5],
  [-135.5, 408.5],
  [-137.5, 388.0],
  [-136.5, 367.5],
  [-131.5, 348.0],
  [-122.0, 330.0],
  [-104.0, 322.0],
  [-86.5, 331.0],
  [-79.5, 350.0],
  [-76.5, 370.0],
  [-67.5, 388.5],
  [-51.0, 400.0],
  [-31.5, 397.0],
  [-15.0, 385.0],
  [1.0, 397.0],
  [16.0, 411.0],
  [31.0, 425.5],
  [46.0, 439.0],
  [64.5, 447.0],
  [84.0, 443.0],
  [98.0, 428.0],
  [106.0, 409.0],
  [117.5, 393.0],
  [136.5, 392.0],
  [151.5, 405.5],
  [158.0, 424.5],
  [156.0, 445.0],
  [150.5, 464.5],
  [143.5, 483.5],
  [137.5, 503.0],
  [133.5, 523.5],
  [132.5, 543.5],
  [135.5, 564.0],
  [142.5, 583.0],
  [150.0, 602.0],
  [156.5, 621.5],
  [161.5, 641.5],
  [164.5, 661.5],
  [165.5, 682.0],
  [162.5, 702.5],
  [156.0, 721.5],
  [145.5, 739.0],
  [131.0, 753.5],
  [114.0, 764.0],
  [94.5, 771.0],
  [74.5, 775.0],
  [54.0, 777.5],
  [33.5, 778.5],
];

const J = NECK_JOINT_Y;
const outline = smoothClosed(OUTLINE);

/**
 * The guard follows the rim 13 mm in, but not into the horns: on the bass
 * side it climbs the outside and the horn's inner edge only to the neck
 * joint, and on the treble side it keeps to the cutaway, crossing the
 * horn's root to rejoin the edge below it.
 */
const RIM = insetOutline(OUTLINE, 13);
const TREBLE_HORN_ROOT = J + 80;
const rim = (keep: (x: number, y: number) => boolean) =>
  RIM.filter((_, i) => keep(...(OUTLINE[i] as [number, number])));
/** Up the bass side to the neck joint (the points run tail first, clockwise). */
const BASS_SIDE = rim((x, y) => x < -100 && y > J - 4 && y < SCALE - 72);
/** Round the bass cutaway, under the board, and round the treble cutaway. */
const CUTAWAYS = rim(
  (x, y) => x >= -100 && y < J + 100 && (x < 0 ? y > J - 4 : x < 90 && y > J + 32),
);
/** Down the treble side, from below the horn to past the controls. */
const TREBLE_SIDE = rim((x, y) => x >= 90 && y > TREBLE_HORN_ROOT && y < SCALE + 40);

const JACK_Y = SCALE + 98;

const stratocaster: BodyShape = {
  name: 'Stratocaster',
  outline,
  pickguard: smoothClosed([
    ...BASS_SIDE,
    // Across the bass horn's root, level with the neck joint.
    [-100, J - 2],
    ...CUTAWAYS,
    // Across the treble horn's root.
    [104, J + 64],
    ...TREBLE_SIDE,
    // Round the controls, then across the top of the tremolo.
    [128, SCALE + 66],
    [112, SCALE + 80],
    [88, SCALE + 74],
    [68, SCALE + 46],
    [54, SCALE + 8],
    [44, SCALE - 18],
    [-44, SCALE - 18],
    [-84, SCALE - 34],
    [-112, SCALE - 56],
  ]),
  pickups: [
    { type: 'single', x: 0, y: SCALE - 160 },
    { type: 'single', x: 0, y: SCALE - 100 },
    { type: 'single', x: 0, y: SCALE - 42, angle: 9 },
  ],
  bridge: { type: 'tremolo', x: 0, y: SCALE },
  controls: {
    knobs: [
      { x: 78, y: SCALE - 12 },
      { x: 90, y: SCALE + 24 },
      { x: 100, y: SCALE + 58 },
    ],
    switch: { type: 'blade', x: 72, y: SCALE - 60, angle: 34 },
    // On the top, in a recessed plate on the lower treble bout, below the guard.
    jack: (() => {
      const [x, y] = inset(outline, 'treble', JACK_Y, 21);
      return { x, y, plate: true, angle: edgeAngle(outline, 'treble', JACK_Y) };
    })(),
  },
  neckJoint: { y: J },
};

export default stratocaster;
