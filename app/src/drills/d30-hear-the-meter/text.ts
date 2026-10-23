import type { EarMeter } from '../../engine/items/meter-ear';
import type { GuideLevel } from '../../engine/model';
import {
  countSyllables,
  describeMeter,
  feltBeats,
  parseRhythm,
  parseTimeSignature,
  type TimeSignature,
} from '../../theory';
import { D30_GROUPINGS, d30Accents, eighthsPerBar, type D30Accent, type D30Prompt } from './logic';

/**
 * D30's words: button labels, the fact shown with the feedback, why a wrong
 * answer was wrong, and the guide panel's rows. Only the lazy view loads it.
 */

/** A button's second line: the style the meter is known for. Every button has one. */
const FEEL: Record<EarMeter, string> = {
  '3/4': 'waltz',
  '4/4': 'rock, pop',
  '6/8': 'ballad, jig',
  '12/8': 'slow blues',
  '5/4': 'five beats',
  '7/8': 'seven, uneven',
};

export function d30SubLabel(meter: EarMeter): string {
  return FEEL[meter];
}

/** The accessible name: "6/8 time". */
export function d30Spoken(meter: EarMeter): string {
  return `${meter} time`;
}

/**
 * What to listen for, per meter: the cue the guide panel gives from level 2.
 * Descriptions, not facts to grade: they help the worked example and fade.
 */
const LISTEN_FOR: Record<EarMeter, string> = {
  '3/4': 'Three beats: a strong ONE, then two light ones. Boom-chick-chick.',
  '4/4': 'Four beats: the strong ONE, a lighter THREE, and the snare on 2 and 4.',
  '6/8': 'Two big beats, each split in three: ONE-two-three FOUR-five-six.',
  '12/8':
    'Four beats, each split in three: the slow-blues shuffle. A 4/4 shuffle (swung eighths) has this feel too.',
  '5/4': 'Five beats in a long group and a short one: 3+2 or 2+3.',
  '7/8': 'Seven quick notes in uneven groups (2+2+3, 3+2+2 or 2+3+2): it limps.',
};

/** The grouping a clip played, as a reader would write it: "7/8 (3+2+2)". */
export function d30Heard(prompt: D30Prompt): string {
  return prompt.signature;
}

/** "Compound duple: 2 dotted-quarter beats, each split in 3." */
function fact(ts: TimeSignature): string {
  return `${describeMeter(ts)}.`;
}

/** The fact shown with the feedback, for the grouping played: "6/8. Compound duple: …". */
export function d30Fact(prompt: D30Prompt): string {
  return `${d30Heard(prompt)}. ${fact(parseTimeSignature(prompt.signature))}`;
}

/** The worked example's opening line (rule 8): the meter, named, with what to count. */
export function d30WorkedExample(prompt: D30Prompt): string {
  return `This is ${prompt.meter}. ${LISTEN_FOR[prompt.meter]}`;
}

export function d30Task(): string {
  return 'Which meter is it?';
}

const BEATS = (n: number) => `${n} beat${n === 1 ? '' : 's'}`;

/**
 * Why a wrong answer was wrong, beside the right one (rule 10: the contrast
 * is what an ear learns from). The confusable pairs get their own words.
 */
export function d30Explain(prompt: D30Prompt, answer: EarMeter): string | null {
  const right = prompt.meter;
  if (answer === right) return null;
  const pair = new Set([right, answer]);
  if (pair.has('3/4') && pair.has('6/8'))
    return 'Both bars hold six eighths. 3/4 groups them in twos, three beats; 6/8 in threes, two beats.';
  if (pair.has('4/4') && pair.has('12/8'))
    return 'Both have four beats. In 4/4 each beat splits in two; in 12/8 it splits in three, the shuffle.';
  const ts = parseTimeSignature(prompt.signature);
  const yours = parseTimeSignature(D30_GROUPINGS[answer][0] as string);
  return `${answer} has ${BEATS(feltBeats(yours))} in a bar; this was ${right}, with ${BEATS(feltBeats(ts))}.`;
}

export interface D30CountStep {
  syllable: string;
  accent: D30Accent;
}

/**
 * How one bar is counted, eighth by eighth: "1 & 2 & 3 &" in 3/4, "1 la li
 * 2 la li" in 6/8, "1 & 2 & 3 la li" in 7/8 (2+2+3). Each with its accent,
 * so the view can stress the beats.
 */
export function d30Count(ts: TimeSignature): D30CountStep[] {
  const eighths = parseRhythm(Array<string>(eighthsPerBar(ts)).fill('8').join(' '));
  const accents = d30Accents(ts);
  return countSyllables(eighths, ts).map((syllable, i) => ({
    syllable,
    accent: accents[i] as D30Accent,
  }));
}

export interface D30GuideRow {
  meter: EarMeter;
  /** How it is counted, from level 1. */
  count: string;
  /** What to listen for, from level 2. */
  cue: string | null;
}

/**
 * The context panel's rows (rule 9: faded within and across sessions):
 * every button's count from level 1, and from level 2 what to listen for.
 * It lists every button alike, so it never singles out the answer (rule 4).
 */
export function d30Guide(prompt: D30Prompt, guideLevel: GuideLevel): D30GuideRow[] {
  if (guideLevel <= 0) return [];
  return prompt.choices.map((meter) => ({
    meter,
    count: d30Count(parseTimeSignature(D30_GROUPINGS[meter][0] as string))
      .map((s) => s.syllable)
      .join(' '),
    cue: guideLevel >= 2 ? LISTEN_FOR[meter] : null,
  }));
}
