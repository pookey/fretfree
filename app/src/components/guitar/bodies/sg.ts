import { NECK_JOINT_Y, SCALE } from '../geometry';
import { edgeAngle, inset, smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * SG: a thin slab with two pointed horns of nearly equal length, deep
 * round cutaways either side of the neck, a gentle waist and bevelled
 * edges all round; two humbuckers, a bar bridge with a stop tailpiece, four
 * knobs and a toggle, under a batwing guard. Only the name is the model's.
 *
 * Outline source: the body path (only) of Openclipart 16718, "Gibson SG
 * Special" by Piemaster (2008, public domain), rescaled to the dimension
 * table, centred on its lower bout, then eased by hand: the horn tips are
 * rounded, the kinks at both waists smoothed into single curves, the
 * cutaways made symmetric about the neck, and the curve resampled
 * (outline method, `outline.ts`). The headstock is our own.
 *
 * Dimensions, in inches (published: about 13.1 × 15.75): 13.1 wide × 15.8
 * long; upper bout 11.7 at 3.5 below the horn tips, waist 9.6 at 7.1 to
 * 7.5, lower bout 13.1 at 11.4 (4.5 from the tail); the bass horn's tip
 * 1.65 above the pocket and the treble horn's 1.15. The neck meets the
 * body near its 20th fret, so the body sits low: the tail is 144 mm behind
 * the saddles. The points start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [0.0, 792.0],
  [-20.0, 791.6],
  [-39.9, 790.0],
  [-59.7, 787.0],
  [-79.1, 782.3],
  [-97.8, 775.2],
  [-115.4, 765.7],
  [-131.2, 753.5],
  [-144.5, 738.7],
  [-154.2, 721.2],
  [-161.3, 702.5],
  [-165.6, 683.0],
  [-165.8, 663.1],
  [-161.7, 643.5],
  [-153.5, 625.4],
  [-141.5, 609.3],
  [-131.2, 592.2],
  [-125.8, 574.1],
  [-127.6, 555.3],
  [-134.5, 536.5],
  [-142.5, 518.2],
  [-149.2, 499.4],
  [-153.3, 479.9],
  [-152.0, 460.0],
  [-146.9, 440.7],
  [-138.0, 422.8],
  [-125.8, 407.0],
  [-113.1, 395.8],
  [-105.2, 391.5],
  [-99.4, 390.1],
  [-95.2, 394.0],
  [-94.1, 399.7],
  [-95.9, 405.5],
  [-97.0, 413.4],
  [-96.4, 426.3],
  [-90.8, 437.9],
  [-80.7, 445.9],
  [-70.0, 448.2],
  [-57.3, 445.8],
  [-47.0, 439.8],
  [-40.5, 435.1],
  [-33.8, 433.1],
  [-18.9, 432.1],
  [1.1, 432.0],
  [21.1, 432.1],
  [35.1, 433.3],
  [42.5, 436.2],
  [49.8, 441.4],
  [61.3, 447.3],
  [72.2, 448.3],
  [81.5, 444.9],
  [87.1, 439.3],
  [90.9, 430.1],
  [92.0, 417.2],
  [92.3, 410.2],
  [93.9, 404.5],
  [99.4, 402.5],
  [105.0, 404.0],
  [109.3, 408.2],
  [119.6, 420.4],
  [131.1, 436.8],
  [139.7, 454.8],
  [144.4, 474.2],
  [144.3, 494.1],
  [139.9, 513.6],
  [132.7, 532.3],
  [124.4, 550.4],
  [117.4, 569.1],
  [115.9, 585.0],
  [121.7, 602.9],
  [133.8, 618.8],
  [147.1, 633.8],
  [158.2, 650.3],
  [164.8, 669.1],
  [166.4, 689.0],
  [163.4, 708.8],
  [156.9, 727.6],
  [147.0, 745.0],
  [133.7, 759.9],
  [117.7, 771.8],
  [99.7, 780.4],
  [80.5, 785.9],
  [60.9, 789.6],
  [41.0, 791.7],
  [21.0, 792.2],
];

