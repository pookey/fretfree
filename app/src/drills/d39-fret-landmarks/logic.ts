import {
  parseMarkerItemId,
  parseRepeatItemId,
  type GuideLevel,
  type Handedness,
  type Item,
} from '../../engine/model';
import {
  DOUBLE_INLAY_FRETS,
  INLAY_FRETS,
  allStrings,
  noteAt,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D39_MARKERS, d39CanTest, d39Concept } from './meta';

export { D39_ID, D39_MARKERS, D39_SCOPE, d39CanTest, d39ConceptOf } from './meta';

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

export type D39Mode = 'name-marker' | 'find-marker' | 'repeat';

const LOW_OCTAVE: FretRange = { from: 0, to: 12 };
const HIGH_OCTAVE: FretRange = { from: 12, to: 24 };

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

/** `fret 7`, or `the open strings` for fret 0. Used for feedback and the review log. */
export function d39FretName(fret: number): string {
  return fret === 0 ? 'the open strings' : `fret ${fret}`;
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

/**
 * How to find a marker: count the dots from the nut (research/03 F3). The
 * 12th fret's double dot is named, since it is the one that looks different.
 */
function countDots(fret: number): string {
  const dots = D39_MARKERS.filter((f) => f <= fret);
  if (dots.length <= 1) return `The first dot from the nut is fret ${fret}.`;
  const last = fret === 12 ? 'then the double dot, 12' : String(fret);
  return `Count the dots from the nut: ${[...dots.slice(0, -1), last].join(', ')}.`;
}

/**
 * The feedback line under the prompt (research/02 rule 9; research/03 F3).
 * Markers teach the count from the nut, and say when the chosen fret has no
 * dot at all. A repeat restates the worked example, the 12-fret rule, and on
 * a miss does the sum.
 */
export function d39Explain(prompt: D39Prompt, fb: DrillFeedback<D39Answer>): string {
  if (prompt.mode === 'repeat') {
    const rule = d39WorkedExample(prompt);
    const { from, expected } = prompt;
    if (fb.result.correct || from === 0 || expected === 0) return rule;
    const sum = expected > from ? `${from} + 12 = ${expected}` : `${from} − 12 = ${expected}`;
    return `${rule} ${sum}.`;
  }
  const count = countDots(prompt.expected);
  if (fb.result.correct) return count;
  const noDot = fb.answer > 0 && !D39_MARKERS.includes(fb.answer);
  return noDot ? `Fret ${fb.answer} has no dot. ${count}` : count;
}

export function d39Check(prompt: D39Prompt, answer: D39Answer): DrillCheck {
  const expected = d39FretName(prompt.expected);
  if (answer === prompt.expected) return { correct: true, expected };
  return { correct: false, expected, confusedWith: d39Concept(answer) };
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

// --- Keyboard path ----------------------------------------------------------

/**
 * How a fret looks, for screen readers, with no fret number in it: a fret
 * number would name a marker prompt's answer. The learner counts markers from
 * the nut, as a sighted learner counts dots.
 */
export function d39FretLook(fret: number): string {
  if (fret === 0) return 'open strings';
  if (DOUBLE_INLAY_FRETS.includes(fret)) return 'double-dot marker';
  return INLAY_FRETS.includes(fret) ? 'single-dot marker' : 'no marker';
}

/** The neck's accessible name for a spotlit marker: its place among the markers from the nut. */
export function d39SpotlightLabel(fret: number): string {
  const nth = D39_MARKERS.indexOf(fret) + 1;
  const look = DOUBLE_INLAY_FRETS.includes(fret) ? ', the double dot' : '';
  return `Fretboard. The ${d39Ordinal(nth)} marker from the nut is spotlit${look}.`;
}

/**
 * Arrow keys move a focus fret along the neck in find mode (design §10
 * keyboard path). Left and right follow the neck as drawn, which a
 * left-handed neck mirrors; Home and End jump to its ends. Null for other keys.
 */
export function d39MoveFocus(
  fret: number,
  key: string,
  range: FretRange,
  handedness: Handedness,
): number | null {
  const toward = handedness === 'left' ? -1 : 1;
  const clamp = (f: number) => Math.max(range.from, Math.min(range.to, f));
  switch (key) {
    case 'ArrowRight':
      return clamp(fret + toward);
    case 'ArrowLeft':
      return clamp(fret - toward);
    case 'Home':
      return range.from;
    case 'End':
      return range.to;
    default:
      return null;
  }
}

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
