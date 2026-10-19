import { parseLetterItemId, parseStepItemId, type Item } from '../../engine/model';
import { chromaOf, chromaToPc } from '../../theory';
import type { DrillContext } from '../types';

/**
 * D3's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D3_ID = 'note-wheel';

export type D3Kind = 'letter' | 'step';

/**
 * Scope levels: 0 = a 7-button chromatic window around the starting note
 * (the step's confusables stay in it: F vs F♯ above E); 1 = all 12 buttons.
 * Letter items always use the 7 naturals.
 */
export const D3_SCOPE = { minLevel: 0, maxLevel: 1 };

const ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The item's kind, starting note and signed offset, or null for another drill's item. */
export function d3Parse(item: Item): { kind: D3Kind; from: string; offset: number } | null {
  const step = parseStepItemId(item.id);
  if (step) return { kind: 'step', from: step.from, offset: step.semitones };
  const letter = parseLetterItemId(item.id);
  return letter ? { kind: 'letter', from: letter.from, offset: letter.steps } : null;
}

export function d3CanTest(item: Item): boolean {
  return d3Parse(item) !== null;
}

/** Signed semitones from `from` to the answer: letters walk the natural alphabet. */
export function d3SemitonesOf(kind: D3Kind, from: string, offset: number): number {
  if (kind === 'step') return offset;
  const start = ALPHABET.indexOf(from);
  const letter = (i: number) => chromaOf(ALPHABET[mod(start + i, 7)] as string);
  let semitones = 0;
  for (let i = 1; i <= Math.abs(offset); i++) {
    semitones +=
      offset > 0 ? mod(letter(i) - letter(i - 1), 12) : -mod(letter(-i + 1) - letter(-i), 12);
  }
  return semitones;
}

export function d3ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const parsed = d3Parse(item);
  if (!parsed) return null;
  const semitones = d3SemitonesOf(parsed.kind, parsed.from, parsed.offset);
  return chromaToPc(chromaOf(parsed.from) + semitones, ctx.accidentalPref);
}
