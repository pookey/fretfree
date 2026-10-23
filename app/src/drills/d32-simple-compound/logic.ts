import type { MeterFact } from '../../engine/items/meter';
import type { Item } from '../../engine/model';
import {
  barLength,
  beatUnit,
  feltBeats,
  fracEq,
  meterKind,
  parseTimeSignature,
  type TimeSignature,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillSounds } from '../types';
import { D32_METERS, D32_SCOPE, d32Concept as concept, d32Parse as parse } from './meta';

export { D32_ID, D32_METERS, D32_SCOPE, d32CanTest, d32ConceptOf } from './meta';

/**
 * D32 "Simple or compound? How many felt beats?" (design §6, §12): T1's and
 * T2's facts about a time signature as one-tap choice cards.
 *
 * - `meter:6/8:feltBeats`: how many beats a bar is felt in (2, not 6).
 * - `meter:6/8:beatUnit`: what note one felt beat lasts (a dotted quarter).
 * - `meter:6/8:kind`: simple or compound.
 * - `meter:6/8:fromBeats`: the other direction, which time signature has
 *   2 dotted-quarter beats in a bar.
 *
 * Answers come from `theory/meter.ts` (`feltBeats`, `beatUnit`, `meterKind`).
 *
 * **The choices carry no clue.** Each kind of card offers a fixed row for
 * its family of meters (simple, compound, or cut time) at scope 0, and one
 * row for every meter at scope 1, in a fixed order: the same for every card
 * of a family. Every row holds the classic wrong answers: the top number as
 * a beat count (6, 9 and 12 on every compound card), the
 * bottom number as the beat (an eighth), and the meter with the same bar
 * felt the other way (3/4 for 6/8, 4/4 for 2/2; research/02 rule 6).
 *
 * The words (questions, facts, explanations, the panel's rules) are in
 * `text.ts`, which only the lazy view loads.
 */

export interface D32Prompt {
  itemId: string;
  fact: MeterFact;
  /** The time signature asked about, or (`fromBeats`) the one that answers it. */
  meter: string;
  /** The answer, as a choice. */
  answer: string;
  /** The buttons, in display order. */
  choices: string[];
}

/**
 * A choice: a beat count (`2`), a beat as its note value with a dot for
 * dotted (`4.`), `simple` or `compound`, or a time signature (`6/8`).
 */
export type D32Answer = string;

export type MeterFamily = 'simple' | 'compound' | 'cut';

const SIGNATURES = new Map(D32_METERS.map((m) => [m, parseTimeSignature(m)]));

export function signatureOf(meter: string): TimeSignature {
  const ts = SIGNATURES.get(meter);
  if (!ts) throw new RangeError(`D32 doesn't ask about ${meter}`);
  return ts;
}

export function familyOf(meter: string): MeterFamily {
  if (meter === '2/2') return 'cut';
  return meterKind(signatureOf(meter)) === 'compound' ? 'compound' : 'simple';
}

/** The meters a card's row is drawn from, at scope 0: its family, with the meters it is mistaken for. */
const FAMILY_METERS: Record<MeterFamily, readonly string[]> = {
  simple: ['2/4', '3/4', '4/4'],
  compound: ['3/4', '6/8', '9/8', '12/8'],
  cut: ['2/4', '4/4', '2/2'],
};

/** The beats a simple or cut-time card offers at scope 0; compound cards always get the full row. */
const FELT_ROW = ['2', '3', '4'];
const FELT_ROW_FULL = ['2', '3', '4', '6', '9', '12'];

/** Beat values by family at scope 0: the bottom number's note is always there. */
const UNIT_ROWS: Record<MeterFamily, readonly string[]> = {
  simple: ['2', '4', '8'],
  compound: ['4', '8', '4.'],
  cut: ['2', '4', '8'],
};
const UNIT_ROW_FULL = ['2', '4', '8', '4.'];

const KINDS = ['simple', 'compound'];

function level(scopeLevel: number): number {
  return Math.max(D32_SCOPE.minLevel, Math.min(D32_SCOPE.maxLevel, Math.round(scopeLevel)));
}

/** A felt beat as a choice: `4` (quarter), `4.` (dotted quarter), `2` (half). */
export function unitCode(ts: TimeSignature): string {
  const unit = beatUnit(ts);
  if (!unit) throw new RangeError('D32 meters have even beats');
  return `${unit.value}${'.'.repeat(unit.dots)}`;
}

/** A meter's answer to a kind of card. */
export function answerOf(fact: MeterFact, meter: string): string {
  const ts = signatureOf(meter);
  switch (fact) {
    case 'feltBeats':
      return String(feltBeats(ts));
    case 'beatUnit':
      return unitCode(ts);
    case 'kind':
      return meterKind(ts);
    case 'fromBeats':
      return meter;
  }
}

export function d32Choices(fact: MeterFact, meter: string, scopeLevel: number): string[] {
  const full = level(scopeLevel) >= 1;
  const family = familyOf(meter);
  switch (fact) {
    case 'feltBeats':
      // Every compound card gets the whole row, so its own top number isn't
      // the one odd button out (M8-05 review).
      return full || family === 'compound' ? FELT_ROW_FULL : FELT_ROW;
    case 'beatUnit':
      return [...(full ? UNIT_ROW_FULL : UNIT_ROWS[family])];
    case 'kind':
      return KINDS;
    case 'fromBeats': {
      const pool = full ? D32_METERS : FAMILY_METERS[family];
      return D32_METERS.filter((m) => pool.includes(m));
    }
  }
}

