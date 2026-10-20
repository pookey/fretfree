import { diatonicChord, minorKey, type ScaleDegree } from '../../theory';
import { minorHarmonyItemId, twoFiveItemId } from '../items/minor-harmony';
import { numeralItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I4: minor-key harmony, the harmonic-minor V and iiø–V7–i (research/03:
 * "explain E7 in A minor"). Three stages:
 *
 * - `I4.minor-numerals`: the natural-minor chords both ways on D11, as C8
 *   reads major keys (`numeral:iv@key=Am`, `numeral-of:iv@key=Am`). Within a
 *   key they come in the order minor-key songs use them: iv and ♭VII, ♭VI
 *   and ♭III (i–♭VII–♭VI–♭VII), then v and the rare ii°.
 * - `I4.harmonic-minor` (the `function` drill): which chord is V, V7 or
 *   vii° (`minor-chord:V7@key=Am` → E7), and where a chord in the key comes
 *   from (`minor-source:V7@key=Am` → harmonic minor). This is the I4
 *   misconception, "E7 isn't in A minor": V and v of one key enter side by
 *   side, and the source cards set natural, harmonic and borrowed chords
 *   against each other (rule 6).
 * - `I4.minor-ii-V-i`: the minor ii–V–i (`two-five:Am` → Bm7♭5 E7 Am).
 *
 * Keys: the relative minors of C4's sharp keys, then of its flat keys, up to
 * four accidentals, so no raised 7th needs a double sharp.
 */

const SHARP_KEYS: readonly string[] = ['Am', 'Em', 'Bm', 'F#m', 'C#m'];
const FLAT_KEYS: readonly string[] = ['Dm', 'Gm', 'Cm', 'Fm'];
export const I4_KEYS: readonly string[] = [...SHARP_KEYS, ...FLAT_KEYS];

/** iv and ♭VII, ♭VI and ♭III, then v and ii°. */
export const I4_DEGREE_ORDER: readonly ScaleDegree[] = [4, 7, 6, 3, 5, 2];

function numeralIds(key: string): string[] {
  const k = minorKey(key.slice(0, -1));
  return I4_DEGREE_ORDER.flatMap((d) => {
    const roman = diatonicChord(k, d).roman;
    return [numeralItemId('numeral', roman, key), numeralItemId('numeral-of', roman, key)];
  });
}

/**
 * Per key: the harmonic V by name and by source, then vii°, then the
 * natural-minor and borrowed chords it is told apart from.
 */
function harmonicIds(key: string): string[] {
  const chord = (n: string) => minorHarmonyItemId('minor-chord', n, key);
  const source = (n: string) => minorHarmonyItemId('minor-source', n, key);
  return [
    chord('V'),
    source('V'),
    source('v'),
    chord('V7'),
    source('V7'),
    source('bVII'),
    chord('vii°'),
    source('vii°'),
    source('iv'),
    source('bIII'),
    source('bVI'),
    source('ii°'),
    source('I'),
    source('IV'),
  ];
}

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  softUnlock?: boolean;
  drill: string;
  ids: () => string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'I4.minor-numerals',
    title: 'Chords in minor keys',
    // Design §5: Minor and function opens after Progressions. The minor-key
    // progression (i–♭VII–♭VI–♭VII) is the last of C9's.
    prerequisites: ['C9.minor'],
    drill: 'numerals',
    ids: () => I4_KEYS.flatMap(numeralIds),
  },
  {
    id: 'I4.harmonic-minor',
    title: 'The harmonic-minor V',
    prerequisites: ['I4.minor-numerals'],
    drill: 'function',
    ids: () => I4_KEYS.flatMap(harmonicIds),
  },
  {
    id: 'I4.minor-ii-V-i',
    title: 'The minor ii–V–i',
    // The major ii–V–I first (C9), and the V7 it borrows from harmonic minor.
    prerequisites: ['I4.harmonic-minor', 'C9.ii-V-I'],
    softUnlock: true,
    drill: 'function',
    ids: () => I4_KEYS.map(twoFiveItemId),
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'I4',
  // After Progressions (C9, C10 at 2000+), design §5.
  order: 2100 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  ...(g.softUnlock ? { softUnlock: true } : {}),
  drillTypes: [g.drill],
  items: memo(() => itemsOf(g.id, g.ids())),
}));
