import { NECK_JOINT_Y, SCALE } from '../geometry';
import { edgeAngle, inset, smoothClosed, type Pt } from '../outline';
import type { BodyDetail, BodyShape } from '../types';

/**
 * ES-335: a broad semi-hollow double cutaway with two rounded horns of
 * equal length, a soft waist and a wide round lower bout; f-holes on both
 * upper bouts, a bound top, two humbuckers, a bar bridge and a trapeze
 * tailpiece, four knobs, a toggle and a small guard on the treble side.
 * Only the name is the model's.
 *
 * Outline source: drawn from the dimension table below, not traced: the
 * points were placed on those widths and heights, the curve fitted through
 * them and resampled (outline method, `outline.ts`). The headstock is our own.
 *
 * Dimensions, in inches (published: 16 wide × 19 long; upper bout 12.25,
 * waist 10, lower bout 16). The whole body is drawn at 0.88 of that, so it
 * fits the shared frame: 14.1 × 16.75, upper bout 10.9 at 3.7 below the
 * horn tips, waist 9.1 at 7, lower bout 14.1 at 11.9; both round horns
 * 2.35 above the pocket. The tail is 147 mm behind the saddles. The points
 * start at the tail and run clockwise.
 */
const OUTLINE: readonly Pt[] = [
  [0.0, 795.0],
  [-20.0, 794.6],
  [-39.9, 793.0],
  [-59.7, 789.9],
  [-79.1, 785.3],
  [-98.0, 778.5],
  [-115.8, 769.5],
  [-132.3, 758.3],
  [-147.8, 744.1],
  [-159.9, 728.2],
  [-169.6, 710.7],
  [-176.1, 691.8],
  [-178.5, 672.0],
  [-176.3, 652.2],
  [-170.4, 633.1],
  [-160.8, 615.6],
  [-148.0, 598.9],
  [-134.3, 584.4],
  [-121.9, 568.7],
  [-116.0, 552.9],
  [-117.2, 536.0],
  [-124.2, 517.3],
  [-132.2, 499.0],
  [-137.6, 479.8],
  [-138.9, 459.8],
  [-136.4, 440.0],
  [-130.2, 421.0],
  [-120.1, 402.7],
  [-107.3, 387.3],
  [-91.9, 374.7],
  [-79.8, 370.0],
  [-68.9, 370.5],
  [-61.8, 374.0],
  [-56.8, 380.2],
  [-53.1, 389.4],
  [-47.1, 408.5],
  [-38.0, 421.5],
  [-28.8, 427.4],
  [-18.0, 429.2],
  [-1.0, 429.4],
  [18.0, 429.2],
  [27.8, 427.8],
  [38.0, 421.5],
  [46.6, 409.4],
  [52.9, 390.4],
  [56.8, 380.2],
  [61.8, 374.0],
  [68.0, 370.8],
  [78.8, 369.9],
  [91.0, 374.2],
  [106.6, 386.6],
  [119.5, 401.8],
  [129.8, 420.1],
  [136.1, 439.1],
  [138.9, 458.8],
  [137.8, 478.8],
  [132.5, 498.0],
  [124.6, 516.4],
  [117.5, 535.1],
  [115.9, 551.9],
  [121.4, 567.9],
  [133.6, 583.6],
  [147.4, 598.2],
  [160.3, 614.7],
  [170.0, 632.2],
  [176.1, 651.2],
  [178.5, 671.0],
  [176.3, 690.8],
  [170.0, 709.8],
  [160.5, 727.4],
  [148.4, 743.3],
  [133.1, 757.6],
  [116.7, 769.0],
  [98.9, 778.1],
  [80.1, 785.0],
  [60.7, 789.7],
  [40.9, 792.9],
  [21.0, 794.6],
];

const J = NECK_JOINT_Y;
const outline = smoothClosed(OUTLINE);

const JACK_Y = SCALE + 104;

/**
 * An f-hole from `top` to `bottom`: a slim S-shaped slot that swells at
 * its middle, a round eye at each end and a nick across its waist. `side`
 * is -1 on the bass side, which mirrors it.
 */
