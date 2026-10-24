import type { GuideLevel } from '../../engine/model';
import { eventLength, fracToNumber, parseRhythm, parseTimeSignature } from '../../theory';
import { endingBars, repeatStartFor } from './forms';
import {
  barPulses,
  firstWrongTap,
  misreadShape,
  pickupStart,
  pulseWord,
  type FormReadingAnswer,
  type FormReadingPrompt,
  type SheetBar,
} from './logic';

/**
 * The form-reading drill's words: the question, the fact and why, why a
 * wrong answer is wrong, accessible names and the context panel's rules.
 * Only the view and the panel use them, so they load with the views, not in
 * first-load JS (design §10).
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `1 2 3 2 3 4`: bar numbers in play order. */
export function orderText(prompt: Pick<FormReadingPrompt, 'order' | 'bars'>): string {
  return prompt.order.map((i) => prompt.bars[i]?.number ?? 'pickup').join(' ');
}

/** `count 1 2 3, then play`: what to count before a pickup starting on `start`. */
export function countIn(start: number): string {
  return `count ${Array.from({ length: start - 1 }, (_, i) => i + 1).join(' ')}, then play`;
}

/** The question. A worked example names the answer to tap (rule 8). */
export function formReadingTask(prompt: FormReadingPrompt, guided: boolean): string {
  switch (prompt.task) {
    case 'bar':
      return guided
        ? `The first bar is a pickup, so bar 1 is the next one. Tap bar ${prompt.target} to continue.`
        : `Tap bar ${prompt.target}.`;
    case 'start': {
      const q = `On which ${pulseWord(prompt.meter)} of the bar does the pickup start?`;
      return guided ? `${q} Tap ${prompt.answer[0]} to continue.` : q;
    }
    case 'next': {
      const ask = prompt.ask ?? { bar: 0, time: 1 };
      const when = ask.time === 2 ? 'The second time through, after' : 'After';
      const q = `${when} bar ${ask.bar + 1}, which bar do you play?`;
      return guided ? `${q} Tap ${(prompt.answer[0] ?? 0) + 1} to continue.` : q;
    }
    case 'order':
      return guided
        ? `Tap the bars in the order you play them, ${orderText(prompt)}, to continue.`
        : 'Tap the bars in the order you play them.';
  }
}

/** `1 beat of 4`, `1 eighth of 6`. */
function pickupPhrase(prompt: FormReadingPrompt): string {
  return `${plural(prompt.pickup, pulseWord(prompt.meter))} of ${barPulses(prompt.meter)}`;
}

/** How each turn of a road map works, from its signs. */
export function roadMapRules(bars: readonly SheetBar[]): string[] {
  const rules: string[] = [];
  bars.forEach((b, i) => {
    if (!b.repeatEnd) return;
    const start = repeatStartFor(bars, i);
    const where =
      b.ending === 1
        ? `The end repeat in the 1st ending (bar ${i + 1})`
        : `The end repeat at bar ${i + 1}`;
    rules.push(
      start === null
        ? `${where} has no begin repeat before it, so it goes back to the start.`
        : `${where} sends you back to the begin repeat at bar ${start + 1}.`,
    );
  });
  const second = endingBars(bars, 2);
  if (second.length > 0) {
    rules.push(
      `The second time through, skip the 1st ending and play the 2nd, from bar ${(second[0] ?? 0) + 1}.`,
    );
  }
  return rules;
}

/**
 * The fact and why: the worked example on a new item's first rep (rule 8),
 * and the answer's name in feedback (rule 10).
 */
export function formReadingFact(prompt: FormReadingPrompt): string[] {
  if (prompt.shape) return [`Play ${orderText(prompt)}.`, ...roadMapRules(prompt.bars)];
  const facts = [
    `The first bar holds ${pickupPhrase(prompt)}: it's a pickup. Bar 1 is the first full bar, and the pickup leads into its downbeat.`,
  ];
  const start = pickupStart(prompt.meter, prompt.pickup);
  if (prompt.task === 'start') {
    facts.push(
      `A pickup fills the end of a bar, so it starts on ${pulseWord(prompt.meter)} ${start}: ${countIn(start)}.`,
    );
  }
  return facts;
}

