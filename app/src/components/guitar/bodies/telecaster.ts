import { NECK_JOINT_Y, SCALE } from '../geometry';
import { along, inset, insetOutline, smoothClosed, stadium, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Telecaster: a flat-sided slab with a round lower bout and one deep
 * cutaway scoop on the treble side by the neck heel; two single coils, a
 * bridge plate that holds the bridge pickup, and a control plate. Only the
 * name is the model's.
 *
 * Outline source: US design patent D164,227 (C. L. Fender, 1951; public
 * domain), Fig. 3. That figure is a back view drawn upside down, so it is
 * flipped top to bottom. Its contour was traced, the strap buttons and
 * neck plate removed, then rescaled to the dimension table, resampled and
 * smoothed (outline method, `outline.ts`). The headstock is our own.
 *
 * Dimensions, in inches: 12.75 wide × 15.75 long, the tail 136 mm behind
 * the saddles. The points start at the tail and run clockwise. The jack is
 * on the rim, so the top has none.
 */
const OUTLINE: readonly Pt[] = [
  [-4.5, 784.0],
  [-21.5, 784.0],
  [-38.5, 784.0],
  [-56.0, 784.0],
  [-73.0, 783.0],
  [-90.0, 780.0],
  [-106.0, 774.0],
  [-121.0, 765.5],
  [-134.0, 754.5],
  [-145.0, 741.5],
  [-153.5, 726.5],
  [-159.0, 710.0],
  [-162.5, 693.5],
  [-163.0, 676.0],
  [-162.0, 659.0],
  [-159.0, 642.0],
  [-154.5, 625.5],
  [-149.0, 609.0],
  [-142.0, 593.5],
  [-134.5, 578.0],
  [-127.0, 562.5],
  [-121.5, 546.5],
  [-118.5, 529.5],
  [-119.0, 512.5],
  [-123.0, 495.5],
  [-129.5, 480.0],
  [-137.0, 464.5],
  [-142.5, 448.5],
  [-144.5, 431.0],
  [-142.5, 414.0],
  [-136.5, 398.5],
  [-123.5, 388.5],
  [-106.0, 388.0],
  [-89.0, 388.0],
  [-72.0, 388.0],
  [-55.0, 392.0],
  [-38.5, 395.0],
  [-21.0, 395.0],
  [-4.0, 395.5],
  [13.0, 396.0],
  [30.5, 397.0],
  [38.5, 410.0],
  [39.5, 427.0],
  [51.0, 438.5],
  [66.5, 433.0],
  [79.0, 421.5],
  [88.5, 407.5],
  [96.5, 392.0],
  [111.0, 384.0],
  [127.0, 388.5],
  [135.0, 403.0],
  [138.5, 420.0],
  [138.5, 437.0],
  [136.0, 454.0],
  [130.5, 470.5],
  [123.0, 485.5],
  [117.5, 502.0],
  [115.0, 519.0],
  [115.5, 536.0],
  [119.5, 552.5],
  [126.5, 568.5],
  [134.0, 584.0],
  [140.5, 600.0],
  [146.5, 616.0],
  [152.0, 632.0],
  [156.5, 649.0],
  [160.0, 665.5],
  [161.0, 683.0],
  [159.5, 700.0],
  [155.5, 716.5],
  [148.5, 732.5],
  [139.0, 746.5],
  [127.0, 759.0],
  [113.5, 769.0],
  [98.0, 776.5],
  [81.5, 781.0],
  [64.5, 783.0],
  [47.0, 783.0],
  [30.0, 783.0],
  [13.0, 784.0],
];

const J = NECK_JOINT_Y;
const outline = smoothClosed(OUTLINE);

/**
 * The guard surrounds the neck pickup and sweeps down the bass side, 13 mm
 * in from the rim; the treble horn and the lower bout stay bare.
 */
const RIM = insetOutline(OUTLINE, 13);
const GUARD_RIM = RIM.filter(([x, y]) => x < 56 && y < SCALE - 80);

/** The control plate runs with the strings, inset from the lower treble bout. */
const PLATE_A = inset(outline, 'treble', SCALE - 52, 56);
const PLATE_B = inset(outline, 'treble', SCALE + 70, 46);

const telecaster: BodyShape = {
  name: 'Telecaster',
  outline,
  pickguard: smoothClosed([
    ...GUARD_RIM,
    // Down beside the neck pickup to the front of the bridge plate.
    [62, J + 100],
    [62, J + 140],
    [52, SCALE - 84],
    [-52, SCALE - 84],
    [-96, SCALE - 90],
  ]),
  pickups: [
    { type: 'single', x: 0, y: SCALE - 160 },
    { type: 'single', x: 0, y: SCALE - 40, angle: 8 },
  ],
  bridge: { type: 'plate', x: 0, y: SCALE },
  controls: {
    plate: stadium(PLATE_A, PLATE_B, 15),
    knobs: [along(PLATE_A, PLATE_B, 0.45), along(PLATE_A, PLATE_B, 0.85)].map(([x, y]) => ({
      x,
      y,
    })),
    switch: (() => {
      const [x, y] = along(PLATE_A, PLATE_B, 0.08);
      const angle = (Math.atan2(PLATE_A[0] - PLATE_B[0], PLATE_B[1] - PLATE_A[1]) * 180) / Math.PI;
      return { type: 'blade' as const, x, y, angle };
    })(),
  },
  neckJoint: { y: J },
};

export default telecaster;
