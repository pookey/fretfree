import {
  keyLabel,
  nashvilleNumber,
  parseKey,
  parseNashville,
  parseRoman,
  romanNumeral,
} from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/**
 * Numeral items (C8, design §3.1): `numeral:vi@key=D` names the chord a
 * numeral is in a key (vi in D → Bm), `numeral-of:vi@key=D` the reverse
 * (Bm in D → vi), and `nashville:6m@key=D` reads a Nashville number as a
 * chord. The numeral is written as `theory/harmony` writes it (`vii°`,
 * `bVII`, `6m`) and the key as its label (`D`, `Bb`, `Am`).
 */
export type NumeralItemKind = 'numeral' | 'numeral-of' | 'nashville';

declare module '../model' {
  interface ItemRefs {
    numeral: { kind: NumeralItemKind; numeral: string; key: string };
  }
}

const NUMERAL_ITEM = /^(numeral|numeral-of|nashville):([^@\s]+)@key=([A-G][#b]?m?)$/;

function canonicalNumeral(kind: NumeralItemKind, numeral: string): boolean {
  if (kind === 'nashville') {
    const n = parseNashville(numeral);
    return n !== null && nashvilleNumber(n) === numeral;
  }
  const n = parseRoman(numeral);
  return n !== null && romanNumeral(n) === numeral;
}

function canonicalKey(key: string): boolean {
  try {
    return keyLabel(parseKey(key)) === key;
  } catch {
    return false;
  }
}

export function numeralItemId(kind: NumeralItemKind, numeral: string, key: string): string {
  if (!canonicalNumeral(kind, numeral)) throw new RangeError(`Invalid ${kind}: ${numeral}`);
  if (!canonicalKey(key)) throw new RangeError(`Invalid key: ${key}`);
  return `${kind}:${numeral}@key=${key}`;
}

export function parseNumeralItemId(
  id: string,
): { kind: NumeralItemKind; numeral: string; key: string } | null {
  const m = NUMERAL_ITEM.exec(id);
  if (!m) return null;
  const kind = m[1] as NumeralItemKind;
  const numeral = m[2] as string;
  const key = m[3] as string;
  if (!canonicalNumeral(kind, numeral) || !canonicalKey(key)) return null;
  return { kind, numeral, key };
}

export default {
  kinds: ['numeral', 'numeral-of', 'nashville'],
  id: (ref) => numeralItemId(ref.kind, ref.numeral, ref.key),
  parse: parseNumeralItemId,
} satisfies ItemKind<ItemRefs['numeral']>;
