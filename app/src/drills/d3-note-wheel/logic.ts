import { parseLetterItemId, parseStepItemId, type Item } from '../../engine/model';
import {
  NATURAL_PCS,
  chromaOf,
  chromaToPc,
  isNatural,
  midiAt,
  midiToFretNote,
  type AccidentalPref,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D3 "Note-wheel steps" (design §6): "a whole step above E?". Tests the F1
 * items: `letter:±n@X` (the musical alphabet) and `step:±n@X` (half and whole
 * steps). Answers are spelled with the accidental preference, so a half step
 * above E is F (never E♯) and a whole step below F is D♯ or E♭.
 */

export const D3_ID = 'note-wheel';

export type D3Kind = 'letter' | 'step';

export interface D3Prompt {
  itemId: string;
  kind: D3Kind;
  /** The starting note, spelled with the preference. */
  from: string;
  /** Signed: letters for `letter`, semitones for `step`. */
  offset: number;
  /** Signed semitones from `from` to the answer. */
  semitones: number;
  question: string;
  expectedPc: string;
  /** Answer buttons, in ascending pitch order. */
  choices: string[];
  /** Start and answer on one string, so the neck shows a step as frets. */
  fromPosition: Position;
  expectedPosition: Position;
  fromMidi: number;
  fromName: string;
  expectedName: string;
  pref: AccidentalPref;
}

/** The answer is a pitch class, as typed or tapped. */
export type D3Answer = string;

/**
 * Scope levels: 0 = a 7-button chromatic window around the starting note
 * (the step's confusables stay in it: F vs F♯ above E); 1 = all 12 buttons.
 * Letter items always use the 7 naturals.
 */
export const D3_SCOPE = { minLevel: 0, maxLevel: 1 };

/** Half-width of the level-0 window, in semitones. */
export const D3_WINDOW = 3;

/** The string the step is drawn on: the low E string, where F2 starts. */
export const D3_STRING = 6;

const ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const mod = (n: number, m: number) => ((n % m) + m) % m;

function stepName(semitones: number): string {
  const size = Math.abs(semitones);
  if (size === 1) return 'A half step';
  if (size === 2) return 'A whole step';
  return `${size} half steps`;
}

export function d3Question(kind: D3Kind, from: string, offset: number): string {
  if (kind === 'step') return `${stepName(offset)} ${offset > 0 ? 'above' : 'below'} ${from}?`;
  const size = Math.abs(offset);
  const which = offset > 0 ? 'after' : 'before';
  return size === 1 ? `The letter ${which} ${from}?` : `${size} letters ${which} ${from}?`;
}

/** The worked-example line for the first, guided rep of a new item. */
export function d3WorkedExample(prompt: D3Prompt): string {
  return `${prompt.question.slice(0, -1)} is ${prompt.expectedPc}.`;
}

export function d3Choices(
  kind: D3Kind,
  fromChroma: number,
  scopeLevel: number,
  pref: AccidentalPref,
): string[] {
  if (kind === 'letter') return [...NATURAL_PCS];
  if (scopeLevel <= 0) {
    const size = D3_WINDOW * 2 + 1;
    return Array.from({ length: size }, (_, i) => chromaToPc(fromChroma - D3_WINDOW + i, pref));
  }
  return Array.from({ length: 12 }, (_, c) => chromaToPc(c, pref));
}

function parse(item: Item): { kind: D3Kind; from: string; offset: number } | null {
  const step = parseStepItemId(item.id);
  if (step) return { kind: 'step', from: step.from, offset: step.semitones };
  const letter = parseLetterItemId(item.id);
  return letter ? { kind: 'letter', from: letter.from, offset: letter.steps } : null;
}

export function d3CanTest(item: Item): boolean {
  return parse(item) !== null;
}

/** Signed semitones from `from` to the answer: letters walk the natural alphabet. */
function semitonesOf(kind: D3Kind, from: string, offset: number): number {
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

/** The starting fret on the drawn string, kept so the answer stays on 0–15. */
function fromFret(fromChroma: number, semitones: number, tuning: Tuning): number {
  const open = midiAt({ string: D3_STRING, fret: 0 }, tuning);
  let fret = mod(fromChroma - open, 12);
  while (fret + semitones < 0) fret += 12;
  return fret;
}

export function d3MakePrompt(item: Item, ctx: DrillContext): D3Prompt {
  const parsed = parse(item);
  if (!parsed) throw new Error(`D3 cannot test item ${item.id}`);
  const { kind, offset } = parsed;
  const fromChroma = chromaOf(parsed.from);
  const from = chromaToPc(fromChroma, ctx.accidentalPref);
  const semitones = semitonesOf(kind, parsed.from, offset);
  const start = fromFret(fromChroma, semitones, ctx.tuning);
  const fromPosition = { string: D3_STRING, fret: start };
  const expectedPosition = { string: D3_STRING, fret: start + semitones };
  const fromNote = midiToFretNote(midiAt(fromPosition, ctx.tuning), ctx.accidentalPref);
  const expected = midiToFretNote(midiAt(expectedPosition, ctx.tuning), ctx.accidentalPref);
  return {
    itemId: item.id,
    kind,
    from,
    offset,
    semitones,
    question: d3Question(kind, from, offset),
    expectedPc: expected.pc,
    choices: d3Choices(kind, fromChroma, ctx.scopeLevel, ctx.accidentalPref),
    fromPosition,
    expectedPosition,
    fromMidi: fromNote.midi,
    fromName: fromNote.name,
    expectedName: expected.name,
    pref: ctx.accidentalPref,
  };
}

function sameChroma(a: string, b: string): boolean {
  try {
    return chromaOf(a) === chromaOf(b);
  } catch {
    return false;
  }
}

export function d3Check(prompt: D3Prompt, answer: D3Answer): DrillCheck {
  const correct = sameChroma(answer, prompt.expectedPc);
  return correct
    ? { correct, expected: prompt.expectedPc }
    : { correct, expected: prompt.expectedPc, confusedWith: answer };
}

/**
 * Where a wrong answer sits on the drawn string: the nearest fret to the
 * starting note in the step's direction, so the neck shows the miscount.
 */
export function d3GivenPosition(prompt: D3Prompt, answer: string): Position | null {
  let chroma: number;
  try {
    chroma = chromaOf(answer);
  } catch {
    return null;
  }
  const from = prompt.fromPosition.fret;
  const fromChroma = chromaOf(prompt.from);
  const up = mod(chroma - fromChroma, 12);
  const candidates = [from + up, from + up - 12].filter((f) => f >= 0 && f <= 15);
  // Prefer the candidate on the same side as the expected answer.
  const side = Math.sign(prompt.semitones);
  const best =
    candidates.find((f) => Math.sign(f - from) === side) ??
    candidates.sort((a, b) => Math.abs(a - from) - Math.abs(b - from))[0];
  return best === undefined ? null : { string: D3_STRING, fret: best };
}

export function d3Sounds(prompt: D3Prompt, fb: DrillFeedback<D3Answer>): DrillSounds {
  // The start, then the answer: the step is heard as well as seen (research/02 rule 10).
  const expected = [prompt.fromName, prompt.expectedName];
  if (fb.result.correct) return { expected };
  const pos = d3GivenPosition(prompt, fb.answer);
  if (!pos) return { expected };
  const midi = prompt.fromMidi + pos.fret - prompt.fromPosition.fret;
  const given = midiToFretNote(midi, prompt.pref);
  return { expected, given: [given.name] };
}

export function d3FeedbackPositions(
  prompt: D3Prompt,
  fb: DrillFeedback<D3Answer>,
): { expected: Position[]; given: Position[] } {
  const expected = [prompt.expectedPosition];
  if (fb.result.correct) return { expected, given: [] };
  const given = d3GivenPosition(prompt, fb.answer);
  return { expected, given: given ? [given] : [] };
}

export function d3ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const parsed = parse(item);
  if (!parsed) return null;
  const semitones = semitonesOf(parsed.kind, parsed.from, parsed.offset);
  return chromaToPc(chromaOf(parsed.from) + semitones, ctx.accidentalPref);
}

/**
 * Hardware-keyboard answers (design §7): A–G pick a natural, Shift+letter its
 * sharp (or flat with the flat preference), 1–9 pick a button by position.
 */
export function d3KeyToAnswer(
  key: string,
  shiftKey: boolean,
  choices: readonly string[],
  pref: AccidentalPref,
): string | null {
  if (/^[1-9]$/.test(key)) return choices[Number(key) - 1] ?? null;
  const letter = key.toUpperCase();
  if (!/^[A-G]$/.test(letter)) return null;
  if (!shiftKey) return choices.includes(letter) ? letter : null;
  const pc = chromaToPc(chromaOf(letter) + (pref === 'sharp' ? 1 : -1), pref);
  // E♯, B♯, F♭ and C♭ are spelled as naturals: no Shift shortcut for those.
  if (isNatural(pc)) return null;
  return choices.includes(pc) ? pc : null;
}