/** Why a turn to `chose` after the play order's step `step - 1` is wrong. */
function explainTurn(prompt: FormReadingPrompt, step: number, chose: number): string {
  const right = prompt.order[step] ?? 0;
  if (step === 0) return 'The tune starts at bar 1.';
  const from = prompt.order[step - 1] ?? 0;
  const secondTime = prompt.order.slice(0, step - 1).includes(from);
  if (misreadShape(prompt, chose, right)) {
    return `Bar 1 would be right with no begin repeat, but there's one at bar ${right + 1}.`;
  }
  if (prompt.bars[chose]?.ending === 1 && secondTime) {
    return `Bar ${chose + 1} is the 1st ending: the second time through, skip it.`;
  }
  if (chose === from + 1 && prompt.bars[from]?.repeatEnd) {
    return `Bar ${chose + 1} is straight on, but the end repeat sends you back first.`;
  }
  // Back past the begin repeat this end repeat closes (|: 1 2 :||: 3 4 :|,
  // bar 4 back to bar 1): it goes back no further than that sign.
  if (prompt.bars[from]?.repeatEnd && prompt.bars[right]?.repeatStart && chose < right) {
    return `This end repeat goes back to the begin repeat at bar ${right + 1}, not past it.`;
  }
  if (prompt.bars[chose]?.ending === 2 && !secondTime) {
    return `Bar ${chose + 1} is the 2nd ending: play the 1st ending the first time.`;
  }
  return `From bar ${from + 1}, the road map goes to bar ${right + 1}.`;
}

/** Why a wrong answer is wrong; null for a right one. */
export function formReadingExplain(
  prompt: FormReadingPrompt,
  answer: FormReadingAnswer,
): string | null {
  switch (prompt.task) {
    case 'bar': {
      const tapped = answer[0] ?? 0;
      if (tapped === prompt.target) return null;
      if (tapped === 0)
        return `That's the pickup: it holds only ${pickupPhrase(prompt)}, so it isn't counted.`;
      if (tapped === (prompt.target ?? 0) - 1) {
        return `That's bar ${tapped}: counting the pickup as bar 1 puts you a bar early.`;
      }
      return `That's bar ${tapped}.`;
    }
    case 'start': {
      const chose = answer[0] ?? 0;
      if (chose === prompt.answer[0]) return null;
      if (chose === 1) return 'Beat 1 is the downbeat of bar 1, which the pickup leads into.';
      const beats = barPulses(prompt.meter) - chose + 1;
      return `A pickup starting on ${pulseWord(prompt.meter)} ${chose} would hold ${plural(beats, pulseWord(prompt.meter))}.`;
    }
    case 'next': {
      const chose = answer[0] ?? 0;
      if (chose === prompt.answer[0]) return null;
      const ask = prompt.ask ?? { bar: 0, time: 1 };
      // The step after the asked play of the bar.
      let seen = 0;
      const step = prompt.order.findIndex((b) => b === ask.bar && ++seen === ask.time) + 1;
      return explainTurn(prompt, step, chose);
    }
    case 'order': {
      const at = firstWrongTap(prompt, answer);
      if (at < 0) return answer.length < prompt.answer.length ? 'The tune goes on.' : null;
      return explainTurn(prompt, at, answer[at] ?? 0);
    }
  }
}

const VALUE_NAMES: Record<number, string> = {
  1: 'whole',
  2: 'half',
  4: 'quarter',
  8: 'eighth',
  16: 'sixteenth',
};

