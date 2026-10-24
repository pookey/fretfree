import type { FormShape } from '../../engine/items/form';
import type { Item } from '../../engine/model';
import { parseTimeSignature } from '../../theory';
import type { DrillCheck, DrillContext, DrillSounds } from '../types';
import { FORMS, nextBar, playOrder, type FormMarks } from './forms';
import {
  FORM_READING_SCOPE,
  formReadingConcept as concept,
  formReadingParse as parse,
} from './meta';
import { T6_COMPOUND_PICKUPS, T6_SIMPLE_PICKUPS } from '../../engine/skills/t6';
import { ROAD_MAP_METERS, pickupTune, roadMapTune, type TuneBar } from './tunes';

export {
  FORM_READING_ID,
  FORM_READING_SCOPE,
  formReadingCanTest,
  formReadingConceptOf,
} from './meta';

/**
 * The form-reading drill (T6; design §6, §12): a short tune on a rhythm
 * staff, its repeat signs and ending brackets drawn as notation draws them.
 *
 * - `pickup:…:bar` (tap): the tune opens with a pickup; tap bar 1, 2 or 3,
 *   counted from the first full bar. Tapping one bar early is counting the
 *   pickup.
 * - `pickup:…:start` (choice): which beat of the bar the pickup starts on,
 *   so it can be counted in: a 1-beat pickup in 4/4 starts on beat 4.
 * - `form:…:next` (choice): which bar follows the one asked about, at the
 *   road map's turn: back to a begin repeat, to the start, or on to the
 *   2nd ending.
 * - `form:…:order` (tap): every bar in the order it is played. The first
 *   wrong tap ends the card, so the feedback is about that turn (Duke et al.
 *   2009: find the exact error).
 *
 * Bars are indexed from 0 across the page. A road map has no pickup, so bar
 * `i` is bar `i + 1`; in a pickup tune bar `i` is bar `i` and the pickup is
 * index 0. The words are in `text.ts`, which only the lazy view loads.
 */

export type FormReadingTask = 'bar' | 'start' | 'next' | 'order';

export interface SheetBar extends TuneBar, FormMarks {
  /** The bar's number, or null for the pickup. */
  number: number | null;
}

export interface FormReadingPrompt {
  itemId: string;
  task: FormReadingTask;
  meter: string;
  bars: SheetBar[];
  /** The bars in the order they are played (indices). */
  order: number[];
  /** The pickup, in the bottom number's note; 0 for a road map. */
  pickup: number;
  /** The road map, for `next` and `order`. */
  shape?: FormShape;
  /** `bar`: the bar number to tap. */
  target?: number;
  /** `next`: the bar asked about (an index), and which time through it. */
  ask?: { bar: number; time: 1 | 2 };
  /** `start` and `next`: the buttons' values in order, beats or bar indices. */
  choices: number[];
  /** One bar index (`bar`, `next`), a beat (`start`), or every bar played (`order`). */
  answer: number[];
}

/**
 * Bar indices: the bar tapped (`bar`), the bar chosen (`next`), or the bars
 * tapped in turn, up to the first wrong one (`order`); or the beat chosen
 * (`start`).
 */
export type FormReadingAnswer = readonly number[];

/**
 * Road maps that, read without their begin repeat, are another road map:
 * going back to bar 1 from `repeat-inner` is reading `repeat-from-start`.
 */
const WITHOUT_BEGIN: Partial<Record<FormShape, FormShape>> = {
  'repeat-inner': 'repeat-from-start',
  'repeat-tail': 'repeat-from-start',
  'endings-inner': 'endings-from-start',
};

/** The pickups T6 has cards for, as `<meter>:<beats>`. */
const T6_PICKUPS: readonly string[] = [...T6_SIMPLE_PICKUPS, ...T6_COMPOUND_PICKUPS];

function level(scopeLevel: number): number {
  return Math.max(
    FORM_READING_SCOPE.minLevel,
    Math.min(FORM_READING_SCOPE.maxLevel, Math.round(scopeLevel)),
  );
}

