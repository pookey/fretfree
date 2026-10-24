import { ENGINE_CONFIG } from '../config';
import { staffIntervalItemId } from '../items/staff-interval';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * R5: intervallic and pattern reading (research/03 track R, design §12):
 * see steps, skips and wider shapes between neighbouring notes instead of
 * decoding each note, which builds the read-ahead chunks skilled readers use
 * (Sloboda). Research/03's target is naming the interval between adjacent
 * staff notes in under 1.5 s; for now cards are graded on the standard
 * personal target (rule 3), until the runner has a per-drill speed-target
 * hook. Each interval and direction has a card per way of asking
 * (research/02 rule 1):
 *
 * - `staff-interval:+3@treble8vb`: two notes on the staff, named as an
 *   interval (2nd to octave);
 * - `staff-interval:+3@treble8vb:place`: a note and "a 3rd above", tapped
 *   on the staff.
 *
 * Intervals are staff intervals, counted in lines and spaces: the shape is
 * the same on every note and in every key, so the drill starts each card on
 * a fresh note (rule 12).
 *
 * Pedagogy: introduced early in Track R (design §12), so steps and skips
 * open as soon as the staff itself is being practised, beside R1's ledger
 * lines rather than after them. Steps and skips come first (the 2nd and 3rd,
 * which differ by line-to-space versus line-to-line), then 4ths and 5ths,
 * then 6ths, 7ths and the octave. Each set soft-unlocks the next once it is
 * practising (rule 6), and the confusion seeds pair each size with the next
 * (`engine/items/staff-interval.ts`). Up and down of one size are separate
 * cards that sit together, so the block mixes them.
 *
 * Reading is an optional track (design §12): previewable for everyone, never
 * a placement topic.
 */

export const R5_DRILLS = ['staff-interval'];

/** Interval sizes in the order each set introduces them. IDs are literals, which e2e seeds read. */
const SETS = [
  {
    id: 'R5.steps-skips',
    title: 'Steps and skips on the staff',
    prerequisites: ['R1.staff'],
    sizes: [2, 3],
  },
  {
    id: 'R5.fourths-fifths',
    title: 'Read 4ths and 5ths on the staff',
    prerequisites: ['R5.steps-skips'],
    sizes: [4, 5],
  },
  {
    id: 'R5.wide',
    title: 'Read 6ths, 7ths and octaves on the staff',
    prerequisites: ['R5.fourths-fifths'],
    sizes: [6, 7, 8],
  },
] as const;

/** Every interval size R5 reads, by skill. */
export const R5_SIZES: Readonly<Record<string, readonly number[]>> = Object.fromEntries(
  SETS.map((s) => [s.id, s.sizes]),
);

/**
 * A set's cards in the order they are introduced: each size up, then down,
 * as reading cards, leading by one new-item block; each placing card follows
 * in a later block, so it is recalled rather than copied from the worked
 * example just before it (research/02 rules 4 and 6), as in R1.
 */
export function r5ItemIds(
  sizes: readonly number[],
  lead: number = ENGINE_CONFIG.session.newBlockSize,
): string[] {
  const signed = sizes.flatMap((n) => [n, -n]);
  const id = (n: number, d: 'read' | 'place') => staffIntervalItemId(n, 'treble8vb', d);
  const out = signed.slice(0, lead).map((n) => id(n, 'read'));
  signed.forEach((n, i) => {
    out.push(id(n, 'place'));
    const next = signed[lead + i];
    if (next !== undefined) out.push(id(next, 'read'));
  });
  return out;
}

export const skills: Skill[] = SETS.map((s, i) => ({
  id: s.id,
  topic: 'R5',
  // Steps and skips sit between R1's staff (2900) and its ledger lines (2910).
  order: 2905 + i * 10,
  title: s.title,
  prerequisites: s.prerequisites,
  softUnlock: true,
  drillTypes: R5_DRILLS,
  items: memo(() => itemsOf(s.id, r5ItemIds(s.sizes))),
}));
