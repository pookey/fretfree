import type { KeyMode } from '../../theory';
import { functionItemId } from '../items/function';
import { itemsOf, memo } from './helpers';
import type { Skill } from '../model';

/**
 * I5: chord function and substitution (research/03: "classify a chord's
 * function; spot the borrowed chord"; "name the chord's function; pick a
 * substitute"). All on the `function` drill, by choice:
 *
 * - `I5.function-major` and `I5.function-minor`: tonic, subdominant or
 *   dominant (`function:vi@major`). The key varies per prompt (rule 12), so
 *   a card is the degree's, not one key's.
 * - `I5.secondary-dominants`: V7/ii … V7/vi both ways
 *   (`secondary:V7/ii@key=C` → A7, `secondary-of:V7/ii@key=C` → ii).
 * - `I5.borrowed`: spot the chord borrowed from the parallel minor in a
 *   progression (`borrowed:bVII@key=C`).
 * - `I5.substitutes`: the tritone substitute of a dominant 7th
 *   (`tritone-sub:G7` → D♭7). The relative substitute is the relative
 *   minor or major, which I3 already cards.
 *
 * Function needs the numerals (C8) and the progressions they make (C9),
 * and minor-key function the harmonic V (I4). A secondary dominant is a
 * dominant 7th (C5); a borrowed chord comes from the parallel minor, so the
 * minor key's chords (I4) come first.
 */

const DRILLS = ['function'];

/** Within a mode, the chords progressions use most come first. */
const FUNCTION_ORDER: Readonly<Record<KeyMode, readonly string[]>> = {
  major: ['IV', 'V', 'vi', 'ii', 'iii', 'vii°'],
  minor: ['iv', 'V', 'bVI', 'bVII', 'bIII', 'v', 'ii°', 'vii°'],
};

/** V/V and V/ii (ii–V–I), then V/vi, V/IV and V/iii. */
const TARGET_ORDER: readonly string[] = ['V', 'ii', 'vi', 'IV', 'iii'];
const SECONDARY_KEYS: readonly string[] = ['C', 'G', 'D', 'A', 'F', 'Bb'];

/** iv and ♭VII (the commonest), then ♭VI, ♭III and v. */
const BORROWED_ORDER: readonly string[] = ['iv', 'bVII', 'bVI', 'bIII', 'v'];
const BORROWED_KEYS: readonly string[] = ['C', 'G', 'D', 'A', 'E', 'F'];

/** Round the circle of fifths, so each card's answer is a card further on. */
const TRITONE_ROOTS: readonly string[] = [
  'G',
  'C',
  'D',
  'A',
  'E',
  'B',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'F#',
];

function functionIds(mode: KeyMode): string[] {
  return FUNCTION_ORDER[mode].map((numeral) => functionItemId({ kind: 'function', numeral, mode }));
}

/** Per key, each target both ways. */
function secondaryIds(): string[] {
  return SECONDARY_KEYS.flatMap((key) =>
    TARGET_ORDER.flatMap((target) => [
      functionItemId({ kind: 'secondary', target, key }),
      functionItemId({ kind: 'secondary-of', target, key }),
    ]),
  );
}

function borrowedIds(): string[] {
  return BORROWED_KEYS.flatMap((key) =>
    BORROWED_ORDER.map((numeral) => functionItemId({ kind: 'borrowed', numeral, key })),
  );
}

function tritoneIds(): string[] {
  return TRITONE_ROOTS.map((root) => functionItemId({ kind: 'tritone-sub', chord: `${root}7` }));
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
    id: 'I5.function-major',
    title: 'Chord function in major keys',
    prerequisites: ['C9.pop'],
    ids: () => functionIds('major'),
  },
  {
    id: 'I5.function-minor',
    title: 'Chord function in minor keys',
    prerequisites: ['I5.function-major', 'I4.harmonic-minor'],
    softUnlock: true,
    ids: () => functionIds('minor'),
  },
  {
    id: 'I5.secondary-dominants',
    title: 'Secondary dominants',
    prerequisites: ['I5.function-major', 'C5.sevenths'],
    ids: secondaryIds,
  },
  {
    id: 'I5.borrowed',
    title: 'Borrowed chords',
    prerequisites: ['I5.function-major', 'I4.minor-numerals'],
    softUnlock: true,
    ids: borrowedIds,
  },
  {
    id: 'I5.substitutes',
    title: 'Tritone substitutes',
    prerequisites: ['I5.secondary-dominants'],
    softUnlock: true,
    ids: tritoneIds,
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'I5',
  // After I4, its neighbour in the Minor and function module (design §5).
  order: 2200 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  ...(g.softUnlock ? { softUnlock: true } : {}),
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