function pickFrom<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)] ?? (list[0] as T);
}

/** How many of the bottom number's note a bar holds: 4 in 4/4, 6 in 6/8. */
export function barPulses(meter: string): number {
  return parseTimeSignature(meter).top;
}

/**
 * What a pickup is counted in: beats in simple time, eighths in 6/8, where
 * the felt beat is three of them.
 */
export function pulseWord(meter: string): 'beat' | 'eighth' {
  return parseTimeSignature(meter).bottom === 8 ? 'eighth' : 'beat';
}

/** The beat (or eighth) a pickup starts on: 4 for one beat of 4/4. */
export function pickupStart(meter: string, beats: number): number {
  return barPulses(meter) - beats + 1;
}

/**
 * A `next` card's buttons. At scope 0, the bars a reader turns to: the
 * start, each begin repeat, straight on, and each ending, with every bar
 * when that leaves fewer than three. At scope 1, every bar.
 */
export function nextChoices(
  bars: readonly FormMarks[],
  ask: { bar: number },
  answer: number,
  scopeLevel: number,
): number[] {
  const all = bars.map((_, i) => i);
  if (level(scopeLevel) >= 1) return all;
  const turns = new Set<number>([0, answer, ask.bar + 1]);
  bars.forEach((b, i) => {
    if (b.repeatStart) turns.add(i);
    if (b.ending && bars[i - 1]?.ending !== b.ending) turns.add(i);
  });
  const row = all.filter((i) => turns.has(i));
  return row.length >= 3 ? row : all;
}

function sheet(tune: readonly TuneBar[], marks: readonly FormMarks[], pickup: boolean): SheetBar[] {
  return tune.map((t, i) => ({
    ...t,
    ...marks[i],
    number: pickup ? (i === 0 ? null : i) : i + 1,
  }));
}

export function formReadingMakePrompt(item: Item, ctx: DrillContext): FormReadingPrompt {
  const ref = parse(item);
  if (!ref) throw new Error(`Form reading cannot test item ${item.id}`);
  if (ref.kind === 'pickup') {
    const tune = pickupTune(ref.meter, ref.beats, ctx.rng);
    const bars = sheet(tune, [], true);
    const base = {
      itemId: item.id,
      meter: ref.meter,
      bars,
      order: bars.map((_, i) => i),
      pickup: ref.beats,
    };
    if (ref.task === 'start') {
      return {
        ...base,
        task: 'start',
        choices: Array.from({ length: barPulses(ref.meter) }, (_, i) => i + 1),
        answer: [pickupStart(ref.meter, ref.beats)],
      };
    }
    const target = 1 + Math.floor(ctx.rng() * (level(ctx.scopeLevel) >= 1 ? 3 : 2));
    // Bar n is index n: the pickup is index 0.
    return { ...base, task: 'bar', target, choices: [], answer: [target] };
  }

  const layout = FORMS[ref.shape];
  const meter = pickFrom(ROAD_MAP_METERS, ctx.rng);
  const bars = sheet(roadMapTune(layout.bars, meter, ctx.rng), layout.bars, false);
  const order = playOrder(layout.bars);
  const base = { itemId: item.id, meter, bars, order, pickup: 0, shape: ref.shape };
  if (ref.task === 'order') return { ...base, task: 'order', choices: [], answer: order };
  const next = nextBar(order, layout.ask.bar, layout.ask.time);
  if (next === null) throw new Error(`${ref.shape} asks past its last bar`);
  return {
    ...base,
    task: 'next',
    ask: layout.ask,
    choices: nextChoices(layout.bars, layout.ask, next, ctx.scopeLevel),
    answer: [next],
  };
}

/** Where a tap sequence first leaves the right order, or -1 when it hasn't. */
export function firstWrongTap(prompt: FormReadingPrompt, taps: FormReadingAnswer): number {
  return taps.findIndex((t, i) => t !== prompt.answer[i]);
}

/**
 * The road map a wrong turn reads the card as: back to bar 1 where the
 * repeat starts later is reading it without its begin repeat.
 */
