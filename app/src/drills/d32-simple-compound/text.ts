import type { MeterFact } from '../../engine/items/meter';
import type { GuideLevel } from '../../engine/model';
import { beats, feltBeats, meterKind } from '../../theory';
import {
  familyOf,
  meterOfChoice,
  signatureOf,
  unitCode,
  unitName,
  type D32Answer,
  type D32Prompt,
} from './logic';

/**
 * D32's words: the question, the fact and why, what a wrong choice is the
 * answer to, accessible names, the beat strip and the context panel's rules.
 * Only the view and panel use them, so they load with the views, not in
 * first-load JS (design §10).
 */

/** `dotted-quarter`, `quarter-note`, `half-note`: a beat's note, as an adjective. */
function beatNote(meter: string): string {
  const name = unitName(unitCode(signatureOf(meter)));
  return name.startsWith('dotted ') ? name.replace(' ', '-') : `${name}-note`;
}

/** `2 dotted-quarter beats`, `3 quarter-note beats`. */
export function beatsPhrase(meter: string): string {
  return `${feltBeats(signatureOf(meter))} ${beatNote(meter)} beats`;
}

/** Accessible name: `6/8` → `6 8 time`, `2/2` → `2 2 time, cut time`. */
export function spokenMeter(meter: string): string {
  const said = `${meter.replace('/', ' ')} time`;
  return meter === '2/2' ? `${said}, cut time` : said;
}

/** A choice's accessible name: `2 beats`, `dotted quarter`, `Compound`, `6 8 time`. */
export function spokenChoice(fact: MeterFact, choice: string): string {
  switch (fact) {
    case 'feltBeats':
      return `${choice} beats`;
    case 'beatUnit':
      return unitName(choice);
    case 'kind':
      return choice === 'simple' ? 'Simple' : 'Compound';
    case 'fromBeats':
      return spokenMeter(choice);
  }
}

/** The `fromBeats` card's subject: `2 dotted-quarter beats a bar`. */
export function d32BeatsSubject(prompt: D32Prompt): string {
  return `${beatsPhrase(prompt.meter)} a bar`;
}

/** The question under the subject. */
export function d32Task(prompt: D32Prompt): string {
  switch (prompt.fact) {
    case 'feltBeats':
      return 'How many beats do you feel in a bar?';
    case 'beatUnit':
      return 'What note lasts one felt beat?';
    case 'kind':
      return 'Simple or compound?';
    case 'fromBeats':
      return 'Which time signature is it?';
  }
}

/**
 * The fact and why, in one line: the worked example on a new item's first
 * rep (rule 8), and the answer's name in feedback (rule 10).
 */
export function d32Fact(prompt: D32Prompt): string {
  const m = prompt.meter;
  const ts = signatureOf(m);
  switch (familyOf(m)) {
    case 'cut':
      return `2/2 is cut time (¢), simple time: a bar has ${beatsPhrase(m)}. It holds the same notes as 4/4, felt in 2.`;
    case 'simple':
      return `${m} is simple time: the top number counts the beats and the bottom names the beat, so a bar has ${beatsPhrase(m)}.`;
    case 'compound':
      return `${m} is compound time: its ${ts.top} eighths group in threes, so a bar has ${beatsPhrase(m)}.`;
  }
}

/** Why a wrong choice is wrong: what it is the answer to. */
export function d32Explain(prompt: D32Prompt, answer: D32Answer): string | null {
  if (answer === prompt.answer) return null;
  const ts = signatureOf(prompt.meter);
  const compound = meterKind(ts) === 'compound';
  const other = meterOfChoice(prompt, answer);
  switch (prompt.fact) {
    case 'fromBeats':
      return other ? `${other} has ${beatsPhrase(other)}.` : null;
    case 'feltBeats':
      if (compound && answer === String(ts.top)) {
        return `${ts.top} counts the eighths. In compound time they group in threes: ${ts.top} ÷ 3 = ${prompt.answer} beats.`;
      }
      return other
        ? `${answer} beats is ${other}, a bar of the same length felt another way.`
        : null;
    case 'beatUnit':
      if (compound && answer === String(ts.bottom)) {
        return 'The 8 names the eighth, but a felt beat is three of them: a dotted quarter.';
      }
      return other
        ? `A ${unitName(answer)}-note beat is ${other}, a bar of the same length felt another way.`
        : null;
    case 'kind':
      return compound
        ? `A top number of ${ts.top} counts eighths in groups of three: each beat is dotted and splits in three.`
        : 'Its beats split in two, not three: the top number counts the beats themselves.';
  }
}

/** One pulse of the beat strip: a felt beat's start, or a pulse inside one. */
export interface StripCell {
  /** The felt beat's number on its start (`1`, `2`), else its count syllable (`la`, `li`). */
  label: string;
  beatStart: boolean;
}

/** The bar's pulses grouped into felt beats: 6/8 is [1 la li] [2 la li], 3/4 is [1] [2] [3]. */
export function beatStrip(meter: string): StripCell[][] {
  return beats(signatureOf(meter)).map((beat, i) =>
    Array.from({ length: beat.pulses }, (_, p) => ({
      label: p === 0 ? String(i + 1) : (['la', 'li'][p - 1] ?? ''),
      beatStart: p === 0,
    })),
  );
}

/** The strip's accessible name: `6/8: 2 beats, each 3 eighths`, `3/4: 3 beats`. */
export function stripLabel(meter: string): string {
  const groups = beatStrip(meter);
  const each = groups[0]?.length ?? 1;
  return each > 1
    ? `${meter}: ${groups.length} beats, each ${each} eighths`
    : `${meter}: ${groups.length} beats`;
}

/** What the context panel shows (rule 9: faded within and across sessions). */
export interface D32Guides {
  /** The rules for reading a time signature. */
  rules: string[];
  /** Level 2+: how each kind of beat is counted. */
  counting: boolean;
}

export function d32Guides(guideLevel: GuideLevel): D32Guides {
  if (guideLevel <= 0) return { rules: [], counting: false };
  return { rules: RULES, counting: guideLevel >= 2 };
}

const RULES = [
  'Simple time: the top number counts the beats, and the bottom names the note of one beat (4 = quarter, 2 = half).',
  'Compound time: a top number of 6, 9 or 12 counts eighths in groups of three. Divide it by 3 for the beats; each is a dotted quarter.',
];
