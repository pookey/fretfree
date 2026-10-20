import type { Item } from '../../engine/model';
import { parseFunctionItemId } from '../../engine/items/function';
import { parseMinorHarmonyItemId } from '../../engine/items/minor-harmony';
import { diatonicFunction, parseRoman, type Numeral } from '../../theory';

/**
 * The function drill's eager half (design §6, §10): what the session
 * planner needs before the drill's logic has loaded. Keep it small; prompts
 * and grading belong in `logic.ts`.
 */

export const DF_ID = 'function';

/** How many choices each adaptive-scope level offers, where a kind's choices vary (rule 5). */
export const DF_CHOICES: readonly number[] = [4, 6];

export const DF_SCOPE = { minLevel: 0, maxLevel: DF_CHOICES.length - 1 };

export type DfRef =
  | NonNullable<ReturnType<typeof parseMinorHarmonyItemId>>
  | NonNullable<ReturnType<typeof parseFunctionItemId>>;

export function dfParse(item: Item): DfRef | null {
  return parseMinorHarmonyItemId(item.id) ?? parseFunctionItemId(item.id);
}

export function dfCanTest(item: Item): boolean {
  return dfParse(item) !== null;
}

/**
 * The confusion-matrix concept (rule 6):
 *
 * - a minor-key chord or a secondary dominant is its numeral, as D11 keys
 *   numerals (`numeral:V7`, `numeral:V7/ii`), so the harmonic V and D11's
 *   natural-minor v card pair up;
 * - a function card is its function (`function:tonic`), so a wrong function
 *   interleaves the cards of the two;
 * - a source card is its source (`source:harmonic`);
 * - the rest are their own card's.
 */
export function dfConceptOf(item: Item): string | null {
  const ref = dfParse(item);
  if (!ref) return null;
  switch (ref.kind) {
    case 'minor-chord':
      return `numeral:${ref.numeral}`;
    case 'minor-source':
      return `source:${dfSource(ref.numeral)}`;
    case 'function': {
      const { degree } = parseRoman(ref.numeral) as Numeral;
      return `function:${diatonicFunction(ref.mode, degree)}`;
    }
    case 'secondary':
    case 'secondary-of':
      return `numeral:V7/${ref.target}`;
    default:
      return item.id;
  }
}

export type DfSource = 'natural' | 'harmonic' | 'borrowed';

/** Where a minor-key chord comes from, by its numeral (see `MINOR_SOURCE_NUMERALS`). */
export function dfSource(numeral: string): DfSource {
  if (numeral === 'I' || numeral === 'IV') return 'borrowed';
  if (numeral === 'V' || numeral === 'V7' || numeral === 'vii°') return 'harmonic';
  return 'natural';
}
