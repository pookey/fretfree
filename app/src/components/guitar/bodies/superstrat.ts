import { NECK_JOINT_Y, SCALE } from '../geometry';
import { edgeAngle, inset, smoothClosed, type Pt } from '../outline';
import type { BodyShape } from '../types';

/**
 * Superstrat: a slimmer, sharper double cutaway than the Stratocaster,
 * with a long pointed bass horn, a deep treble cutaway that clears the
 * 24th fret, and a compact round lower bout; a humbucker, a single coil
 * and a humbucker, a locking tremolo, two knobs and a blade switch, and no
 * guard. Only the name is the type's.
 *
 * Outline source: drawn from the dimension table below, not traced: the
 * points were placed on those widths and heights, the curve fitted through
 * them and resampled (outline method, `outline.ts`). The headstock is our own.
 *
 * Dimensions, in inches (published: about 12.25 × 17.8): 12.25 wide ×
 * 16.8 long, the horns an inch shorter so the 24-fret board, three pickups
 * and tremolo fit the shared frame. Upper bout 11.3 at 4.2 below the bass
 * horn's tip, waist 10.3 at 8, lower bout 12.25 at 12.7; the bass horn's
 * tip 2.6 above the pocket and the treble horn's 1.4, the treble cutaway
 * 1.5 deep beside the board. The tail is 147 mm behind the saddles. The
 * points start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [0.0, 795.0],
  [-19.0, 794.4],
  [-39.0, 793.1],
  [-58.8, 790.5],
  [-78.4, 786.5],
  [-97.2, 779.8],
  [-114.7, 770.2],
  [-130.2, 757.6],
  [-142.6, 742.0],
  [-151.3, 724.0],
  [-155.9, 704.5],
  [-157.1, 684.6],
  [-155.1, 664.7],
  [-150.9, 645.1],
  [-145.1, 626.0],
  [-138.9, 607.0],
  [-134.2, 587.6],
  [-133.1, 567.6],
  [-135.8, 547.8],
  [-140.3, 528.3],
  [-143.7, 508.6],
  [-145.0, 488.7],
  [-144.4, 468.7],
  [-142.0, 448.8],
  [-138.4, 429.1],
  [-133.0, 409.9],
  [-126.1, 392.2],
  [-116.5, 375.8],
  [-111.9, 370.5],
  [-106.8, 367.5],
  [-100.9, 368.0],
  [-96.7, 371.9],
  [-94.7, 377.6],
  [-90.0, 392.9],
  [-81.0, 410.7],
  [-67.7, 424.1],
  [-49.3, 431.7],
  [-29.5, 434.0],
  [-9.5, 434.1],
  [10.5, 433.7],
  [19.5, 433.5],
  [25.4, 434.3],
  [30.5, 437.4],
  [34.8, 442.9],
  [37.6, 449.3],
  [45.4, 462.1],
  [54.7, 469.6],
  [66.2, 472.4],
  [77.8, 469.5],
  [87.0, 462.0],
  [96.0, 447.6],
  [103.7, 429.2],
  [112.1, 411.0],
  [116.1, 404.1],
  [120.4, 399.9],
  [125.8, 397.8],
  [130.4, 401.4],
  [133.4, 406.6],
  [135.3, 413.3],
  [140.0, 431.7],
  [142.8, 451.5],
  [143.1, 471.5],
  [141.4, 491.4],
  [137.6, 511.1],
  [133.6, 530.7],
  [130.4, 550.4],
  [129.0, 570.4],
  [130.4, 590.3],
  [134.8, 609.8],
  [140.7, 628.9],
  [146.8, 648.0],
  [151.5, 667.4],
  [154.0, 687.2],
  [153.6, 707.2],
  [149.8, 726.8],
  [142.3, 745.4],
  [131.5, 762.1],
  [116.8, 775.6],
  [99.0, 784.6],
  [79.7, 789.8],
  [59.9, 793.0],
  [40.0, 794.5],
  [20.0, 795.0],
];

const J = NECK_JOINT_Y;
const outline = smoothClosed(OUTLINE);

const JACK_Y = SCALE + 122;

const superstrat: BodyShape = {
  name: 'Superstrat',
  outline,
  pickups: [
    { type: 'humbucker', x: 0, y: SCALE - 128 },
    { type: 'single', x: 0, y: SCALE - 84 },
    { type: 'humbucker', x: 0, y: SCALE - 42 },
  ],
  bridge: { type: 'locking', x: 0, y: SCALE },
  controls: {
    // Volume by the bridge, the five-way blade, then tone, down the lower treble bout.
    knobs: [
      { x: 84, y: SCALE + 4 },
      { x: 102, y: SCALE + 66 },
    ],
    switch: { type: 'blade', x: 94, y: SCALE + 35, angle: 30 },
    // On the top, near the lower treble edge.
    jack: (() => {
      const [x, y] = inset(outline, 'treble', JACK_Y, 22);
      return { x, y, angle: edgeAngle(outline, 'treble', JACK_Y) };
    })(),
  },
  neckJoint: { y: J },
  frets: 24,
};

export default superstrat;
