import { NECK_JOINT_Y, SCALE } from '../geometry';
import { edgeAngle, inset, smoothClosed, type Pt } from '../outline';
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
  // The bass waist and the swell of the lower bout are eased by hand: the
  // source runs from one to the other in a straight diagonal.
  [-165.0, 661.0],
  [-162.5, 641.0],
  [-158.5, 621.5],
  [-152.5, 602.5],
  [-144.0, 583.5],
  [-133.0, 565.5],
  [-121.0, 547.0],
  [-111.5, 528.0],
  [-108.5, 507.5],
  [-113.0, 487.5],
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

const JACK_Y = SCALE + 109;

const stratocaster: BodyShape = {
  name: 'Stratocaster',
  outline,
  // Hand-placed on smooth convex curves, as the real part: 15–20 mm in on
  // the bass side, curving in to the tremolo's bass end so the lower bass
  // bout stays bare; across both horn roots and under the cutaways; then
  // down the treble side and round the knobs, ending clear of the jack.
  pickguard: smoothClosed([
    // Top: across the bass horn's root, round the cutaway, under the board.
    [-111, J + 26],
    [-102, J + 18],
    [-86, J + 16],
    [-70, J + 20],
    [-52, J + 22],
    [-34, J + 20],
    [0, J + 22],
    [20, J + 33],
    // Round the treble cutaway and across the treble horn's root.
    [32, J + 46],
    [46, J + 60],
    [64, J + 68],
    [84, J + 65],
    [100, J + 64],
    [114, J + 76],
    // Down the treble side, about 20–25 mm in.
    [114, J + 98],
    [110, J + 116],
    [107, J + 136],
    [106, J + 156],
    [109, J + 176],
    [115, J + 194],
    [121, J + 214],
    [127, J + 232],
    [136, J + 254],
    [139, J + 274],
    [140, J + 292],
    // The tail, about 20 mm inside the lower treble edge, clear of the jack.
    [136, J + 307],
    [125, J + 316],
    [110, J + 319],
    // Under the third knob and up past the others.
    [94, J + 317],
    [80, J + 307],
    [70, J + 288],
    [64, J + 270],
    // The turn by the tremolo, eased with evenly spaced points.
    [60, J + 255],
    [54, J + 244],
    [46, SCALE - 19],
    [38, SCALE - 21],
    [-38, SCALE - 21],
    [-50, SCALE - 25],
    // Up the bass side: one convex curve, 15–20 mm in, to the horn's root.
    [-64, SCALE - 38],
    [-78, SCALE - 58],
    [-84, J + 144],
    [-90, J + 114],
    [-98, J + 81],
    [-104, J + 52],
  ]),
  pickups: [
    { type: 'single', x: 0, y: SCALE - 160 },
    { type: 'single', x: 0, y: SCALE - 100 },
    { type: 'single', x: 0, y: SCALE - 42, angle: 9 },
  ],
  bridge: { type: 'tremolo', x: 0, y: SCALE },
  controls: {
    knobs: [
      { x: 72, y: SCALE - 22 },
      { x: 84, y: SCALE + 8 },
      { x: 94, y: SCALE + 38 },
    ],
    switch: { type: 'blade', x: 72, y: SCALE - 60, angle: 34 },
    // On the top, in a recessed plate on the lower treble bout, below the guard.
    jack: (() => {
      const [x, y] = inset(outline, 'treble', JACK_Y, 28);
      return { x, y, plate: true, angle: edgeAngle(outline, 'treble', JACK_Y) };
    })(),
  },
  neckJoint: { y: J },
};

export default stratocaster;
