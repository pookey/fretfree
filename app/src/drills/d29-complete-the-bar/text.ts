import type { GuideLevel } from '../../engine/model';
import { describeMeter, formatRhythm, fracCmp, fracSub, meterKind, type Frac } from '../../theory';
import {
  barHolds,
  beatUnitPlural,
  beatsPhrase,
  d29Verdict,
  lengthName,
  rhythmOf,
  signatureOf,
  valueList,
  valueName,
  type D29Answer,
  type D29Prompt,
  type HiddenBeat,
} from './logic';

/**
 * D29's words: the task, the worked example, why a fill is wrong, accessible
 * names and the context panel's rules. Only the view and panel use them, so
 * they load with the views, not in first-load JS (design §10).
 */

/** Accessible name of a time signature: `6/8` → `6 8 time`. */
export function spokenMeter(meter: string): string {
  const said = `${meter.replace('/', ' ')} time`;
  return meter === '2/2' ? `${said}, cut time` : said;
}

/** The question. */
export function d29Task(prompt: D29Prompt): string {
  return prompt.given ? 'Complete the bar.' : 'Fill the bar.';
}

/** The worked example's line (rule 8): the values that finish it, which the learner places. */
export function d29WorkedExample(prompt: D29Prompt): string {
  const codes = rhythmOf(prompt.solution).map((e) => formatRhythm([e]));
  return `A bar of ${prompt.meter} has ${beatsPhrase(prompt.meter)}. Place ${valueList(codes)} to finish it.`;
}

/** The fact, named in feedback (rule 10): `Compound duple: 2 dotted-quarter beats, each split in 3.` */
export function d29Fact(meter: string): string {
  return `${describeMeter(signatureOf(meter))}.`;
}

const ORDINALS = ['1st', '2nd', '3rd'];

/**
 * Where a note starts: on a beat, on a simple beat's "&", or (compound time,
 * whose "la li" few learners count yet) on an eighth of the bar.
 */
function where(h: HiddenBeat, compound: boolean): string {
  if (h.count === String(h.beat)) return `beat ${h.beat}`;
  if (compound && h.eighth !== null)
    return `the ${ORDINALS[h.eighth - 1] ?? `${h.eighth}th`} eighth`;
  return `“${h.count}” of beat ${h.beat}`;
}

/** Why one note hides a beat. */
export function hiddenLine(meter: string, h: HiddenBeat): string {
  const compound = meterKind(signatureOf(meter)) === 'compound';
  const note = `the ${valueName(h.code)} from ${where(h, compound)}`;
  if (compound) {
    return `${meter} groups in ${beatUnitPlural(meter)}: ${note} runs into beat ${h.hides}, hiding it. Fill one dotted-quarter beat at a time.`;
  }
  if (h.middle) {
    return `Show the middle of the bar: ${note} runs across beat 3, the middle of ${meter}. Start it on a beat, or use shorter notes.`;
  }
  return `${meter} groups in ${beatUnitPlural(meter)}: ${note} runs across beat ${h.hides}, hiding it. A note that starts between beats should end by the next one.`;
}

function lengthLine(meter: string, fill: 'short' | 'over', remaining: Frac): string {
  const by = lengthName(fill === 'short' ? remaining : fracSub({ n: 0, d: 1 }, remaining));
  const holds = `a bar of ${meter} holds ${barHolds(meter)}`;
  return fill === 'short' ? `Short by ${by}: ${holds}.` : `Over by ${by}: ${holds}.`;
}

/**
 * Why a fill is wrong, most basic first: its length, then each note that
 * hides a beat, then the meter it would be right in. Empty when it's right.
 */
export function d29Explain(prompt: D29Prompt, answer: D29Answer): string[] {
  const { check, hidden, partner } = d29Verdict(prompt, answer);
  if (check.ok) return [];
  const lines: string[] = [];
  if (check.fill !== 'exact') lines.push(lengthLine(prompt.meter, check.fill, check.remaining));
  for (const h of hidden) lines.push(hiddenLine(prompt.meter, h));
  if (partner) lines.push(`Those notes make a bar of ${partner}: ${beatsPhrase(partner)}.`);
  return lines;
}

/** What's left to fill, for the bar's live label: `Room for a dotted quarter`, `Full`, `Over by an eighth`. */
export function roomLabel(remaining: Frac): string {
  const cmp = fracCmp(remaining, { n: 0, d: 1 });
  if (cmp === 0) return 'Full';
  if (cmp > 0) return `Room for ${lengthName(remaining)}`;
  return `Over by ${lengthName(fracSub({ n: 0, d: 1 }, remaining))}`;
}

/** A placed value's accessible name: `Dotted quarter, note 2 of 3`. */
export function placedLabel(code: string, index: number, count: number): string {
  const name = valueName(code);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}, value ${index + 1} of ${count}`;
}

/** What the context panel and the bar show (rule 9: faded within and across sessions). */
export interface D29Guides {
  /** The rules for filling a bar. */
  rules: string[];
  /** The bar drawn to scale, with what's left to fill (level 1+). */
  scale: boolean;
  /** The felt beats marked on the bar (level 2+). */
  beatLines: boolean;
}

export function d29Guides(guideLevel: GuideLevel): D29Guides {
  if (guideLevel <= 0) return { rules: [], scale: false, beatLines: false };
  return { rules: RULES, scale: true, beatLines: guideLevel >= 2 };
}

const RULES = [
  'Simple time: the top number counts the beats and the bottom names the note of one (4 = quarter). Fill a bar one beat at a time.',
  'Compound time (6/8, 9/8, 12/8): the eighths group in threes, so each beat is a dotted quarter. A note shouldn’t run from one dotted-quarter beat into the next unless it lasts whole beats.',
  'A dot adds half: a dotted quarter is three eighths.',
];
