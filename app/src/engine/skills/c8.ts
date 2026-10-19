import { diatonicChord, majorKey, type ScaleDegree } from '../../theory';
import { numeralItemId, type Skill } from '../model';
import { C4_FLAT_DEGREE_KEYS, C4_SHARP_DEGREE_KEYS } from './c4';
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
 * the three-chord songs, then vi, ii, iii and the rare vii°. Keys follow C4's
 * degree keys (sharp keys, then flat keys, round the circle).
 *
 * vii° is taught here, not in C5: naming it needs only "the 7th chord is
 * diminished", not spelling a diminished triad (C5 has no dim stage).
 * Minor keys belong to I4 (minor-key harmony); D11 already reads them.
 *
 * Numerals need the key's degrees (C4) and major and minor triads (C5), so
 * the first skill is gated on their mastery (design §5 M-Harmony). Nashville
 * numbers are the same facts in another notation, so they open softly.
 */

const DRILLS = ['numerals'];

const KEYS: readonly string[] = [...C4_SHARP_DEGREE_KEYS, ...C4_FLAT_DEGREE_KEYS];

/** IV and V first (I–IV–V), then vi (I–V–vi–IV), ii (ii–V–I), iii and vii°. */
export const C8_DEGREE_ORDER: readonly ScaleDegree[] = [4, 5, 6, 2, 3, 7];

function chordsOf(tonic: string) {
  const key = majorKey(tonic);
  return C8_DEGREE_ORDER.map((d) => diatonicChord(key, d));
}

/** Each key in turn, each chord both ways: `numeral:IV@key=C`, `numeral-of:IV@key=C`, … */
function romanIds(): string[] {
  return KEYS.flatMap((k) =>
    chordsOf(k).flatMap((c) => [
      numeralItemId('numeral', c.roman, k),
      numeralItemId('numeral-of', c.roman, k),
    ]),
  );
}

function nashvilleIds(): string[] {
  return KEYS.flatMap((k) => chordsOf(k).map((c) => numeralItemId('nashville', c.nashville, k)));
}

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  softUnlock?: boolean;
  ids: () => string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C8.numerals-major',
    title: 'Roman numerals in major keys',
    // The chords are built on the key's degrees (C4) and are major, minor or
    // diminished triads (C5, rule 7: chord construction → progressions).
    prerequisites: ['C4.flat-key-degrees', 'C5.triads'],
    ids: romanIds,
  },
  {
    id: 'C8.nashville',
    title: 'Nashville numbers',
    prerequisites: ['C8.numerals-major'],
    softUnlock: true,
    ids: nashvilleIds,
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C8',
  // After C5's chords, before CAGED: research/03 starts harmony early.
  order: 1598 + i,
  title: g.title,
  prerequisites: g.prerequisites,
  ...(g.softUnlock ? { softUnlock: true } : {}),
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
