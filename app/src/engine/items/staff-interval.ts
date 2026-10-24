import type { Clef } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import type { StaffDirection } from './staff';

declare module '../model' {
  interface ItemRefs {
    'staff-interval': {
      kind: 'staff-interval';
      /** The staff interval, signed: +3 is a 3rd up, −2 a step down. ±2 to ±8 (an octave). */
      steps: number;
      clef: Clef;
      direction: StaffDirection;
    };
  }
}

/** The staff intervals R5 reads, as numbers: a 2nd (step) to an octave. */
export const STAFF_INTERVALS: readonly number[] = [2, 3, 4, 5, 6, 7, 8];

const STAFF_INTERVAL_ITEM = /^staff-interval:([+-][2-8])@(treble8vb|treble)(:place)?$/;

/**
 * `staff-interval:+3@treble8vb`: two notes side by side on the staff, a 3rd
 * apart, the second higher; the learner names the interval (R5, staff →
 * name). `staff-interval:-2@treble8vb:place` is the other direction: a note
 * and "a 2nd below", placed on the staff (name → staff). Each is its own card
 * (research/02 rule 1).
 *
 * The interval is the **staff** interval, counted in lines and spaces, not
 * semitones: a 3rd is line to line or space to space whatever the
 * accidentals. It is the shape a reader sees, so it is the same on every
 * note and in every key; drills vary the starting note (rule 12).
 */
export function staffIntervalItemId(
  steps: number,
  clef: Clef = 'treble8vb',
  direction: StaffDirection = 'read',
): string {
  if (!STAFF_INTERVALS.includes(Math.abs(steps))) {
    throw new RangeError(`Invalid staff interval: ${steps}`);
  }
  return `staff-interval:${steps > 0 ? '+' : ''}${steps}@${clef}${direction === 'place' ? ':place' : ''}`;
}

export function parseStaffIntervalItemId(
  id: string,
): { steps: number; clef: Clef; direction: StaffDirection } | null {
  const m = STAFF_INTERVAL_ITEM.exec(id);
  if (!m) return null;
  return {
    steps: Number(m[1]),
    clef: m[2] as Clef,
    direction: m[3] ? 'place' : 'read',
  };
}

/**
 * The confusion-matrix concept of a staff interval: `staff-interval:3`. The
 * size only, so up and down and both directions share it: the slip being
 * paired is a 3rd read as a 4th.
 */
export function staffIntervalConcept(steps: number): string {
  return `staff-interval:${Math.abs(steps)}`;
}

/**
 * Seed confusions (design §12 "interleave confusables"): each interval with
 * the next one up, a line or space apart (a 3rd and a 4th differ by one
 * place, and by whether the notes are both lines).
 */
export const STAFF_INTERVAL_CONFUSIONS: readonly (readonly [string, string])[] =
  STAFF_INTERVALS.slice(1).map(
    (n) => [staffIntervalConcept(n - 1), staffIntervalConcept(n)] as const,
  );

export default {
  kinds: ['staff-interval'],
  id: (ref) => staffIntervalItemId(ref.steps, ref.clef, ref.direction),
  parse(id) {
    const ref = parseStaffIntervalItemId(id);
    return ref && { kind: 'staff-interval', ...ref };
  },
} satisfies ItemKind<ItemRefs['staff-interval']>;
