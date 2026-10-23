import { NECK_JOINT_Y, SCALE } from '../geometry';
import { INCH, edgeAngle, inset, smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Stratocaster: a contoured double cutaway, the bass horn longer than the
 * treble, three single coils and a tremolo. The outline is fitted through
 * the dimensions below (outline method, `outline.ts`), never traced; only
 * the name is the model's.
 *
 * Dimensions, in inches. The overall size is the published 13 × 18; the
 * bout and horn positions are measured down from the bass horn's tip and
 * read off reference proportions.
 */
const DIM = {
  length: 18,
  bassHorn: { x: -3.05, y: 0 },
  trebleHorn: { x: 3.35, y: 1.25 },
  upperBout: { width: 11.9, y: 4.9 },
  waist: { width: 10.7, y: 8.6 },
  lowerBout: { width: 13, y: 13.4 },
  pocket: { width: 2.2 },
};

const J = NECK_JOINT_Y;
const TAIL = SCALE + 131;
const TOP = TAIL - DIM.length * INCH;
const X = (inches: number) => inches * INCH;
const Y = (inches: number) => TOP + inches * INCH;
const P = X(DIM.pocket.width / 2);
const UB = X(DIM.upperBout.width / 2);
const W = X(DIM.waist.width / 2);
const LB = X(DIM.lowerBout.width / 2);

const BH = { x: X(DIM.bassHorn.x), y: Y(DIM.bassHorn.y) };
const TH = { x: X(DIM.trebleHorn.x), y: Y(DIM.trebleHorn.y) };

const POINTS: readonly Pt[] = [
  [-P, J],
  // Bass cutaway: a round U from the pocket up the horn's inner edge.
  [-38, J],
  [-47, J - 3],
  [-54, J - 10],
  [-58, J - 22],
  [-60, BH.y + 34],
  [-62, BH.y + 19],
  [-66, BH.y + 6],
  [BH.x, BH.y],
  // A small round tip, a straight run outwards, then a steady bend into
  // the upper bout: the slope only ever flattens, so there is no shoulder.
  [-88, BH.y + 5],
  [-95, BH.y + 15],
  [-104, BH.y + 31],
  [-117, BH.y + 55],
  [-130, BH.y + 79],
  [-141, BH.y + 101],
  [-UB + 3, BH.y + 119],
  [-UB, Y(DIM.upperBout.y) + 8],
  [-UB + 5, Y(DIM.upperBout.y) + 38],
  [-W - 2, Y(DIM.waist.y) - 26],
  [-W, Y(DIM.waist.y)],
  [-W - 6, Y(DIM.waist.y) + 36],
  [-LB + 9, Y(DIM.lowerBout.y) - 42],
  [-LB, Y(DIM.lowerBout.y)],
  [-LB + 6, Y(DIM.lowerBout.y) + 52],
  [-134, TAIL - 22],
  [-76, TAIL - 3],
  [0, TAIL],
  [76, TAIL - 3],
  [134, TAIL - 22],
  [LB - 6, Y(DIM.lowerBout.y) + 52],
  [LB, Y(DIM.lowerBout.y)],
  [LB - 9, Y(DIM.lowerBout.y) - 42],
  // The treble waist is gentler than the bass.
  [W + 9, Y(DIM.waist.y) + 36],
  [W + 5, Y(DIM.waist.y)],
  [W + 6, Y(DIM.waist.y) - 26],
  [UB - 2, Y(DIM.upperBout.y) + 38],
  [UB, Y(DIM.upperBout.y) + 14],
  [UB - 3, Y(DIM.upperBout.y) - 6],
  [UB - 10, TH.y + 74],
  [127, TH.y + 54],
  [114, TH.y + 32],
  [104, TH.y + 15],
  [96, TH.y + 5],
  [TH.x, TH.y],
  // Treble cutaway: shorter horn, the same round U.
  [76, TH.y + 4],
  [70, TH.y + 14],
  [66, TH.y + 24],
  [61, J - 6],
  [52, J],
  [40, J + 1],
];

const outline = smoothClosed(POINTS);
const guard = (side: 'bass' | 'treble', y: number, d = 14) => inset(outline, side, y, d);
const JACK_Y = Y(DIM.lowerBout.y) + 42;

const stratocaster: BodyShape = {
  name: 'Stratocaster',
  outline,
  // Inset from the edge where it follows the body; free points round the
  // pickups, tremolo and controls.
  pickguard: smoothClosed([
    [-P - 1, J + 4],
    [-44, J + 10],
    [-58, J + 2],
    [-70, TOP + 52],
    [-88, TOP + 46],
    guard('bass', TOP + 84),
    guard('bass', Y(DIM.upperBout.y)),
    guard('bass', Y(DIM.waist.y) - 20),
    guard('bass', Y(DIM.waist.y) + 30, 16),
    [-104, SCALE - 34],
    [-70, SCALE - 18],
    [-42, SCALE - 19],
    [42, SCALE - 19],
    [54, SCALE + 6],
    [64, SCALE + 44],
    [82, SCALE + 74],
    [104, SCALE + 80],
    [118, SCALE + 62],
    guard('treble', SCALE + 10, 30),
    guard('treble', Y(DIM.waist.y) + 30, 16),
    guard('treble', Y(DIM.waist.y) - 20),
    guard('treble', Y(DIM.upperBout.y)),
    guard('treble', TOP + 86),
    [86, TOP + 58],
    [70, J - 2],
    [56, J + 10],
    [40, J + 8],
  ]),
  pickups: [
    { type: 'single', x: 0, y: SCALE - 160 },
    { type: 'single', x: 0, y: SCALE - 100 },
    { type: 'single', x: 0, y: SCALE - 42, angle: 9 },
  ],
  bridge: { type: 'tremolo', x: 0, y: SCALE },
  controls: {
    knobs: [
      { x: 76, y: SCALE - 14 },
      { x: 88, y: SCALE + 24 },
      { x: 100, y: SCALE + 60 },
    ],
    switch: { type: 'blade', x: 70, y: SCALE - 62, angle: 34 },
    // On the top, in a recessed plate on the lower treble bout.
    jack: (() => {
      const [x, y] = inset(outline, 'treble', JACK_Y, 21);
      return { x, y, plate: true, angle: edgeAngle(outline, 'treble', JACK_Y) };
    })(),
  },
  neckJoint: { y: J },
};

export default stratocaster;
