import { NECK_JOINT_Y, SCALE } from '../geometry';
import { along, inset, smoothClosed, stadium, type Pt } from '../outline';
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
 * smoothed (outline method, `outline.ts`); the bass shoulder and the
 * cutaway's exit from the pocket are eased by hand. The headstock is our own.
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
  // The shoulder is re-eased by hand to the ~30 mm radius of D164,227 Fig. 3,
  // its top falling slightly from the pocket towards the corner.
  [-142.5, 448.5],
  [-144.5, 428.0],
  [-142.0, 416.5],
  [-135.5, 407.0],
  [-126.0, 400.5],
  [-114.5, 398.0],
  [-97.0, 397.5],
  [-80.0, 397.0],
  [-63.0, 396.5],
  [-46.0, 396.0],
  [-29.0, 395.5],
  [-12.0, 395.5],
  [13.0, 397.0],
  // The cutaway leaves the pocket in one curve.
  [28.5, 399.5],
  [33.5, 415.0],
  [40.5, 430.0],
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

/** The control plate runs with the strings, inset from the lower treble bout. */
const PLATE_A = inset(outline, 'treble', SCALE - 52, 56);
const PLATE_B = inset(outline, 'treble', SCALE + 70, 46);

const telecaster: BodyShape = {
  name: 'Telecaster',
  outline,
  // Hand-placed on smooth curves, as the real part: about 15 mm in from the
  // upper bass edge, round the shoulder and down the bass side to the front
  // of the bridge plate, narrow on the treble side just past the neck
  // pickup, with only a strip beside the pocket under the cutaway.
  pickguard: smoothClosed([
    // Along the top, under the board at its right-hand end.
    [-24, J + 18],
    [-46, J + 20],
    [-70, J + 21],
    [-94, J + 22],
    // Round the shoulder, concentric with it.
    [-105, J + 24],
    [-112, J + 34],
    [-120, J + 48],
    // Down the bass side, 15–17 mm in.
    [-125, J + 63],
    [-119, J + 80],
    [-110, J + 98],
    [-99, J + 116],
    // Curving in from the waist to the front of the bridge plate.
    [-94, J + 136],
    [-80, J + 154],
    [-60, J + 170],
    [-44, SCALE - 77],
    [40, SCALE - 77],
    // Up the treble side, just past the neck pickup.
    [46, SCALE - 84],
    [49, J + 150],
    [48, J + 118],
    [45, J + 92],
    // A strip beside the pocket, under the cutaway.
    [42, J + 66],
    [33, J + 50],
    [29, J + 34],
    [20, J + 22],
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
