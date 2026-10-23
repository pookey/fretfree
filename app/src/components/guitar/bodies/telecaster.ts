import { NECK_JOINT_Y, SCALE } from '../geometry';
import { INCH, along, inset, smoothClosed, stadium, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Telecaster: a slab with one cutaway on the treble side, a rounded bass
 * shoulder, two single coils, a bridge plate that holds the bridge pickup
 * and a control plate. The outline is fitted through the dimensions below
 * (outline method, `outline.ts`), never traced; only the name is the
 * model's.
 *
 * Dimensions, in inches. The overall size is the published 12.75 × 15.75;
 * the bout and horn positions are measured down from the top of the bass
 * shoulder and read off reference proportions. The jack is on the rim, so
 * the top has none.
 */
const DIM = {
  length: 15.75,
  shoulder: { x: -3.1 },
  upperBout: { width: 11.8, y: 2.6 },
  waist: { width: 11.5, y: 6.2 },
  lowerBout: { width: 12.75, y: 11.2 },
  trebleHorn: { x: 4.8, y: 1.0 },
  /** The cutaway meets the neck this far below the top. */
  cutaway: { y: 3.1 },
  pocket: { width: 2.2 },
};

const J = NECK_JOINT_Y;
const TAIL = SCALE + 136;
const TOP = TAIL - DIM.length * INCH;
const X = (inches: number) => inches * INCH;
const Y = (inches: number) => TOP + inches * INCH;
const P = X(DIM.pocket.width / 2);
const UB = X(DIM.upperBout.width / 2);
const W = X(DIM.waist.width / 2);
const LB = X(DIM.lowerBout.width / 2);
const TH = { x: X(DIM.trebleHorn.x), y: Y(DIM.trebleHorn.y) };
const CUT = Y(DIM.cutaway.y);

const POINTS: readonly Pt[] = [
  [-P, J],
  // Bass side: a nearly level top, a round shoulder, a nearly straight side.
  [-54, TOP + 4],
  [X(DIM.shoulder.x), TOP],
  [-106, TOP + 5],
  [-128, TOP + 18],
  [-144, TOP + 40],
  [-UB, Y(DIM.upperBout.y)],
  [-W, Y(DIM.waist.y)],
  [-LB, Y(DIM.lowerBout.y) - 4],
  // A broad bottom with rounded corners.
  [-LB + 2, Y(DIM.lowerBout.y) + 32],
  [-152, TAIL - 49],
  [-134, TAIL - 22],
  [-100, TAIL - 6],
  [-50, TAIL - 1],
  [0, TAIL],
  [50, TAIL - 1],
  [100, TAIL - 6],
  [134, TAIL - 22],
  [152, TAIL - 49],
  [LB - 2, Y(DIM.lowerBout.y) + 32],
  [LB, Y(DIM.lowerBout.y) - 4],
  [W, Y(DIM.waist.y)],
  [UB - 1, Y(DIM.upperBout.y) + 8],
  // The treble horn, then one long cutaway down to the end of the board.
  [147, TH.y + 31],
  [143, TH.y + 15],
  [134, TH.y + 4],
  [TH.x, TH.y],
  [108, TH.y + 3],
  [96, TH.y + 12],
  [84, CUT - 29],
  [70, CUT - 16],
  [54, CUT - 5],
  [P + 1, CUT],
  // Under the board: keeps the curve's tangents short at the pocket.
  [-6, J + 4],
];

const outline = smoothClosed(POINTS);
const guard = (side: 'bass' | 'treble', y: number, d = 14) => inset(outline, side, y, d);

/** The control plate runs with the strings, its far end inset from the lower bout. */
const PLATE_A = guard('treble', SCALE - 52, 56);
const PLATE_B = guard('treble', SCALE + 70, 46);

const telecaster: BodyShape = {
  name: 'Telecaster',
  outline,
  // Inset from the bass edge, round the neck pickup, stopping short of the
  // bridge plate, and following the cutaway on the treble side.
  pickguard: smoothClosed([
    [-P - 1, J + 10],
    [-56, J + 12],
    guard('bass', TOP + 14, 12),
    guard('bass', Y(DIM.upperBout.y)),
    guard('bass', Y(DIM.waist.y) - 30),
    guard('bass', Y(DIM.waist.y) + 10, 18),
    [-96, SCALE - 84],
    [-60, SCALE - 82],
    [60, SCALE - 82],
    [94, SCALE - 96],
    guard('treble', Y(DIM.waist.y) - 30, 26),
    guard('treble', Y(DIM.upperBout.y) + 20, 16),
    [114, CUT - 18],
    [92, CUT - 8],
    [70, CUT + 4],
    [48, CUT + 11],
    [P + 1, CUT + 12],
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
