import { crossesGBShift, openStringMidi, type Position } from '../../theory';
import { octaveItemId, type Skill } from '../model';
import { FRETS_0_12, itemsOf, memo } from './helpers';

/**
 * C1: octave shapes, including the G–B shift (research/03). An item such as
 * `octave:s6f5→s4` asks for the octave of string 6, fret 5 on string 4; the
 * drill resolves it with `octaveOnString`. Every shape runs both ways, up and
 * down the strings (research/02 rule 1), and stays within frets 0–12 like F2
 * and C2.
 */

// D16 (play-the-note) plays the octave on a real guitar, in mic mode only.
const DRILLS = ['octave-finder', 'play-the-note'];

/** An ordered string pair: the octave of a note on `from` is found on `to`. */
type Pair = readonly [from: number, to: number];

/** Shapes two and three strings apart, as lower-string → upper-string pairs. */
const SHAPE_PAIRS: readonly Pair[] = [
  [6, 4],
  [5, 3],
  [4, 2],
  [3, 1],
  [6, 3],
  [5, 2],
  [4, 1],
];

/**
 * Frets from `from` to `to` in the octave shape: the octave nearest in fret,
 * e.g. +2 for 6→4, +3 for 4→2 (the G–B shift), 0 for the double octave 6→1.
 */
export function octaveShapeOffset(from: number, to: number): number {
  const gap = openStringMidi(to) - openStringMidi(from);
  return 12 * Math.round(gap / 12) - gap;
}

/** Every item of the given pairs, in both directions, where the shape fits frets 0–12. */
function octaveItems(skillId: string, pairs: readonly Pair[]) {
  const ids = pairs
    .flatMap(([a, b]) => [[a, b] as const, [b, a] as const])
    .flatMap(([from, to]) => {
      const offset = octaveShapeOffset(from, to);
      return FRETS_0_12.filter((fret) => FRETS_0_12.includes(fret + offset)).map((fret) => {
        const pos: Position = { string: from, fret };
        return octaveItemId(pos, to);
      });
    });
  return itemsOf(skillId, ids);
}

const crossesGB = ([a, b]: Pair) => crossesGBShift(a, b);

export const skills: Skill[] = [
  {
    id: 'C1.octaves',
    topic: 'C1',
    order: 1100,
    title: 'Octave shapes',
    prerequisites: ['F2.string6-naturals', 'F2.string5-naturals'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() =>
      octaveItems(
        'C1.octaves',
        SHAPE_PAIRS.filter((p) => !crossesGB(p)),
      ),
    ),
  },
  {
    id: 'C1.octaves-gb-shift',
    topic: 'C1',
    order: 1110,
    title: 'Octave shapes across the G–B shift',
    prerequisites: ['C1.octaves'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() => octaveItems('C1.octaves-gb-shift', SHAPE_PAIRS.filter(crossesGB))),
  },
  {
    id: 'C1.double-octaves',
    topic: 'C1',
    order: 1120,
    title: 'Double octaves: strings 6 and 1',
    prerequisites: ['C1.octaves'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() => octaveItems('C1.double-octaves', [[6, 1]])),
  },
];
