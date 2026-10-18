import { intervalShape, intervalShapes, type IntervalName, type IntervalShape } from '../../theory';
import { intervalItemId, parseIntervalItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C3: intervals as movable shapes, including the G–B +1 fret shift
 * (research/03). One item per shape and direction (research/02 rule 1):
 * `interval:M3@s6→s5` taps the M3 above a root on string 6 (name → position)
 * and `interval-name:M3@s6→s5` names the interval two dots make (position →
 * name). Drills vary the root fret, so each shape is met in many keys and neck
 * positions (rule 12). Shapes that cross the G–B pair stay in their interval's
 * skill, mixed in with the unshifted ones, so the shift is drilled interleaved.
 *
 * Octaves (P8) are C1's octave shapes, so C3 stops at the major 7th.
 */

/** Shapes ascend from the root to a higher-pitched string at most this many strings away. */
const MAX_STRING_SPAN = 2;
/** Largest fret distance between root and upper note that still fits under the hand. */
const MAX_STRETCH = 4;

const DRILLS = ['interval-name', 'interval-tap'];

interface Group {
  id: string;
  title: string;
  intervals: readonly IntervalName[];
}

/** Chord tones first (3rds, 5ths, 7ths), so chord construction can follow (rule 7). */
const GROUPS: readonly Group[] = [
  { id: 'C3.thirds', title: 'Interval shapes: 3rds', intervals: ['m3', 'M3'] },
  {
    id: 'C3.fourths-fifths',
    title: 'Interval shapes: 4ths, 5ths and the tritone',
    intervals: ['P4', 'TT', 'P5'],
  },
  { id: 'C3.sevenths', title: 'Interval shapes: 7ths', intervals: ['m7', 'M7'] },
  { id: 'C3.sixths', title: 'Interval shapes: 6ths', intervals: ['m6', 'M6'] },
  { id: 'C3.seconds', title: 'Interval shapes: 2nds', intervals: ['m2', 'M2'] },
];

function isPlayable(s: IntervalShape): boolean {
  const span = s.fromString - s.toString;
  return span >= 1 && span <= MAX_STRING_SPAN && Math.abs(s.fretOffset) <= MAX_STRETCH;
}

/** The playable shapes of the given intervals, root string lowest-pitched first. */
export function c3Shapes(intervals: readonly IntervalName[]): IntervalShape[] {
  return intervalShapes({ intervals }).filter(isPlayable);
}

/** The shape an `interval:` or `interval-name:` item drills, or null for other items. */
export function shapeOfItem(id: string): IntervalShape | null {
  const ref = parseIntervalItemId(id);
  return ref && intervalShape(ref.interval, ref.from, ref.to);
}

/** True for items whose shape crosses the G–B pair (one fret off the all-fourths shape). */
export function isGbShiftItem(id: string): boolean {
  return shapeOfItem(id)?.gbShift === true;
}

function shapeItemIds(s: IntervalShape): string[] {
  return [
    intervalItemId('interval-name', s.interval, s.fromString, s.toString),
    intervalItemId('interval', s.interval, s.fromString, s.toString),
  ];
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C3',
  order: 1300 + i * 10,
  title: g.title,
  // Intervals are counted in half and whole steps (F1). Later groups follow
  // the first once it is merely practising.
  prerequisites: i === 0 ? ['F1.half-steps', 'F1.whole-steps'] : [(GROUPS[i - 1] as Group).id],
  softUnlock: i > 0,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, c3Shapes(g.intervals).flatMap(shapeItemIds))),
}));
