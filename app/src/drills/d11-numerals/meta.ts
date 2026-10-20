import { parseNumeralItemId, type Item, type NumeralItemKind } from '../../engine/model';
import {
  diatonicChords,
  nashvilleToRoman,
  parseKey,
  type DiatonicChord,
  type MusicalKey,
} from '../../theory';

/**
 * D11's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D11_ID = 'numerals';

/** How many choices each adaptive-scope level offers (research/02 rule 5: distractors). */
export const D11_CHOICES: readonly number[] = [4, 6, 8];

export const D11_SCOPE = { minLevel: 0, maxLevel: D11_CHOICES.length - 1 };

export interface D11Parsed {
  kind: NumeralItemKind;
  key: MusicalKey;
  target: DiatonicChord;
}

/** A numeral item's key and the diatonic chord it is about; null for items D11 doesn't ask. */
export function d11Parse(item: Item): D11Parsed | null {
  const ref = parseNumeralItemId(item.id);
  if (!ref) return null;
  const key = parseKey(ref.key);
  const target = diatonicChords(key).find((c) =>
    ref.kind === 'nashville' ? c.nashville === ref.numeral : c.roman === ref.numeral,
  );
  return target ? { kind: ref.kind, key, target } : null;
}

export function d11CanTest(item: Item): boolean {
  return d11Parse(item) !== null;
}

/** The confusion-matrix concept of a numeral: `numeral:<roman>`. */
export function d11Concept(roman: string): string {
  return `numeral:${roman}`;
}

export function d11ConceptOf(item: Item): string | null {
  const ref = parseNumeralItemId(item.id);
  if (!ref) return null;
  return d11Concept(ref.kind === 'nashville' ? nashvilleToRoman(ref.numeral) : ref.numeral);
}
