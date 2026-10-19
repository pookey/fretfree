import { chordFormula, isPracticalSpelling, spellChord, type ChordKind } from '../../theory';
import { spellChordItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C5: chord construction (research/03: "spell Bm7"). Triads, then the four
 * common sevenths, then sus and add chords (`C5_CHORD_KINDS`). Each item
 * spells one chord, root given: `spell-chord:m7@B` → B D F# A (D7, ordered
 * choice). Spelling is strict, as in C4: chord tones sit on their letters.
 *
 * One skill per stage, so confusable kinds share a skill and are introduced
 * side by side and interleaved (research/02 rule 6): major with minor, `7`
 * with `maj7` (the b7 vs the 7, research/03's C5 misconception), `m7` with
 * `m7b5`, `sus2` with `sus4` and `add9`. Within a skill each root brings its
 * kinds in together, and roots run round the circle of fifths from F, so the
 * natural roots come first. Three stages also keep the placement test's
 * expert run within its budget (one probe group per skill).
 *
 * Chord construction is gated on mastery of the intervals it stacks (rule 7)
 * and of the keys it's spelled from (C4), so no C5 skill soft-unlocks.
 */

// D17 (play-sequence) plays the arpeggio on a real guitar, in mic mode only.
const DRILLS = ['spell-it', 'play-sequence'];

/** Roots for chords with a major 3rd (or none): the flat spellings charts use, bar F#. */
const MAJOR_ROOTS: readonly string[] = [
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'Db',
  'Ab',
  'Eb',
  'Bb',
];
/** Roots for chords with a minor 3rd: C#m and G#m, not Dbm and Abm. */
const MINOR_ROOTS: readonly string[] = [
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'G#',
  'Eb',
  'Bb',
];

/** The other spelling of each black-key root. */
const ENHARMONIC: Readonly<Record<string, string>> = {
  'F#': 'Gb',
  Gb: 'F#',
  'C#': 'Db',
  Db: 'C#',
  'G#': 'Ab',
  Ab: 'G#',
  'D#': 'Eb',
  Eb: 'D#',
  'A#': 'Bb',
  Bb: 'A#',
};

function practical(root: string, kind: ChordKind): boolean {
  return isPracticalSpelling(spellChord(root, kind));
}

/**
 * The 12 roots a kind is spelled from, one per pitch class. A root whose
 * spelling needs a double flat or sharp (E♭m7♭5: E♭ G♭ B𝄫 D♭) gives way to
 * its enharmonic twin (D♯m7♭5), so D7 can ask every item.
 */
export function c5Roots(kind: ChordKind): string[] {
  const roots = chordFormula(kind).includes('b3') ? MINOR_ROOTS : MAJOR_ROOTS;
  return roots.map((root) => {
    if (practical(root, kind)) return root;
    const twin = ENHARMONIC[root];
    if (twin && practical(twin, kind)) return twin;
    throw new Error(`No practical spelling of ${root} ${kind}`);
  });
}

/** Each root in turn, with every kind on it: C, Cm, G, Gm, … */
function chordIds(kinds: readonly ChordKind[]): string[] {
  const byKind = kinds.map(c5Roots);
  return MAJOR_ROOTS.flatMap((_, i) =>
    kinds.map((kind, k) => spellChordItemId(kind, byKind[k]?.[i] as string)),
  );
}

interface Group {
  id: string;
  title: string;
  kinds: readonly ChordKind[];
  prerequisites: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C5.triads',
    title: 'Spell major and minor triads',
    kinds: ['major', 'minor'],
    // A triad stacks a 3rd and a 5th (C3) on a root spelled from its key (C4).
    prerequisites: ['C3.thirds', 'C3.fourths-fifths', 'C4.sharp-keys', 'C4.flat-keys'],
  },
  {
    id: 'C5.sevenths',
    title: 'Spell 7th chords',
    // `7` next to `maj7` (b7 vs 7), and `m7` next to both `7` and `m7b5`.
    kinds: ['7', 'maj7', 'm7', 'm7b5'],
    prerequisites: ['C5.triads', 'C3.sevenths'],
  },
  {
    id: 'C5.sus-add',
    title: 'Spell sus and add9 chords',
    // add9's 9th is sus2's 2nd an octave up, with the 3rd kept.
    kinds: ['sus2', 'sus4', 'add9'],
    prerequisites: ['C5.sevenths', 'C3.seconds'],
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C5',
  order: 1500 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, chordIds(g.kinds))),
}));