/** A bar's notes in words: `quarter, eighth, eighth, half`. */
export function rhythmWords(rhythm: string): string {
  return parseRhythm(rhythm)
    .map((e) => `${e.dots ? 'dotted ' : ''}${VALUE_NAMES[e.value] ?? e.value}`)
    .join(', ');
}

/** How many of the bottom number's note a bar's rhythm lasts. */
export function barCount(rhythm: string, meter: string): number {
  const bottom = parseTimeSignature(meter).bottom;
  return parseRhythm(rhythm).reduce((sum, e) => sum + fracToNumber(eventLength(e)) * bottom, 0);
}

/** A bar's count under it, at guide level 3: `1 beat`, `5 eighths`. */
export function countText(rhythm: string, meter: string): string {
  return plural(barCount(rhythm, meter), pulseWord(meter));
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/** The signs on a bar, in words: `begin repeat, 1st ending, end repeat`. */
function markWords(bar: SheetBar, last: boolean): string[] {
  const words: string[] = [];
  if (bar.repeatStart) words.push('begin repeat');
  if (bar.ending) words.push(`${ORDINALS[bar.ending - 1]} ending`);
  if (bar.repeatEnd) words.push('end repeat');
  else if (last) words.push('final barline');
  return words;
}

/**
 * A bar's accessible name. While a pickup card asks which bar is which, the
 * bars are named by place and notes ("2nd bar on the page: quarter,
 * quarter, half"), as a sighted learner sees them; once numbered, by number.
 */
export function barLabel(prompt: FormReadingPrompt, index: number, numbered: boolean): string {
  const bar = prompt.bars[index];
  if (!bar) return '';
  const last = index === prompt.bars.length - 1;
  const name = !numbered
    ? `${ORDINALS[index] ?? index + 1} bar on the page`
    : bar.number === null
      ? 'Pickup'
      : `Bar ${bar.number}`;
  const parts = [name, ...markWords(bar, last)];
  return prompt.shape ? parts.join(', ') : `${parts.join(', ')}: ${rhythmWords(bar.rhythm)}`;
}

/** A button's accessible name on a `start` or `next` card. */
export function choiceLabel(prompt: FormReadingPrompt, value: number): string {
  return prompt.task === 'start'
    ? `${pulseWord(prompt.meter) === 'eighth' ? 'Eighth' : 'Beat'} ${value}`
    : `Bar ${value + 1}`;
}

/** What the context panel shows (rule 9: faded within and across sessions). */
export interface FormReadingGuides {
  rules: string[];
  /** Level 2+: the signs drawn and named. */
  legend: boolean;
  /** Level 3: each bar's count under it on a pickup card. */
  counts: boolean;
}

export const PICKUP_RULES = [
  "A pickup is the short bar before bar 1. It isn't counted: bar 1 is the first full bar.",
  // General, never a worked number: a number here could be a card's answer (rule 4).
  'A pickup fills the end of a bar: it starts as many beats before the barline as it holds. Count the beats before it, then play.',
];

export const REPEAT_RULES = [
  'An end repeat sends you back to the begin repeat, to play that stretch again.',
  'With no begin repeat before it, go back to the start.',
  'Each repeat is played twice, then you carry on.',
];

export const ENDING_RULES = [
  'An end repeat sends you back to the begin repeat, or to the start if there is none.',
  'The first time, play the 1st ending. The second time, skip it and play the 2nd.',
];

export function formReadingGuides(
  prompt: FormReadingPrompt,
  guideLevel: GuideLevel,
): FormReadingGuides {
  if (guideLevel <= 0) return { rules: [], legend: false, counts: false };
  const endings = prompt.bars.some((b) => b.ending);
  const rules = !prompt.shape ? PICKUP_RULES : endings ? ENDING_RULES : REPEAT_RULES;
  return {
    rules,
    legend: guideLevel >= 2 && Boolean(prompt.shape),
    counts: guideLevel >= 3 && !prompt.shape,
  };
}