const J = NECK_JOINT_Y;
const outline = smoothClosed(OUTLINE);

const JACK_Y = SCALE + 100;

const sg: BodyShape = {
  name: 'SG',
  outline,
  // A batwing, hand-placed on smooth curves as the real part: tucked under
  // the board, along both cutaways about 12 mm in, out to a rounded wing
  // tip under each horn, down both sides in a shallow concave curve, and
  // across just below the bridge pickup. Both bevels stay bare. The hand
  // anchors were then eased until no bend is tighter than 14 mm and
  // resampled closer together round the wing tips and corners.
  pickguard: smoothClosed([
    [-16.0, 443.5],
    [-28.8, 445.9],
    [-37.5, 450.6],
    [-46.2, 460.2],
    [-56.1, 471.4],
    [-68.7, 479.4],
    [-81.9, 484.0],
    [-88.3, 486.6],
    [-93.2, 491.5],
    [-95.5, 498.1],
    [-94.6, 504.9],
    [-90.9, 510.8],
    [-84.9, 521.2],
    [-80.1, 535.4],
    [-77.4, 550.1],
    [-76.1, 565.0],
    [-76.8, 580.0],
    [-78.8, 594.8],
    [-81.9, 609.5],
    [-85.0, 622.1],
    [-85.8, 629.0],
    [-83.3, 636.6],
    [-78.3, 641.4],
    [-71.8, 643.6],
    [-63.8, 643.1],
    [-50.0, 640.9],
    [-35.2, 638.9],
    [-20.2, 637.5],
    [-5.2, 637.0],
    [9.7, 637.1],
    [24.7, 637.9],
    [39.6, 639.5],
    [54.5, 641.4],
    [69.1, 644.8],
    [77.9, 646.4],
    [85.7, 645.2],
    [91.4, 641.2],
    [94.7, 635.1],
    [95.1, 627.2],
    [92.8, 616.5],
    [90.3, 601.7],
    [89.5, 586.7],
    [90.9, 571.8],
    [94.0, 557.2],
    [98.1, 542.7],
    [101.9, 529.3],
    [105.1, 514.6],
    [108.2, 500.0],
    [109.5, 492.1],
    [108.4, 485.3],
    [104.4, 479.6],
    [98.2, 476.4],
    [91.3, 476.2],
    [82.7, 478.9],
    [69.9, 479.4],
    [56.9, 474.4],
    [45.9, 464.3],
    [36.5, 452.6],
    [26.7, 445.9],
    [13.9, 443.5],
    [-1.0, 443.0],
  ]),
  pickups: [
    { type: 'humbucker', x: 0, y: SCALE - 150 },
    { type: 'humbucker', x: 0, y: SCALE - 40 },
  ],
  bridge: { type: 'tune-o-matic', x: 0, y: SCALE },
  tailpiece: { type: 'stop', x: 0, y: SCALE + 56 },
  controls: {
    // Two volumes, two tones, in a trapezoid on the lower treble bout.
    knobs: [
      { x: 74, y: SCALE + 22 },
      { x: 110, y: SCALE + 6 },
      { x: 86, y: SCALE + 60 },
      { x: 122, y: SCALE + 44 },
    ],
    // On the treble side below the horn, through the guard's wing.
    switch: (() => {
      const [x, y] = inset(outline, 'treble', 492, 40);
      return { type: 'toggle' as const, x, y };
    })(),
    // On the top, near the lower treble edge.
    jack: (() => {
      const [x, y] = inset(outline, 'treble', JACK_Y, 24);
      return { x, y, angle: edgeAngle(outline, 'treble', JACK_Y) };
    })(),
  },
  neckJoint: { y: J },
  details: [{ d: outline, paint: 'bevel', width: 13 }],
};

export default sg;
