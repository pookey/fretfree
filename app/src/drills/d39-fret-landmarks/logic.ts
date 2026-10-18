import {
  parseMarkerItemId,
  parseRepeatItemId,
  type GuideLevel,
  type Item,
} from '../../engine/model';
import {
  INLAY_FRETS,
  allStrings,
  noteAt,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D39 "Fret landmarks" (design §6): the fret-marker landmarks and the
 * 12th-fret repeat (topic F3). The pure half of the drill. Three item kinds,
 * both directions of each fact (research/02 rule 1):
 *
 * - `marker:f7`: one inlay is spotlit and the learner names its fret.
 * - `find-marker:f7`: "tap the 7th-fret marker"; any string on that fret counts.
 * - `repeat:+12@f3` / `repeat:-12@f15`: which fret, an octave away, has the
 *   same notes? Answered from the landmarks of the other octave.
 *
 * Every answer is a fret number.
 */

export const D39_ID = 'fret-landmarks';

export type D39Mode = 'name-marker' | 'find-marker' | 'repeat';

/** The landmarks F3 teaches: the inlays up to the double dot at 12. */
export const D39_MARKERS: readonly number[] = INLAY_FRETS.filter((f) => f <= 12);

const LOW_OCTAVE: FretRange = { from: 0, to: 12 };
const HIGH_OCTAVE: FretRange = { from: 12, to: 24 };

/**
 * Scope levels (design §3.3 step 4, research/02 rule 5): 0 offers only the
 * landmark frets as answers; 1 offers every fret of the octave, so a near
 * miss (6 for 7) is possible.
 */
export const D39_SCOPE = { minLevel: 0, maxLevel: 1 };

export interface D39Prompt {
  itemId: string;
  mode: D39Mode;
  /** The spotlit or sought marker, or the fret the repeat starts from. */
  from: number;
  /** The answer fret. */
  expected: number;
  /** Fret buttons in neck order. Empty for `find-marker`, which is answered on the neck. */
  choices: number[];
  /** The frets drawn while the prompt is open. */
  range: FretRange;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The answer is a fret number, chosen or tapped. */
export type D39Answer = number;

function frets(range: FretRange): number[] {
  return Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);
}

/** `fret 7`; the open string is fret 0. Used for feedback and the review log. */
export function d39FretName(fret: number): string {
  return fret === 0 ? 'fret 0 (open)' : `fret ${fret}`;
}

/** The label on a fret button. */
export function d39ChoiceLabel(fret: number): string {
  return fret === 0 ? 'Open' : String(fret);
}

/** `7th`, `12th`, `3rd`: how a marker is named in a prompt. */
export function d39Ordinal(fret: number): string {
  const tens = fret % 100;
  if (tens >= 11 && tens <= 13) return `${fret}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][fret % 10] ?? 'th';
  return `${fret}${suffix}`;
}

export function d39CanTest(item: Item): boolean {
  const marker = parseMarkerItemId(item.id);
  if (marker) return D39_MARKERS.includes(marker.fret);
  const repeat = parseRepeatItemId(item.id);
  if (!repeat || Math.abs(repeat.frets) !== 12) return false;
  const to = repeat.from + repeat.frets;
  return to >= 0 && to <= 24;
}

export function d39MakePrompt(item: Item, ctx: DrillContext): D39Prompt {
  if (!d39CanTest(item)) throw new Error(`D39 cannot test item ${item.id}`);
  const base = { itemId: item.id, tuning: ctx.tuning, accidentalPref: ctx.accidentalPref };
  const marker = parseMarkerItemId(item.id);
  if (marker) {
    const mode: D39Mode = marker.kind === 'marker' ? 'name-marker' : 'find-marker';
    const choices =
      mode === 'find-marker'
        ? []
        : ctx.scopeLevel >= 1
          ? frets({ from: 1, to: 12 })
          : [...D39_MARKERS];
    return { ...base, mode, from: marker.fret, expected: marker.fret, choices, range: LOW_OCTAVE };
  }
  const repeat = parseRepeatItemId(item.id) as { frets: number; from: number };
  const up = repeat.frets > 0;
  const target = up ? HIGH_OCTAVE : LOW_OCTAVE;
  const pool =
    ctx.scopeLevel >= 1 ? frets(target) : [0, ...INLAY_FRETS].filter((f) => inOctave(f, target));
  return {
    ...base,
    mode: 'repeat',
    from: repeat.from,
    expected: repeat.from + repeat.frets,
    // The starting fret is never its own answer (12 sits in both octaves).
    choices: pool.filter((f) => f !== repeat.from),
    range: up ? LOW_OCTAVE : HIGH_OCTAVE,
  };
}

function inOctave(fret: number, range: FretRange): boolean {
  return fret >= range.from && fret <= range.to;
}

/** The question while the prompt is open (no answer in it, research/02 rule 4). */
export function d39Question(prompt: D39Prompt): string {
  switch (prompt.mode) {
    case 'name-marker':
      return 'Which fret is this marker on?';
    case 'find-marker':
      return `Tap the ${d39Ordinal(prompt.from)}-fret marker`;
    case 'repeat': {
      const start = prompt.from === 0 ? 'the open strings' : `fret ${prompt.from}`;
      const way = prompt.expected > prompt.from ? 'higher' : 'lower';
      return `Which fret has the same notes as ${start}, an octave ${way}?`;
    }
  }
}

/** The worked example for a guided first rep (research/02 rule 8). */
export function d39WorkedExample(prompt: D39Prompt): string {
  switch (prompt.mode) {
    case 'name-marker':
      return `This is the ${d39Ordinal(prompt.from)}-fret marker.`;
    case 'find-marker':
      return `The ${d39Ordinal(prompt.from)}-fret marker is here.`;
    case 'repeat': {
      const start = prompt.from === 0 ? 'the open strings' : `fret ${prompt.from}`;
      const way = prompt.expected > prompt.from ? 'higher' : 'lower';
      const at = prompt.expected === 0 ? 'The open strings have' : `Fret ${prompt.expected} has`;
      return `${at} the same notes as ${start}, an octave ${way}: the neck repeats every 12 frets.`;
    }
  }
}

export function d39Check(prompt: D39Prompt, answer: D39Answer): DrillCheck {
  const expected = d39FretName(prompt.expected);
  if (answer === prompt.expected) return { correct: true, expected };
  return { correct: false, expected, confusedWith: d39Concept(answer) };
}

function d39Concept(fret: number): string {
  return `fret:${fret}`;
}

export function d39DescribeAnswer(answer: D39Answer): string {
  return `f${answer}`;
}

/** The low string at a fret: a marker's note, and the octave a repeat lands on. */
function lowNote(prompt: D39Prompt, fret: number): string {
  const low = Math.max(...allStrings(prompt.tuning));
  return noteAt({ string: low, fret }, prompt.tuning, prompt.accidentalPref).name;
}

/**
 * Sound, sight and name together (research/02 rule 10). A marker plays its
 * fret on the low string; a repeat plays both frets, so the octave is heard.
 * A wrong answer plays the chosen fret too.
 */
export function d39Sounds(prompt: D39Prompt, fb: DrillFeedback<D39Answer>): DrillSounds {
  const expected =
    prompt.mode === 'repeat'
      ? [lowNote(prompt, prompt.from), lowNote(prompt, prompt.expected)]
      : [lowNote(prompt, prompt.expected)];
  return fb.result.correct ? { expected } : { expected, given: [lowNote(prompt, fb.answer)] };
}

/** One fret on every string. */
export function d39Column(tuning: Tuning, fret: number): Position[] {
  return allStrings(tuning).map((string) => ({ string, fret }));
}

/** The answer fret on every string, and the chosen fret when it was wrong. */
export function d39FeedbackPositions(
  prompt: D39Prompt,
  fb: DrillFeedback<D39Answer>,
  tuning: Tuning,
): { expected: Position[]; given: Position[] } {
  return {
    expected: d39Column(tuning, prompt.expected),
    given: fb.result.correct ? [] : d39Column(tuning, fb.answer),
  };
}

/**
 * The frets drawn in feedback. A repeat widens to both octaves' frets, so the
 * starting fret and its repeat are seen side by side with the same notes.
 */
export function d39FeedbackRange(prompt: D39Prompt, answer: D39Answer): FretRange {
  if (prompt.mode !== 'repeat') return prompt.range;
  const shown = [prompt.from, prompt.expected, answer];
  return { from: Math.min(...shown), to: Math.max(...shown) };
}

/**
 * The guide level the neck is drawn at. Fret numbers (level 2+) would name a
 * marker's fret, so an open marker prompt shows inlays only (level 1). A
 * repeat's answer lies in the other octave, which isn't drawn, so its guides
 * fade as usual. Guided reps show everything.
 */
export function d39NeckGuideLevel(
  prompt: D39Prompt,
  guideLevel: GuideLevel,
  opts: { guided: boolean; answered: boolean },
): GuideLevel {
  if (opts.guided) return 3;
  if (opts.answered || prompt.mode === 'repeat') return guideLevel;
  return Math.min(guideLevel, 1) as GuideLevel;
}

export function d39ConceptOf(item: Item): string | null {
  if (!d39CanTest(item)) return null;
  const marker = parseMarkerItemId(item.id);
  if (marker) return d39Concept(marker.fret);
  const repeat = parseRepeatItemId(item.id) as { frets: number; from: number };
  return d39Concept(repeat.from + repeat.frets);
}

// --- Keyboard path ----------------------------------------------------------

/**
 * Typing a fret number answers (design §7 keyboard path). Digits build up a
 * number and it answers as soon as no other choice starts with it: `7` at
 * once, `1` waits for `12`. Enter answers what has been typed; `o` is the
 * open string; Escape and Backspace clear.
 */
export function d39TypeKey(
  typed: string,
  key: string,
  choices: readonly number[],
): { typed: string; answer: number | null } {
  if (key === 'Escape' || key === 'Backspace') return { typed: '', answer: null };
  if (key === 'Enter') {
    const n = typed === '' ? NaN : Number(typed);
    return choices.includes(n) ? { typed: '', answer: n } : { typed, answer: null };
  }
  if (key.toLowerCase() === 'o') {
    return choices.includes(0) ? { typed: '', answer: 0 } : { typed, answer: null };
  }
  if (!/^[0-9]$/.test(key)) return { typed, answer: null };
  const extend = (t: string) => choices.filter((c) => String(c).startsWith(t));
  // A digit that leads nowhere from what's typed starts a new number.
  const next = extend(typed + key).length > 0 ? typed + key : extend(key).length > 0 ? key : '';
  const open = extend(next);
  if (next !== '' && open.length === 1 && String(open[0]) === next) {
    return { typed: '', answer: open[0] as number };
  }
  return { typed: next, answer: null };
}
