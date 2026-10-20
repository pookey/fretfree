import { keyLabel, parseKey } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/**
 * Minor-key harmony items (I4, research/03 "explain E7 in A minor"):
 *
 * - `minor-chord:V7@key=Am`: which chord is V7 in A minor? (E7, from
 *   harmonic minor);
 * - `minor-source:V7@key=Am`: E7 in A minor comes from which scale? (A
 *   harmonic minor; `v` is natural minor, `I` borrowed from A major);
 * - `two-five:Am`: the minor ii–V–i (Bm7♭5 E7 Am).
 *
 * The numeral is written as `theory/harmony` writes it, counted from the
 * major scale on the tonic (`bVII`, `vii°`), and the key as its label.
 */
export type MinorHarmonyItemKind = 'minor-chord' | 'minor-source' | 'two-five';

type NumeralKind = 'minor-chord' | 'minor-source';

declare module '../model' {
  interface ItemRefs {
    'minor-harmony':
      | { kind: 'minor-chord' | 'minor-source'; numeral: string; key: string }
      | { kind: 'two-five'; key: string };
  }
}

/** The harmonic-minor chords asked by name: V, V7 and vii°. */
export const MINOR_CHORD_NUMERALS: readonly string[] = ['V', 'V7', 'vii°'];

/**
 * Chords whose source is asked: natural minor (v iv ♭III ♭VI ♭VII ii°),
 * harmonic minor (V V7 vii°), and borrowed from the parallel major (I IV).
 */
export const MINOR_SOURCE_NUMERALS: readonly string[] = [
  'v',
  'iv',
  'bIII',
  'bVI',
  'bVII',
  'ii°',
  'V',
  'V7',
  'vii°',
  'I',
  'IV',
];

const NUMERALS: Record<NumeralKind, readonly string[]> = {
  'minor-chord': MINOR_CHORD_NUMERALS,
  'minor-source': MINOR_SOURCE_NUMERALS,
};

const NUMERAL_ITEM = /^(minor-chord|minor-source):([^@\s]+)@key=([A-G][#b]?m)$/;
const TWO_FIVE_ITEM = /^two-five:([A-G][#b]?m)$/;

/** A minor key's canonical label: `Am`, `F#m`, `Bbm`. */
function isMinorKey(key: string): boolean {
  try {
    const k = parseKey(key);
    return k.mode === 'minor' && keyLabel(k) === key;
  } catch {
    return false;
  }
}

export function minorHarmonyItemId(kind: NumeralKind, numeral: string, key: string): string {
  if (!NUMERALS[kind].includes(numeral)) throw new RangeError(`Invalid ${kind}: ${numeral}`);
  if (!isMinorKey(key)) throw new RangeError(`Invalid minor key: ${key}`);
  return `${kind}:${numeral}@key=${key}`;
}

export function twoFiveItemId(key: string): string {
  if (!isMinorKey(key)) throw new RangeError(`Invalid minor key: ${key}`);
  return `two-five:${key}`;
}

export function parseMinorHarmonyItemId(id: string): ItemRefs['minor-harmony'] | null {
  const two = TWO_FIVE_ITEM.exec(id);
  if (two) {
    const key = two[1] as string;
    return isMinorKey(key) ? { kind: 'two-five', key } : null;
  }
  const m = NUMERAL_ITEM.exec(id);
  if (!m) return null;
  const kind = m[1] as NumeralKind;
  const numeral = m[2] as string;
  const key = m[3] as string;
  if (!NUMERALS[kind].includes(numeral) || !isMinorKey(key)) return null;
  return { kind, numeral, key };
}

export default {
  kinds: ['minor-chord', 'minor-source', 'two-five'],
  id: (ref) =>
    ref.kind === 'two-five'
      ? twoFiveItemId(ref.key)
      : minorHarmonyItemId(ref.kind, ref.numeral, ref.key),
  parse: parseMinorHarmonyItemId,
} satisfies ItemKind<ItemRefs['minor-harmony']>;
