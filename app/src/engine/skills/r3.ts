import { keyApplyItemId } from '../items/key-apply';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * R3: key signatures on the staff (research/03 track R: "read a key
 * signature; apply it to an unaltered note"). D25 shows a signature and a
 * note written with no accidental, and asks what the note is: an item such
 * as `key-apply:F@2#` asks what F is under 2 sharps (F♯), in whichever octave
 * the staff shows it. One card per letter and signature (research/02 rule 1),
 * with the octave varied from rep to rep (rule 12).
 *
 * A signature's cards are the letters it alters, plus the next letter in the
 * order, which it leaves natural: G under 2 sharps (F♯ C♯) is G, not G♯. That
 * boundary is the mistake to catch (rule 6); the other natural letters would
 * pad the queue with cards answered the same way. The signatures are I3's
 * fifteen, so no answer needs a double sharp or flat.
 *
 * The signatures come in as I3 teaches them, sharps first, a few at a time:
 * up to 3, then 4 to 7. Each opens once the learner is practising I3's cards
 * for those signatures (links to I3), and the reading track is optional, so
 * R3 stays out of the placement test (its topic isn't probed).
 */

export const R3_DRILLS = ['key-signature-apply'];

const SHARP_ORDER = 'FCGDAEB';
const FLAT_ORDER = 'BEADGCF';

/** The letters a signature's cards ask about: its altered ones, then the next, natural one. */
export function r3Letters(alteration: number): string[] {
  const order = alteration >= 0 ? SHARP_ORDER : FLAT_ORDER;
  const n = Math.abs(alteration);
  return [...order.slice(0, Math.min(n + 1, 7))];
}

function cards(alterations: readonly number[]): string[] {
  return alterations.flatMap((a) => r3Letters(a).map((l) => keyApplyItemId(l, a)));
}

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  ids: () => string[];
}

/**
 * The groups, in order. With no sharps or flats the boundary letters are F
 * (the first sharp) and B (the first flat), so those two cards are split:
 * F with the sharps, B with the flats. IDs are literals, which e2e seeds read.
 */
const GROUPS: readonly Group[] = [
  {
    id: 'R3.sharps-few',
    title: 'Apply a key signature: up to 3 sharps',
    prerequisites: ['I3.sharp-signatures'],
    ids: () => ['key-apply:F@0', ...cards([1, 2, 3])],
  },
  {
    id: 'R3.flats-few',
    title: 'Apply a key signature: up to 3 flats',
    prerequisites: ['R3.sharps-few', 'I3.flat-signatures'],
    ids: () => ['key-apply:B@0', ...cards([-1, -2, -3])],
  },
  {
    id: 'R3.sharps-many',
    title: 'Apply a key signature: 4 to 7 sharps',
    prerequisites: ['R3.sharps-few'],
    ids: () => cards([4, 5, 6, 7]),
  },
  {
    id: 'R3.flats-many',
    title: 'Apply a key signature: 4 to 7 flats',
    prerequisites: ['R3.flats-few', 'R3.sharps-many'],
    ids: () => cards([-4, -5, -6, -7]),
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'R3',
  order: 3200 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  // Low-risk theory, as I3: open once the prerequisites are practising.
  softUnlock: true,
  drillTypes: R3_DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
