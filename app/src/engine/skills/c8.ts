import { diatonicChord, majorKey, type ScaleDegree } from '../../theory';
import { numeralItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C8: diatonic harmony (research/03: "chords in any key; numeral ↔ chord").
 * The harmonised major scale I ii iii IV V vi vii°, read both ways, then as
 * Nashville numbers (D11, choice):
 *
 * - `numeral:vi@key=D`: which chord is vi in D major? (Bm)
 * - `numeral-of:vi@key=D`: Bm in D major is which numeral? (vi)
 * - `nashville:6m@key=D`: which chord is 6m in D major? (Bm)
 *
 * One card per fact and direction (research/02 rule 1). The tonic chord is
 * given by the key's name, so I has no card, as degree 1 has none in C4.
 * Within a key the chords come in teaching order: the IV and V that make
 * the three-chord songs, then vi, ii, iii and the rare vii°.
 *
 * vii° is taught here, not in C5: naming it needs only "the 7th chord is
 * diminished", not spelling a diminished triad (C5 has no dim stage).
 * Minor keys belong to I4 (minor-key harmony); D11 already reads them.
 *
 * Keys come in three stages (M10-02), so a songs learner meets harmony in
 * the keys their first songs use within weeks, not after every key is
 * spelled: C, G and D (the commonest beginner keys, small enough to master
 * in days), then A, E and F, then B, F♯ and the flat keys. Each stage holds
 * all six chords of its keys, so I–IV–V and I–V–vi–IV come whole.
 *
 * Gates (design §5 M-Harmony "open early, in parallel"; research/02 rule 7):
 *
 * - Stage 1 needs `C5.triads` mastered: chord construction → progressions,
 *   the rule-7 gate, kept hard. It needed every key's degrees (C4) mastered
 *   too, so a songs learner waited on flat-key spelling for C, G and D; now
 *   it asks only that the sharp-key degrees are practising, and the two
 *   reinforce each other (vi in D is "the 6th degree, B, minor").
 * - Stage 2 opens once stage 1 is practising, and the flat-key degrees are
 *   too (F has a B♭).
 * - Stage 3 needs the flat-key degrees mastered (B♭ to D♭ are where key
 *   spelling stops being easy), and stage 2 practising.
 *
 * Nashville numbers are the same facts in another notation, so they open
 * softly, split the same way: each stage once its Roman stage is practising.
 * Only stage 1 is probed in placement; the later stages are the same skill
 * in more keys, and a learner who knows them meets them as reviews.
 */

const DRILLS = ['numerals'];

/** The keys of each stage, in teaching order (M10-02). */
export const C8_STAGE_KEYS: readonly (readonly string[])[] = [
  ['C', 'G', 'D'],
  ['A', 'E', 'F'],
  ['B', 'F#', 'Bb', 'Eb', 'Ab', 'Db'],
];

/** IV and V first (I–IV–V), then vi (I–V–vi–IV), ii (ii–V–I), iii and vii°. */
export const C8_DEGREE_ORDER: readonly ScaleDegree[] = [4, 5, 6, 2, 3, 7];

function chordsOf(tonic: string) {
  const key = majorKey(tonic);
  return C8_DEGREE_ORDER.map((d) => diatonicChord(key, d));
}

/** Each key in turn, each chord both ways: `numeral:IV@key=C`, `numeral-of:IV@key=C`, … */
function romanIds(keys: readonly string[]): string[] {
  return keys.flatMap((k) =>
    chordsOf(k).flatMap((c) => [
      numeralItemId('numeral', c.roman, k),
      numeralItemId('numeral-of', c.roman, k),
    ]),
  );
}

function nashvilleIds(keys: readonly string[]): string[] {
  return keys.flatMap((k) => chordsOf(k).map((c) => numeralItemId('nashville', c.nashville, k)));
}

const [STAGE_1, STAGE_2, STAGE_3] = C8_STAGE_KEYS as [string[], string[], string[]];

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  softPrerequisites?: readonly string[];
  softUnlock?: boolean;
  skipPlacement?: boolean;
  ids: () => string[];
}

const GROUPS: readonly Group[] = [
  {
    // The ID predates the stages: C9, I6 and saved progress name it.
    id: 'C8.numerals-major',
    title: 'Roman numerals: C, G and D',
    // The chords are major, minor or diminished triads (C5, rule 7: chord
    // construction → progressions), built on the key's degrees (C4).
    prerequisites: ['C5.triads'],
    softPrerequisites: ['C4.sharp-key-degrees'],
    ids: () => romanIds(STAGE_1),
  },
  {
    id: 'C8.nashville',
    title: 'Nashville numbers: C, G and D',
    prerequisites: ['C8.numerals-major'],
    softUnlock: true,
    // The placement budget has room for one C8 group: Roman numerals are
    // probed, and Nashville opens softly from them (M4-02).
    skipPlacement: true,
    ids: () => nashvilleIds(STAGE_1),
  },
  {
    id: 'C8.numerals-a-e-f',
    title: 'Roman numerals: A, E and F',
    prerequisites: [],
    softPrerequisites: ['C8.numerals-major', 'C4.flat-key-degrees'],
    // Stage 1's facts in more keys: placement probes stage 1 only.
    skipPlacement: true,
    ids: () => romanIds(STAGE_2),
  },
  {
    id: 'C8.nashville-a-e-f',
    title: 'Nashville numbers: A, E and F',
    prerequisites: [],
    softPrerequisites: ['C8.nashville', 'C8.numerals-a-e-f'],
    // Placement probes no Nashville group (above).
    skipPlacement: true,
    ids: () => nashvilleIds(STAGE_2),
  },
  {
    id: 'C8.numerals-other-keys',
    title: 'Roman numerals: B, F♯ and the flat keys',
    prerequisites: ['C4.flat-key-degrees'],
    softPrerequisites: ['C8.numerals-a-e-f'],
    // Stage 1's facts in more keys: placement probes stage 1 only.
    skipPlacement: true,
    ids: () => romanIds(STAGE_3),
  },
  {
    id: 'C8.nashville-other-keys',
    title: 'Nashville numbers: B, F♯ and the flat keys',
    prerequisites: [],
    softPrerequisites: ['C8.nashville-a-e-f', 'C8.numerals-other-keys'],
    // Placement probes no Nashville group (above).
    skipPlacement: true,
    ids: () => nashvilleIds(STAGE_3),
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C8',
  // After C5's chords, before C9 (1599.2) and CAGED: research/03 starts
  // harmony early.
  order: 1598 + i / 10,
  title: g.title,
  prerequisites: g.prerequisites,
  ...(g.softPrerequisites ? { softPrerequisites: g.softPrerequisites } : {}),
  ...(g.softUnlock ? { softUnlock: true } : {}),
  ...(g.skipPlacement ? { skipPlacement: true } : {}),
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
