import { keyLabel, parseKey, type KeyMode } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/**
 * Chord-function items (I5, research/03: "classify a chord's function; spot
 * the borrowed chord; pick a substitute"):
 *
 * - `function:vi@major`: what function vi has in a major key (tonic). The
 *   key varies per prompt (research/02 rule 12), so the card is the degree's.
 * - `secondary:V7/ii@key=C`: which chord is V7/ii in C major? (A7)
 * - `secondary-of:V7/ii@key=C`: the reverse, A7 in C major is the V7 of
 *   which chord? (ii, Dm)
 * - `borrowed:bVII@key=C`: spot B♭, borrowed from C minor, in a C major
 *   progression.
 * - `tritone-sub:G7`: the tritone substitute for G7 (D♭7).
 */
export type FunctionItemKind =
  'function' | 'secondary' | 'secondary-of' | 'borrowed' | 'tritone-sub';

declare module '../model' {
  interface ItemRefs {
    function:
      | { kind: 'function'; numeral: string; mode: KeyMode }
      | { kind: 'secondary' | 'secondary-of'; target: string; key: string }
      | { kind: 'borrowed'; numeral: string; key: string }
      | { kind: 'tritone-sub'; chord: string };
  }
}

type FunctionRef = ItemRefs['function'];

/**
 * The numerals whose function is asked: every diatonic chord but the tonic
 * (its function is in its name), and in minor the harmonic V and vii° too.
 */
export const FUNCTION_NUMERALS: Readonly<Record<KeyMode, readonly string[]>> = {
  major: ['ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
  minor: ['ii°', 'bIII', 'iv', 'v', 'V', 'bVI', 'bVII', 'vii°'],
};

/** What a secondary dominant can resolve to in a major key. */
export const SECONDARY_TARGETS: readonly string[] = ['ii', 'iii', 'IV', 'V', 'vi'];

/** The chords borrowed from the parallel minor that progressions use. */
export const BORROWED_NUMERALS: readonly string[] = ['bIII', 'iv', 'v', 'bVI', 'bVII'];

const FUNCTION_ITEM = /^function:([^@\s]+)@(major|minor)$/;
const SECONDARY_ITEM = /^(secondary|secondary-of):V7\/([^@\s]+)@key=([A-G][#b]?)$/;
const BORROWED_ITEM = /^borrowed:([^@\s]+)@key=([A-G][#b]?)$/;
const TRITONE_ITEM = /^tritone-sub:([A-G][#b]?)7$/;

function isMajorKey(key: string): boolean {
  try {
    const k = parseKey(key);
    return k.mode === 'major' && keyLabel(k) === key;
  } catch {
    return false;
  }
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new RangeError(`Invalid ${what}`);
}

export function functionItemId(ref: FunctionRef): string {
  switch (ref.kind) {
    case 'function':
      check(FUNCTION_NUMERALS[ref.mode]?.includes(ref.numeral) ?? false, `numeral ${ref.numeral}`);
      return `function:${ref.numeral}@${ref.mode}`;
    case 'secondary':
    case 'secondary-of':
      check(SECONDARY_TARGETS.includes(ref.target), `target ${ref.target}`);
      check(isMajorKey(ref.key), `key ${ref.key}`);
      return `${ref.kind}:V7/${ref.target}@key=${ref.key}`;
    case 'borrowed':
      check(BORROWED_NUMERALS.includes(ref.numeral), `numeral ${ref.numeral}`);
      check(isMajorKey(ref.key), `key ${ref.key}`);
      return `borrowed:${ref.numeral}@key=${ref.key}`;
    case 'tritone-sub':
      check(TRITONE_ITEM.test(`tritone-sub:${ref.chord}`), `chord ${ref.chord}`);
      return `tritone-sub:${ref.chord}`;
  }
}

export function parseFunctionItemId(id: string): FunctionRef | null {
  let m = FUNCTION_ITEM.exec(id);
  if (m) {
    const numeral = m[1] as string;
    const mode = m[2] as KeyMode;
    return FUNCTION_NUMERALS[mode].includes(numeral) ? { kind: 'function', numeral, mode } : null;
  }
  m = SECONDARY_ITEM.exec(id);
  if (m) {
    const kind = m[1] as 'secondary' | 'secondary-of';
    const target = m[2] as string;
    const key = m[3] as string;
    return SECONDARY_TARGETS.includes(target) && isMajorKey(key) ? { kind, target, key } : null;
  }
  m = BORROWED_ITEM.exec(id);
  if (m) {
    const numeral = m[1] as string;
    const key = m[2] as string;
    return BORROWED_NUMERALS.includes(numeral) && isMajorKey(key)
      ? { kind: 'borrowed', numeral, key }
      : null;
  }
  m = TRITONE_ITEM.exec(id);
  if (m) return { kind: 'tritone-sub', chord: `${m[1] as string}7` };
  return null;
}

export default {
  kinds: ['function', 'secondary', 'secondary-of', 'borrowed', 'tritone-sub'],
  id: functionItemId,
  parse: parseFunctionItemId,
} satisfies ItemKind<FunctionRef>;
