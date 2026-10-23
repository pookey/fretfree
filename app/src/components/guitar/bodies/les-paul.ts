import { NECK_JOINT_Y, SCALE } from '../geometry';
import { INCH, inset, smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Les Paul: a small rounded upper bout, one pointed cutaway on the treble
 * side, a full lower bout, a bound top, two humbuckers, a bar bridge with
 * a stop tailpiece, four knobs and a toggle. The outline is fitted
 * through the dimensions below (outline method, `outline.ts`), never
 * traced; only the name is the model's.
 *
 * Dimensions, in inches. The overall size is the published 13 × 17.25;
 * the bout and horn positions are measured down from the top of the bass
 * bout and read off reference proportions. The jack is on the rim, so the
 * top has none.
 */
const DIM = {
  length: 17.25,
  upperBout: { width: 10.9, y: 2.9 },
  waist: { width: 9.0, y: 7.0 },
  lowerBout: { width: 13, y: 11.7 },
  trebleHorn: { x: 3.45, y: 0.75 },
  /** The cutaway meets the neck this far below the top. */
  cutaway: { y: 3.9 },
  pocket: { width: 2.2 },
};

const J = NECK_JOINT_Y;
const TAIL = SCALE + 134;
const TOP = TAIL - DIM.length * INCH;
const X = (inches: number) => inches * INCH;
const Y = (inches: number) => TOP + inches * INCH;
const P = X(DIM.pocket.width / 2);
const W = X(DIM.waist.width / 2);
const TH = { x: X(DIM.trebleHorn.x), y: Y(DIM.trebleHorn.y) };
const CUT = Y(DIM.cutaway.y);

/** The upper bass bout is round: an arc touching the top and its widest point. */
const UPPER = { r: (Y(DIM.upperBout.y) - TOP) * 1, cy: Y(DIM.upperBout.y) };
const UPPER_CX = -X(DIM.upperBout.width / 2) + UPPER.r;
const upper = (deg: number): Pt => {
  const t = (deg * Math.PI) / 180;
  return [UPPER_CX - UPPER.r * Math.sin(t), UPPER.cy - UPPER.r * Math.cos(t)];
};

/** The lower bout is an ellipse: widest at its dimension, round to the tail. */
const LOWER = { rx: X(DIM.lowerBout.width / 2), cy: Y(DIM.lowerBout.y) };
const LOWER_RY = TAIL - LOWER.cy;
const lower = (deg: number, side = -1): Pt => {
  const t = (deg * Math.PI) / 180;
  return [side * LOWER.rx * Math.sin(t), LOWER.cy - LOWER_RY * Math.cos(t)];
};

const POINTS: readonly Pt[] = [
  // Under the board: the body runs up to where its arc meets the neck.
  [-12, J],
  [-26, J - 32],
  // The bass bout's round arc, over its top.
  upper(-22),
  upper(0),
  upper(35),
  upper(65),
  upper(90),
  upper(118),
  [-W - 4, Y(DIM.waist.y) - 34],
  [-W, Y(DIM.waist.y)],
  lower(56),
  lower(70),
  lower(90),
  lower(118),
  lower(145),
  lower(180),
  lower(145, 1),
  lower(118, 1),
  lower(90, 1),
  lower(70, 1),
  lower(56, 1),
  [W, Y(DIM.waist.y)],
  [W + 4, Y(DIM.waist.y) - 36],
  // The treble side climbs into a round horn that points up and in, then
  // the cutaway scoops back down to the neck.
  [124, CUT + 10],
  [127, TH.y + 62],
  [122, TH.y + 38],
  [112, TH.y + 18],
  [100, TH.y + 5],
  [TH.x, TH.y],
  [78, TH.y + 5],
  [72, TH.y + 17],
  [68, TH.y + 34],
  [62, CUT - 26],
  [52, CUT - 9],
  [40, CUT - 1],
  [P + 1, CUT],
  // Under the board: keeps the curve's tangents short at the pocket.
  [0, J + 26],
];

const outline = smoothClosed(POINTS);

const lesPaul: BodyShape = {
  name: 'Les Paul',
  outline,
  // A raised guard in the cutaway, beside the pickups: inset from the
  // treble edge, pointed towards the bridge.
  pickguard: smoothClosed([
    [50, CUT + 16],
    [58, CUT + 6],
    [70, CUT - 14],
    [80, TH.y + 44],
    [92, TH.y + 34],
    inset(outline, 'treble', TH.y + 56, 11),
    inset(outline, 'treble', CUT + 30, 11),
    inset(outline, 'treble', Y(DIM.waist.y) - 30, 12),
    [92, SCALE - 74],
    [70, SCALE - 40],
    [58, SCALE - 36],
    [51, SCALE - 52],
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
      const [x, y] = inset(outline, 'bass', Y(DIM.upperBout.y) - 10, 30);
      return { type: 'toggle' as const, x, y };
    })(),
  },
  neckJoint: { y: J },
  binding: true,
};

export default lesPaul;
