import type { Item } from '../../engine/model';
import {
  NATURAL_PCS,
  chromaOf,
  chromaToPc,
  isNatural,
  midiAt,
  midiToFretNote,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { d3Parse as parse, d3SemitonesOf as semitonesOf, type D3Kind } from './meta';

export { D3_ID, D3_SCOPE, d3CanTest, d3ConceptOf, type D3Kind } from './meta';

/**
 * D3 "Note-wheel steps" (design §6): "a whole step above E?". Tests the F1
 * items: `letter:±n@X` (the musical alphabet) and `step:±n@X` (half and whole
 * steps). Answers are spelled with the accidental preference, so a half step
 * above E is F (never E♯) and a whole step below F is D♯ or E♭. The learner
 * answers with a button, a key, or by tapping the note anywhere on the neck.
 */

export interface D3Prompt {
  itemId: string;
  kind: D3Kind;
  /** The starting note, spelled with the preference. */
  from: string;
  /** Signed: letters for `letter`, semitones for `step`. */
  offset: number;
  /** Signed semitones from `from` to the answer. */
  semitones: number;
  /** Display text, with ♯/♭ (`A half step above F♯?`). */
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

/** A tapped cell on the neck, named with the accidental preference. */
export interface D3Tap {
  position: Position;
  pc: string;
  /** Scientific pitch name, e.g. `G3`, so feedback plays the tapped note. */
  name: string;
}

/** The answer: a pitch class from a button or key, or a tapped cell. */
export type D3Answer = string | D3Tap;

export function d3AnswerPc(answer: D3Answer): string {
  return typeof answer === 'string' ? answer : answer.pc;
}

export function d3TapAnswer(position: Position, tuning: Tuning, pref: AccidentalPref): D3Tap {
  const note = midiToFretNote(midiAt(position, tuning), pref);
  return { position, pc: note.pc, name: note.name };
}

/** Stored as `answerGiven`: the pitch class, plus the cell for a tap (`G@s3f0`). */
export function d3DescribeAnswer(answer: D3Answer): string {
  if (typeof answer === 'string') return answer;
  return `${answer.pc}@s${answer.position.string}f${answer.position.fret}`;
}

/** Half-width of the level-0 window, in semitones. */
export const D3_WINDOW = 3;

/** The string the step is drawn on: the low E string, where F2 starts. */
export const D3_STRING = 6;

/** Every fret D3 can draw: feedback positions stay within this by default. */
const FULL_NECK: FretRange = { from: 0, to: 15 };

const mod = (n: number, m: number) => ((n % m) + m) % m;

function stepName(semitones: number): string {
  const size = Math.abs(semitones);
  if (size === 1) return 'A half step';
  if (size === 2) return 'A whole step';
  return `${size} half steps`;
}

export function d3Question(kind: D3Kind, ascii: string, offset: number): string {
  const from = displayPc(ascii);
  if (kind === 'step') return `${stepName(offset)} ${offset > 0 ? 'above' : 'below'} ${from}?`;
  // "Note", not "letter": learners read "letter" as jargon. "In the musical
  // alphabet" keeps it apart from half steps (the note after C is not C♯).
  const size = Math.abs(offset);
  const which = offset > 0 ? 'after' : 'before';
  const notes = size === 1 ? 'The note' : `${size} notes`;
  return `${notes} ${which} ${from} in the musical alphabet?`;
}

/** The worked-example line for the first, guided rep of a new item. */
export function d3WorkedExample(prompt: D3Prompt): string {
  return `${prompt.question.slice(0, -1)} is ${displayPc(prompt.expectedPc)}.`;
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

function parses(pc: string): boolean {
  try {
    chromaOf(pc);
    return true;
  } catch {
    return false;
  }
}

function sameChroma(a: string, b: string): boolean {
  try {
    return chromaOf(a) === chromaOf(b);
  } catch {
    return false;
  }
}

/**
 * `expected` is what the feedback bar prints (`That was F♯.`); the confusion
 * matrix keeps the ASCII pitch class as its concept.
 */
export function d3Check(prompt: D3Prompt, answer: D3Answer): DrillCheck {
  const pc = d3AnswerPc(answer);
  // A musical-alphabet answer is a natural: never its enharmonic sharp or flat.
  const correct = sameChroma(pc, prompt.expectedPc) && (prompt.kind !== 'letter' || isNatural(pc));
  const expected = displayPc(prompt.expectedPc);
  const concept = prompt.expectedPc;
  return correct
    ? { correct, expected, concept }
    : { correct, expected, concept, confusedWith: pc };
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const ALPHABET_RULE = 'The musical alphabet runs A B C D E F G, then A again.';

/** The two natural pairs a half step apart: no sharp between them (topic F1). */
export const HALF_STEP_PAIRS: readonly (readonly [string, string])[] = [
  ['B', 'C'],
  ['E', 'F'],
];

/** `from` to `to` in semitones, signed the short way round; a tritone follows `toward`. */
function signedSemitones(from: string, to: string, toward: number): number {
  const up = mod(chromaOf(to) - chromaOf(from), 12);
  return up > 6 || (up === 6 && toward < 0) ? up - 12 : up;
}

/** The notes from the start to `semitones` away, one per fret, as displayed. */
function stepWalk(prompt: D3Prompt, semitones: number): string[] {
  const dir = Math.sign(semitones);
  return Array.from({ length: Math.abs(semitones) + 1 }, (_, i) =>
    displayPc(midiToFretNote(prompt.fromMidi + i * dir, prompt.pref).pc),
  );
}

/** The B–C or E–F pair a walk of `semitones` from the start steps across, if any. */
function crossedPair(prompt: D3Prompt, semitones: number): readonly [string, string] | null {
  const from = chromaOf(prompt.from);
  const dir = Math.sign(semitones);
  for (let i = 0; i < Math.abs(semitones); i++) {
    // The lower chroma of this half step: a pair is crossed when it is the pair's lower note.
    const lo = mod(from + i * dir + Math.min(dir, 0), 12);
    const pair = HALF_STEP_PAIRS.find(([a]) => chromaOf(a) === lo);
    if (pair) return pair;
  }
  return null;
}

function stepPhrase(semitones: number): string {
  return `${stepName(semitones).replace(/^A /, 'a ')} ${semitones > 0 ? 'above' : 'below'}`;
}

function lettersPhrase(steps: number): string {
  const size = Math.abs(steps);
  const which = steps > 0 ? 'after' : 'before';
  return size === 1 ? `the note ${which}` : `${size} notes ${which}`;
}

/** The letters from the start, `offset` steps along the alphabet, inclusive. */
function letterWalk(from: string, offset: number): string[] {
  const start = LETTERS.indexOf(from);
  const dir = Math.sign(offset);
  return Array.from(
    { length: Math.abs(offset) + 1 },
    (_, i) => LETTERS[mod(start + i * dir, 7)] as string,
  );
}

function d3LetterExplain(prompt: D3Prompt, fb: DrillFeedback<D3Answer>): string {
  const { from, offset } = prompt;
  const walk = letterWalk(from, offset);
  const counted =
    Math.abs(offset) === 1
      ? `${offset > 0 ? 'After' : 'Before'} ${from} comes ${walk[1]}.`
      : `${lettersPhrase(offset)} ${from}: ${walk.join(' ')}.`;
  if (fb.result.correct) return counted;
  const pc = d3AnswerPc(fb.answer);
  const said = parses(pc) ? [letterMiss(pc, from)] : [];
  return [...said, ALPHABET_RULE, counted].join(' ');
}

/** What a wrong musical-alphabet answer is, counted from the start. */
function letterMiss(pc: string, from: string): string {
  if (!isNatural(pc)) {
    return `You said ${displayPc(pc)}: sharps and flats sit between the letters, not in the musical alphabet.`;
  }
  const steps = mod(LETTERS.indexOf(pc) - LETTERS.indexOf(from) + 3, 7) - 3;
  return steps === 0
    ? `You said ${pc}, the note you started on.`
    : `You said ${pc}, ${lettersPhrase(steps)} ${from}.`;
}

function d3StepExplain(prompt: D3Prompt, fb: DrillFeedback<D3Answer>): string {
  const { semitones } = prompt;
  const size = Math.abs(semitones);
  const walk = stepWalk(prompt, semitones);
  const from = displayPc(prompt.from);
  const expected = displayPc(prompt.expectedPc);
  const span = size === 1 ? 'one fret' : size === 2 ? 'two frets' : `${size} frets`;
  const accidental = prompt.pref === 'flat' ? 'flat' : 'sharp';
  if (fb.result.correct) {
    const gap =
      size === 1 && crossedPair(prompt, semitones) ? `: no ${accidental} between them` : '';
    return `${from} to ${expected} is ${span} on one string${gap}.`;
  }
  const pc = d3AnswerPc(fb.answer);
  const parts: string[] = [];
  let pair = crossedPair(prompt, semitones);
  if (parses(pc)) {
    const given = signedSemitones(prompt.from, pc, semitones);
    parts.push(
      given === 0
        ? `You said ${from}, the note you started on.`
        : `You said ${displayPc(pc)}, ${stepPhrase(given)} ${from}.`,
    );
    if (given !== 0) pair ??= crossedPair(prompt, given);
  }
  if (pair) {
    const [lo, hi] = pair;
    const half =
      semitones > 0 ? `a half step above ${lo} is ${hi}` : `a half step below ${hi} is ${lo}`;
    parts.push(`There's no ${accidental} between ${lo} and ${hi}: ${half}.`);
  }
  const step =
    size === 1 ? 'A half step is' : size === 2 ? 'A whole step is' : `${size} half steps are`;
  parts.push(`${step} ${span}: ${walk.join(' ')}.`);
  return parts.join(' ');
}

/**
 * The line under the prompt once answered (design §6 D3). A miss names what
 * the chosen note actually is from the start, then the F1 rule it broke: the
 * alphabet wraps from G to A, and B–C and E–F have no sharp between them. A
 * correct answer gets one short confirming line.
 */
export function d3Explain(prompt: D3Prompt, fb: DrillFeedback<D3Answer>): string {
  return prompt.kind === 'letter' ? d3LetterExplain(prompt, fb) : d3StepExplain(prompt, fb);
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
  if (typeof fb.answer !== 'string') return { expected, given: [fb.answer.name] };
  const pos = d3GivenPosition(prompt, fb.answer);
  if (!pos) return { expected };
  const midi = prompt.fromMidi + pos.fret - prompt.fromPosition.fret;
  const given = midiToFretNote(midi, prompt.pref);
  return { expected, given: [given.name] };
}

/** The answer's fret on `string` nearest `fret`, within `range`. */
function nearestAnswer(
  prompt: D3Prompt,
  { string, fret }: Position,
  tuning: Tuning,
  range: FretRange,
): Position | null {
  const open = midiAt({ string, fret: 0 }, tuning);
  const chroma = chromaOf(prompt.expectedPc);
  let best: Position | null = null;
  for (let f = range.from; f <= range.to; f++) {
    if (mod(open + f - chroma, 12) !== 0) continue;
    if (!best || Math.abs(f - fret) < Math.abs(best.fret - fret)) best = { string, fret: f };
  }
  return best;
}

/**
 * The step stays drawn on the low E string. A tap also marks the answer on
 * the tapped string, nearest the tap, so a miss is seen where it was made.
 */
export function d3FeedbackPositions(
  prompt: D3Prompt,
  fb: DrillFeedback<D3Answer>,
  tuning: Tuning,
  range: FretRange = FULL_NECK,
): { expected: Position[]; given: Position[] } {
  const expected = [prompt.expectedPosition];
  const { answer } = fb;
  if (typeof answer !== 'string') {
    const near = nearestAnswer(prompt, answer.position, tuning, range);
    const same = (p: Position) =>
      p.string === prompt.expectedPosition.string && p.fret === prompt.expectedPosition.fret;
    if (near && !same(near)) expected.push(near);
    return { expected, given: fb.result.correct ? [] : [answer.position] };
  }
  if (fb.result.correct) return { expected, given: [] };
  const given = d3GivenPosition(prompt, answer);
  return { expected, given: given ? [given] : [] };
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