export function misreadShape(
  prompt: FormReadingPrompt,
  chose: number,
  right: number,
): FormShape | null {
  if (!prompt.shape || chose !== 0 || right === 0) return null;
  if (!prompt.bars[right]?.repeatStart) return null;
  return WITHOUT_BEGIN[prompt.shape] ?? null;
}

/** The right answer as the learner reads it. */
export function expectedText(prompt: FormReadingPrompt): string {
  switch (prompt.task) {
    case 'bar':
      return `Bar ${prompt.target}`;
    case 'start':
      return `${pulseWord(prompt.meter) === 'eighth' ? 'Eighth' : 'Beat'} ${prompt.answer[0]}`;
    case 'next':
      return `Bar ${(prompt.answer[0] ?? 0) + 1}`;
    case 'order':
      return prompt.answer.map((i) => i + 1).join(' ');
  }
}

function itemConcept(prompt: FormReadingPrompt): string {
  return prompt.shape
    ? concept({ kind: 'form', shape: prompt.shape, task: 'next' })
    : concept({ kind: 'pickup', meter: prompt.meter, beats: prompt.pickup, task: 'bar' });
}

export function formReadingCheck(prompt: FormReadingPrompt, answer: FormReadingAnswer): DrillCheck {
  const expected = expectedText(prompt);
  const key = itemConcept(prompt);
  const right =
    answer.length === prompt.answer.length && answer.every((a, i) => a === prompt.answer[i]);
  if (right) return { correct: true, expected, concept: key };

  let confusedWith: string | undefined;
  if (prompt.task === 'start') {
    // Starting on that beat is a pickup of another length: keyed only when
    // T6 has cards for it, so the session can seed that pair back.
    const beats = barPulses(prompt.meter) - (answer[0] ?? 0) + 1;
    if (T6_PICKUPS.includes(`${prompt.meter}:${beats}`)) {
      confusedWith = concept({ kind: 'pickup', meter: prompt.meter, beats, task: 'bar' });
    }
  } else if (prompt.task === 'next' || prompt.task === 'order') {
    const at = prompt.task === 'next' ? 0 : Math.max(0, firstWrongTap(prompt, answer));
    const misread = misreadShape(prompt, answer[at] ?? -1, prompt.answer[at] ?? -1);
    if (misread) confusedWith = concept({ kind: 'form', shape: misread, task: 'next' });
  }
  return { correct: false, expected, concept: key, ...(confusedWith ? { confusedWith } : {}) };
}

/** Stored as `answerGiven`: the values, space-separated (bar indices from 0, or a beat). */
export function formReadingDescribeAnswer(answer: FormReadingAnswer): string {
  return answer.join(' ');
}

/**
 * The response time to grade: per bar tapped for the play order, so its
 * speed targets mean what they mean for one answer (design §3.2).
 */
export function formReadingGradedResponseMs(
  prompt: FormReadingPrompt,
  _answer: FormReadingAnswer,
  elapsedMs: number,
): number {
  return prompt.task === 'order' ? elapsedMs / Math.max(1, prompt.answer.length) : elapsedMs;
}

/**
 * No notes for the session to pluck: the view plays the whole tune in the
 * order it is read when the learner asks (rule 10, `play.ts`).
 */
export function formReadingSounds(): DrillSounds {
  return { expected: [] };
}

// --- Keyboard ---------------------------------------------------------------

/**
 * Hardware-keyboard answers (design §7): a digit is a bar number on a road
 * map (`next` and `order`) or a beat on a `start` card. A pickup card's bars
 * carry no numbers, so they are answered with Tab and Return.
 */
export function formReadingKeys(prompt: FormReadingPrompt): Map<string, number> {
  switch (prompt.task) {
    case 'start':
      return new Map(prompt.choices.map((c) => [String(c), c]));
    case 'next':
      return new Map(prompt.choices.map((c) => [String(c + 1), c]));
    case 'order':
      return new Map(prompt.bars.map((_, i) => [String(i + 1), i]));
    case 'bar':
      return new Map();
  }
}