function fHole(top: Pt, bottom: Pt, side: 1 | -1): BodyDetail[] {
  const len = Math.hypot(bottom[0] - top[0], bottom[1] - top[1]);
  const u = [(bottom[0] - top[0]) / len, (bottom[1] - top[1]) / len] as const;
  const n = [-u[1] * side, u[0] * side] as const;
  const at = (s: number, v: number): Pt => [
    top[0] + u[0] * s * len + n[0] * v,
    top[1] + u[1] * s * len + n[1] * v,
  ];
  // The slot's centre line bends one way above its middle and back below.
  const mid = (s: number) => 4.5 * Math.sin(2 * Math.PI * s);
  const half = (s: number) => 1.4 + 2.8 * Math.sin(Math.PI * s);
  const steps = [0.04, 0.12, 0.22, 0.34, 0.46, 0.58, 0.7, 0.8, 0.88, 0.96];
  const slot = smoothClosed([
    ...steps.map((s) => at(s, mid(s) - half(s))),
    ...[...steps].reverse().map((s) => at(s, mid(s) + half(s))),
  ]);
  const eye = (s: number, v: number, r: number) => {
    const [x, y] = at(s, v);
    return smoothClosed(
      Array.from({ length: 12 }, (_, i): Pt => {
        const t = (i / 12) * 2 * Math.PI;
        return [x + r * Math.cos(t), y + r * Math.sin(t)];
      }),
    );
  };
  const nick = smoothClosed([at(0.47, -6), at(0.5, -6), at(0.53, 6), at(0.5, 6)]);
  return [
    { d: slot, paint: 'hole' },
    { d: eye(0, 3, 5.5), paint: 'hole' },
    { d: eye(1, -3, 6), paint: 'hole' },
    { d: nick, paint: 'hole' },
  ];
}

const es335: BodyShape = {
  name: 'ES-335',
  outline,
  // A long teardrop on the treble side, as the real part: a narrow rounded
  // tip by the board's end, widening steadily beside both pickup rings (its
  // inner edge tucked under them) to a broad round end, about 58 mm across,
  // level with the bridge pickup. It stays at least 9 mm clear of the
  // f-hole and the knobs.
  pickguard: smoothClosed([
    // The tip: an arc of radius 11.5 between the two edges' tangents.
    [36.5, 461.7],
    [37.6, 456.2],
    [41.1, 451.8],
    [46.3, 449.6],
    [51.8, 450.2],
    [56.5, 453.3],
    [59.2, 458.2],
    // Down the outer edge, beside the f-hole.
    [60.7, 464],
    [62.4, 471],
    [64.6, 484],
    [67.4, 498],
    [70.5, 514],
    [74, 528],
    [77.5, 542],
    [81, 556],
    [84.5, 570],
    [88, 584],
    [92, 596],
    [96.5, 607],
    // The broad round end.
    [99.5, 617],
    [100.5, 627],
    [98, 637],
    [91, 644.5],
    [81, 648],
    [70, 648.5],
    [59, 646],
    [49, 640],
    // Back up under the pickup rings.
    [42.5, 630],
    [41.5, 616],
    [41.5, 602],
    [42, 588],
    [42.5, 574],
    [43, 560],
    [43, 546],
    [42.5, 532],
    [42, 518],
    [41, 504],
    [40, 491],
    [38.5, 479],
    [37.6, 473],
    [36.8, 467.5],
  ]),
  pickups: [
    { type: 'humbucker', x: 0, y: SCALE - 150 },
    { type: 'humbucker', x: 0, y: SCALE - 40 },
  ],
  bridge: { type: 'tune-o-matic', x: 0, y: SCALE },
  tailpiece: { type: 'trapeze', x: 0, y: SCALE + 40 },
  controls: {
    // Two volumes, two tones, in a trapezoid on the lower treble bout.
    knobs: [
      { x: 86, y: SCALE + 18 },
      { x: 126, y: SCALE + 4 },
      { x: 98, y: SCALE + 60 },
      { x: 138, y: SCALE + 46 },
    ],
    // On the upper treble bout, between the horn and the f-hole.
    switch: (() => {
      const [x, y] = inset(outline, 'treble', 446, 26);
      return { type: 'toggle' as const, x, y };
    })(),
    // On the top, near the lower treble edge.
    jack: (() => {
      const [x, y] = inset(outline, 'treble', JACK_Y, 24);
      return { x, y, angle: edgeAngle(outline, 'treble', JACK_Y) };
    })(),
  },
  neckJoint: { y: J },
  binding: true,
  details: [...fHole([92, 472], [100, 580], 1), ...fHole([-92, 472], [-100, 580], -1)],
};

export default es335;
