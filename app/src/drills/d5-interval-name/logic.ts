import { parseIntervalItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  SHAPE_INTERVALS,
  crossesGBShift,
  intervalInfo,
  isIntervalName,
  midiAt,
  midiToFretNote,
  openStringMidi,
  positionForInterval,
  type AccidentalPref,
  type IntervalName,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D5 "Name the interval from two dots" (design §6 D5). Tests the C3
 * `interval-name:M3@s6→s5` items: a root on one string and a note on another
 * make a shape, and the learner names its interval with a button. The root
 * fret is drawn at random, so each shape is met in many keys and neck
 * positions (research/02 rule 12). Answering plays both notes, low then high,
 * so the interval is heard as well as seen and named (rule 10).
 */

export const D5_ID = 'interval-name';

export interface D5Prompt {
  itemId: string;
  interval: IntervalName;
  semitones: number;
  /** The lower note: the shape's root. */
  root: Position;
  /** The upper note, on the item's second string. */
  upper: Position;
  rootPc: string;
  rootMidi: number;
  rootName: string;
  upperName: string;
  /** True when the shape crosses the G–B pair (one fret off the all-fourths shape). */
  gbShift: boolean;
  /** Answer buttons, in ascending interval order. */
  choices: IntervalName[];
  pref: AccidentalPref;
}

/** The answer: an interval name from a button or key. */
export type D5Answer = IntervalName;

/**
 * Scope levels (research/02 rule 5, distractors): the answer among its nearest
 * neighbours by size, which are the easiest to confuse (a fret apart, rule 6),
 * then a wider window, then every interval from m2 to P8.
 */
export const D5_SCOPE = { minLevel: 0, maxLevel: 2 };

/** Answer buttons per scope level. */
export const D5_CHOICE_COUNTS: readonly number[] = [4, 7, SHAPE_INTERVALS.length];

/** Both dots sit on frets 1–12: fretted, and inside every size class's neck window. */
export const D5_FRETS = { from: 1, to: 12 };

export function d5CanTest(item: Item): boolean {
  return parseIntervalItemId(item.id)?.kind === 'interval-name';
}

function parse(item: Item): { interval: IntervalName; from: number; to: number } {
  const ref = parseIntervalItemId(item.id);
  if (ref?.kind !== 'interval-name') throw new Error(`D5 cannot test item ${item.id}`);
  return ref;
}

/** A uniform pick of `0 … n-1`, safe against an rng that returns 1. */
function pick(n: number, rng: () => number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

/**
 * `count` consecutive intervals (by size) that contain the answer. Where the
 * window starts is random, so the answer's button position is no cue.
 */
export function d5Choices(
  interval: IntervalName,
  scopeLevel: number,
  rng: () => number,
): IntervalName[] {
  const level = Math.max(D5_SCOPE.minLevel, Math.min(D5_SCOPE.maxLevel, scopeLevel));
  const count = D5_CHOICE_COUNTS[level] as number;
  const all = SHAPE_INTERVALS;
  if (count >= all.length) return [...all];
  const at = all.indexOf(interval);
  const first = Math.max(0, at - count + 1);
  const last = Math.min(at, all.length - count);
  const start = first + pick(last - first + 1, rng);
  return all.slice(start, start + count);
}

/** A root fret that keeps both dots on `D5_FRETS`, or null if the shape cannot fit. */
function rootFret(offset: number, rng: () => number): number | null {
  const from = Math.max(D5_FRETS.from, D5_FRETS.from - offset);
  const to = Math.min(D5_FRETS.to, D5_FRETS.to - offset);
  if (from > to) return null;
  return from + pick(to - from + 1, rng);
}

export function d5MakePrompt(item: Item, ctx: DrillContext): D5Prompt {
  const { interval, from, to } = parse(item);
  const semitones = intervalInfo(interval).semitones;
  const offset = semitones - (openStringMidi(to, ctx.tuning) - openStringMidi(from, ctx.tuning));
  const fret = rootFret(offset, ctx.rng);
  if (fret === null) throw new Error(`D5 cannot fit ${item.id} on frets 1–12`);
  const root = { string: from, fret };
  const upper = positionForInterval(root, interval, to, { tuning: ctx.tuning }) as Position;
  const rootNote = midiToFretNote(midiAt(root, ctx.tuning), ctx.accidentalPref);
  const upperNote = midiToFretNote(midiAt(upper, ctx.tuning), ctx.accidentalPref);
  return {
    itemId: item.id,
    interval,
    semitones,
    root,
    upper,
    rootPc: rootNote.pc,
    rootMidi: rootNote.midi,
    rootName: rootNote.name,
    upperName: upperNote.name,
    gbShift: crossesGBShift(from, to, ctx.tuning),
    choices: d5Choices(interval, ctx.scopeLevel, ctx.rng),
    pref: ctx.accidentalPref,
  };
}

export function d5Check(prompt: D5Prompt, answer: D5Answer): DrillCheck {
  const correct = answer === prompt.interval;
  return correct
    ? { correct, expected: prompt.interval }
    : { correct, expected: prompt.interval, confusedWith: answer };
}

/** The worked-example line for the first, guided rep of a new item. */
export function d5WorkedExample(prompt: D5Prompt): string {
  const info = intervalInfo(prompt.interval);
  return `This is a ${info.long} (${info.name}), ${prompt.semitones} half steps up from ${prompt.rootPc}.`;
}

/** Where the chosen interval would sit on the upper note's string, or null off the neck. */
export function d5GivenPosition(
  prompt: D5Prompt,
  answer: D5Answer,
  tuning: Tuning,
): Position | null {
  if (!isIntervalName(answer)) return null;
  return positionForInterval(prompt.root, answer, prompt.upper.string, { tuning });
}

export function d5Sounds(prompt: D5Prompt, fb: DrillFeedback<D5Answer>): DrillSounds {
  // Root then upper note: the interval as a melodic step (research/02 rule 10).
  const expected = [prompt.rootName, prompt.upperName];
  if (fb.result.correct || !isIntervalName(fb.answer)) return { expected };
  // A wrong answer replays the root, then the chosen interval, so the two are compared.
  const given = midiToFretNote(prompt.rootMidi + intervalInfo(fb.answer).semitones, prompt.pref);
  return { expected, given: [prompt.rootName, given.name] };
}

export function d5FeedbackPositions(
  prompt: D5Prompt,
  fb: DrillFeedback<D5Answer>,
  tuning: Tuning,
): { expected: Position[]; given: Position[] } {
  const expected = [prompt.upper];
  if (fb.result.correct) return { expected, given: [] };
  const given = d5GivenPosition(prompt, fb.answer, tuning);
  return { expected, given: given ? [given] : [] };
}

export function d5ConceptOf(item: Item): string | null {
  return d5CanTest(item) ? parse(item).interval : null;
}

/** Stored as `answerGiven`. */
export function d5DescribeAnswer(answer: D5Answer): string {
  return answer;
}

/** Keys for the buttons by position: 1–9, then 0, - and = (a hardware keyboard row). */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export function d5KeyFor(index: number): string | undefined {
  return KEYS[index];
}

/** Hardware-keyboard answers (design §7): the number row picks a button by position. */
export function d5KeyToAnswer(key: string, choices: readonly IntervalName[]): IntervalName | null {
  const i = KEYS.indexOf(key);
  return i < 0 ? null : (choices[i] ?? null);
}

export interface D5LegendRow {
  name: IntervalName;
  long: string;
  /** Half steps from the lower note; shown from guide level 2. */
  semitones?: number;
}

/**
 * The context panel's interval legend (design §7), faded with the guide
 * level (rule 9): level 3 adds half-step counts and tips for reading a shape
 * across strings, level 2 keeps the counts, and level 1 only decodes the
 * names. At level 0 the session hides the panel altogether.
 */
export function d5LegendRows(choices: readonly IntervalName[], level: GuideLevel): D5LegendRow[] {
  if (level <= 0) return [];
  return choices.map((name) => {
    const info = intervalInfo(name);
    return level >= 2
      ? { name, long: info.long, semitones: info.semitones }
      : { name, long: info.long };
  });
}

export function d5LegendTips(level: GuideLevel): string[] {
  if (level < 3) return [];
  return [
    'Count half steps up from the square (the lower note) to the round dot.',
    'One string up is 5 half steps, but only 4 from G to B: shapes that cross G–B move up a fret.',
  ];
}
