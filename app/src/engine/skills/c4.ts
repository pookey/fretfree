import { degreeItemId, spellKeyItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C4: major-scale construction and degrees (research/03: "spell any major
 * key; the 6th of E♭?"). Spelling is strict: each letter A–G once, so F#
 * major's 7th is E#, never F.
 *
 * - `spell-key:F#` spells the whole key in order (D7, ordered choice).
 * - `degree:6@Eb` names one degree's note (degree → note) and
 *   `degree-of:6@Eb` names the degree a note is (note → degree): one card per
 *   fact and direction (research/02 rule 1). The tonic is given, so degree 1
 *   has no card.
 *
 * Sharp keys come before flat keys, each in circle order (fewest accidentals
 * first), and keys before degrees: a degree is read off a key the learner can
 * already spell. Every key has a real signature (`isPracticalMajorKey`, tested),
 * so no prompt needs a double sharp or flat.
 */

const DRILLS = ['spell-it'];

/** Sharp keys in circle order, C first (no sharps). */
export const C4_SHARP_KEYS: readonly string[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
/** Flat keys in circle order. */
export const C4_FLAT_KEYS: readonly string[] = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

/**
 * Degree cards use one spelling per pitch class, so three enharmonic pairs
 * (C#/Db, F#/Gb, B/Cb) don't double the deck; spelling both is `spell-key`'s job.
 */
export const C4_SHARP_DEGREE_KEYS: readonly string[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#'];
export const C4_FLAT_DEGREE_KEYS: readonly string[] = ['F', 'Bb', 'Eb', 'Ab', 'Db'];

const DEGREES = [2, 3, 4, 5, 6, 7];

function degreeIds(keys: readonly string[]): string[] {
  return keys.flatMap((k) =>
    DEGREES.flatMap((d) => [degreeItemId('degree', d, k), degreeItemId('degree-of', d, k)]),
  );
}

function keyIds(keys: readonly string[]): string[] {
  return keys.map(spellKeyItemId);
}

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  ids: () => string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C4.sharp-keys',
    title: 'Spell the sharp keys',
    // The scale is built from whole and half steps: W W H W W W H (F1).
    prerequisites: ['F1.half-steps', 'F1.whole-steps'],
    ids: () => keyIds(C4_SHARP_KEYS),
  },
  {
    id: 'C4.flat-keys',
    title: 'Spell the flat keys',
    prerequisites: ['C4.sharp-keys'],
    ids: () => keyIds(C4_FLAT_KEYS),
  },
  {
    id: 'C4.sharp-key-degrees',
    title: 'Scale degrees in the sharp keys',
    prerequisites: ['C4.sharp-keys'],
    ids: () => degreeIds(C4_SHARP_DEGREE_KEYS),
  },
  {
    id: 'C4.flat-key-degrees',
    title: 'Scale degrees in the flat keys',
    prerequisites: ['C4.flat-keys', 'C4.sharp-key-degrees'],
    ids: () => degreeIds(C4_FLAT_DEGREE_KEYS),
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C4',
  order: 1400 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  // Spelling is low-risk theory: open once the prerequisites are practising.
  softUnlock: true,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
