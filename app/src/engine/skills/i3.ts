import { keyFactItemId, signatureKeyItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I3: keys, key signatures, the circle of fifths and the relative minor
 * (research/03: "count sharps and flats; give the relative minor and the
 * V"). D40 drills them as key-signature cards, and the circle of fifths in
 * Explore quizzes them.
 *
 * - `key-signature:Eb`: how many sharps or flats E♭ major has, and which.
 * - `signature-key:3b`: the reverse, which major key has 3 flats. One card
 *   per fact and direction (research/02 rules 1 and 12).
 * - `relative-minor:Eb` and `dominant:Eb`: the relative minor and the V of
 *   a major key.
 *
 * The keys are C4's fifteen, each with a real signature, so no answer needs
 * a double sharp or flat. Sharp signatures come first, as in C4. C♯ major has
 * no V card: its V, G♯ major, would need an F double sharp.
 */

const DRILLS = ['key-signature'];

/** Sharp keys in circle order, C first (no sharps). */
export const I3_SHARP_KEYS: readonly string[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
/** Flat keys in circle order. */
export const I3_FLAT_KEYS: readonly string[] = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

const ALL_KEYS = [...I3_SHARP_KEYS, ...I3_FLAT_KEYS];

function signatureIds(keys: readonly string[], alterations: readonly number[]): string[] {
  return [
    ...keys.map((k) => keyFactItemId('key-signature', k)),
    ...alterations.map(signatureKeyItemId),
  ];
}

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  ids: () => string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'I3.sharp-signatures',
    title: 'Sharp key signatures',
    // A key's sharps are the ones its scale spells (C4).
    prerequisites: ['C4.sharp-keys'],
    ids: () => signatureIds(I3_SHARP_KEYS, [0, 1, 2, 3, 4, 5, 6, 7]),
  },
  {
    id: 'I3.flat-signatures',
    title: 'Flat key signatures',
    prerequisites: ['I3.sharp-signatures', 'C4.flat-keys'],
    ids: () => signatureIds(I3_FLAT_KEYS, [-1, -2, -3, -4, -5, -6, -7]),
  },
  {
    id: 'I3.dominants',
    title: 'The V of each key',
    // The V is the next key round the circle: one more sharp or one fewer flat.
    prerequisites: ['I3.flat-signatures'],
    ids: () => ALL_KEYS.filter((k) => k !== 'C#').map((k) => keyFactItemId('dominant', k)),
  },
  {
    id: 'I3.relative-minors',
    title: 'Relative minors',
    prerequisites: ['I3.flat-signatures'],
    ids: () => ALL_KEYS.map((k) => keyFactItemId('relative-minor', k)),
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'I3',
  // Straight after C4, its neighbour in the Keys module.
  order: 1450 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  // Low-risk theory, as C4: open once the prerequisites are practising.
  softUnlock: true,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