export function d32MakePrompt(item: Item, ctx: DrillContext): D32Prompt {
  const ref = parse(item);
  if (!ref) throw new Error(`D32 cannot test item ${item.id}`);
  return {
    itemId: item.id,
    fact: ref.fact,
    meter: ref.meter,
    answer: answerOf(ref.fact, ref.meter),
    choices: [...d32Choices(ref.fact, ref.meter, ctx.scopeLevel)],
  };
}

/**
 * The meter a wrong choice belongs to: the one with the same bar felt the
 * other way whose answer it is (3 beats for 6/8 is 3/4; 4 beats for 2/2 is
 * 4/4), or for `fromBeats` the chosen meter. Null when no meter fits.
 */
export function meterOfChoice(prompt: D32Prompt, choice: string): string | null {
  if (prompt.fact === 'fromBeats') return D32_METERS.includes(choice) ? choice : null;
  const bar = barLength(signatureOf(prompt.meter));
  return (
    D32_METERS.find(
      (m) =>
        m !== prompt.meter &&
        fracEq(barLength(signatureOf(m)), bar) &&
        answerOf(prompt.fact, m) === choice,
    ) ?? null
  );
}

export function d32Check(prompt: D32Prompt, answer: D32Answer): DrillCheck {
  const expected = display(prompt.fact, prompt.answer);
  const key = concept(prompt.meter);
  if (answer === prompt.answer) return { correct: true, expected, concept: key };
  const other = meterOfChoice(prompt, answer);
  return {
    correct: false,
    expected,
    concept: key,
    ...(other === null ? {} : { confusedWith: concept(other) }),
  };
}

/** Stored as `answerGiven`. */
export function d32DescribeAnswer(answer: D32Answer): string {
  return answer;
}

/**
 * No notes to pluck: a meter is heard on the click. The view plays a card's
 * bar on the timing engine's metronome when the learner asks (rule 10).
 */
export function d32Sounds(): DrillSounds {
  return { expected: [] };
}

// --- Display ----------------------------------------------------------------

const VALUE_NAMES: Record<string, string> = {
  '1': 'whole',
  '2': 'half',
  '4': 'quarter',
  '8': 'eighth',
  '16': 'sixteenth',
};

/** A beat code's name: `4.` → `dotted quarter`. */
export function unitName(code: string): string {
  const dotted = code.endsWith('.');
  const name = VALUE_NAMES[dotted ? code.slice(0, -1) : code] ?? code;
  return dotted ? `dotted ${name}` : name;
}

/** A choice as the learner reads it: `2`, `dotted quarter`, `Compound`, `6/8`. */
export function display(fact: MeterFact, choice: string): string {
  switch (fact) {
    case 'beatUnit':
      return unitName(choice);
    case 'kind':
      return choice === 'simple' ? 'Simple' : 'Compound';
    case 'feltBeats':
    case 'fromBeats':
      return choice;
  }
}

// --- Keyboard ---------------------------------------------------------------

/**
 * Hardware-keyboard answers (design §7). Beat counts are typed as the number
 * itself (`1` then `2` for 12); simple or compound as `s` or `c`; anything
 * else picks a button by position, 1 to 7.
 */
export function d32Keys(fact: MeterFact, choices: readonly string[]): Map<string, string> {
  if (fact === 'feltBeats') return new Map(choices.map((c) => [c, c]));
  const keys = new Map(choices.map((c, i) => [String(i + 1), c]));
  if (fact === 'kind') for (const c of choices) keys.set(c.charAt(0), c);
  return keys;
}

/**
 * A button's `aria-keyshortcuts`: its own number for a beat count, else its
 * position, and its initial for simple or compound. Undefined for 12, which
 * takes two keys in a row, something the attribute can't say.
 */
export function d32KeyFor(
  fact: MeterFact,
  choices: readonly string[],
  index: number,
): string | undefined {
  const choice = choices[index];
  if (choice === undefined) return undefined;
  if (fact === 'feltBeats') return choice.length === 1 ? choice : undefined;
  return fact === 'kind' ? `${index + 1} ${choice.charAt(0)}` : String(index + 1);
}

/**
 * Reads typed keys against a key map: an answer once the keys spell one,
 * otherwise the keys still to be continued (`1`, waiting for the `2` of 12).
 * A key that leads nowhere starts again from itself.
 */
export function d32ReadKeys(
  typed: string,
  key: string,
  keys: ReadonlyMap<string, string>,
): { answer: string | null; typed: string } {
  for (const attempt of [typed + key, key]) {
    const answer = keys.get(attempt);
    const longer = [...keys.keys()].some((k) => k.length > attempt.length && k.startsWith(attempt));
    if (answer !== undefined && !longer) return { answer, typed: '' };
    if (longer) return { answer: null, typed: attempt };
  }
  return { answer: null, typed: '' };
}
