import { ENGINE_CONFIG } from '../../engine/config';
import { parseFindItemId } from '../../engine/items/find';
import type { GuideLevel, Item } from '../../engine/model';
import {
  allStrings,
  chromaOf,
  chromaToPc,
  inRange,
  intervalFromSemitones,
  intervalInfo,
  midiAt,
  noteAt,
  samePosition,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { d2SpanWindow } from '../d2-find-the-note/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D15_SCOPES, type D15Scope } from './meta';

export { D15_ID, D15_SCOPE, D15_SCOPES, d15CanTest, d15ConceptOf, type D15Scope } from './meta';

/**
 * D15 "Hear it, find it" (design §6, research/02 rule 13): the open string
 * sounds, then a note on it, and the learner taps that note. It tests the
 * same `find:<pc>@s<n>` cards as D2, with the sound as the cue.
 */

/** Taps count on the named string, frets 0–12. */
export const D15_REGION: FretRange = { from: 0, to: 12 };

export interface D15Prompt {
  itemId: string;
  /** The note's pitch class, spelled per the accidental preference. */
  pc: string;
  string: number;
  scope: D15Scope;
  /** The one cell that sounds the note heard. The open string's own note is at fret 12. */
  target: Position;
  /** The open string, played first as the reference. */
  reference: Position;
  activeRange: FretRange;
  /** Strings that accept taps. */
  liveStrings: number[];
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The tapped cell, and whether the prompt held the note's name back. */
export interface D15Answer extends Position {
  byEar: boolean;
}

export function d15ScopeFor(level: number): D15Scope {
  const i = Math.max(0, Math.min(D15_SCOPES.length - 1, Math.round(level)));
  return D15_SCOPES[i] as D15Scope;
}

export function d15MakePrompt(item: Item, ctx: DrillContext): D15Prompt {
  const ref = parseFindItemId(item.id);
  if (!ref || ref.string > stringCount(ctx.tuning)) {
    throw new Error(`D15 cannot test item ${item.id}`);
  }
  const reference = { string: ref.string, fret: 0 };
  const open = noteAt(reference, ctx.tuning).chroma;
  // The note above the open string, never the open string itself: unison with
  // the reference would give it away, and the name sits on that cell.
  const fret = (chromaOf(ref.pc) - open + 12) % 12 || 12;
  const scope = d15ScopeFor(ctx.scopeLevel);
  return {
    itemId: item.id,
    pc: chromaToPc(chromaOf(ref.pc), ctx.accidentalPref),
    string: ref.string,
    scope,
    target: { string: ref.string, fret },
    reference,
    activeRange: D15_REGION,
    liveStrings: scope === 'string' ? [ref.string] : allStrings(ctx.tuning),
    tuning: ctx.tuning,
    accidentalPref: ctx.accidentalPref,
  };
}

/**
 * Whether the prompt names the note. The name is a guide (design §3.5): it
 * shows while the neck still highlights roots (level 2+), so new reps pair
 * the sound with a name, and fades with the skill. With sound off there is
 * nothing to hear, so it always shows.
 */
export function d15Named(guideLevel: GuideLevel, soundOn: boolean): boolean {
  return guideLevel >= 2 || !soundOn;
}

/** True if a tap on this cell is an answer (dimmed cells are inert). */
export function d15IsLive(prompt: D15Prompt, pos: Position): boolean {
  return prompt.liveStrings.includes(pos.string) && inRange(pos.fret, prompt.activeRange);
}

function nameAt(prompt: D15Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).name;
}

function pcAt(prompt: D15Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).pc;
}

/** What the prompt plays: the open string, then the note (scientific names, e.g. `A2`, `G3`). */
export function d15PromptNotes(prompt: D15Prompt): string[] {
  return [nameAt(prompt, prompt.reference), nameAt(prompt, prompt.target)];
}

export function d15Check(prompt: D15Prompt, answer: Position): DrillCheck {
  if (samePosition(answer, prompt.target)) return { correct: true, expected: prompt.pc };
  const given = d15IsLive(prompt, answer) ? pcAt(prompt, answer) : null;
  // The note on another string, or an octave off, is a place error, not a note confusion.
  return given && chromaOf(given) !== chromaOf(prompt.pc)
    ? { correct: false, expected: prompt.pc, confusedWith: given }
    : { correct: false, expected: prompt.pc };
}

export function d15DescribeAnswer(answer: Position): string {
  return `s${answer.string}f${answer.fret}`;
}

/**
 * Hearing the note takes time a tap target's speed calibration doesn't
 * include, so by ear the listening allowance comes off before grading. A
 * named note is graded like D2.
 */
export function d15GradedResponseMs(
  _prompt: D15Prompt,
  answer: D15Answer,
  elapsedMs: number,
): number {
  if (!answer.byEar) return elapsedMs;
  return Math.max(0, elapsedMs - ENGINE_CONFIG.earFind.listenAllowanceMs);
}

/** Correct: the note again. Wrong: the note, then the one tapped, so the gap is heard. */
export function d15Sounds(prompt: D15Prompt, fb: DrillFeedback<Position>): DrillSounds {
  const expected = [nameAt(prompt, prompt.target)];
  return fb.result.correct ? { expected } : { expected, given: [nameAt(prompt, fb.answer)] };
}

export function d15FeedbackPositions(
  prompt: D15Prompt,
  fb: DrillFeedback<Position>,
): { expected: Position[]; given: Position[] } {
  const { string, fret } = fb.answer;
  return { expected: [prompt.target], given: fb.result.correct ? [] : [{ string, fret }] };
}

/** "a minor 7th above the open A": how the note sits over the reference. */
export function d15Above(prompt: D15Prompt): string {
  const interval = intervalInfo(intervalFromSemitones(prompt.target.fret)).long;
  return `${interval} above the open ${pcAt(prompt, prompt.reference)}`;
}

const frets = (n: number) => `${n} ${n === 1 ? 'fret' : 'frets'}`;

/** One line of feedback: where the note is and how it sits over the open string. */
export function d15Explain(prompt: D15Prompt, fb: DrillFeedback<Position>): string {
  const where = `${prompt.pc} is at fret ${prompt.target.fret} on string ${prompt.string}, a ${d15Above(prompt)}.`;
  if (fb.result.correct) return where;
  const { string, fret } = fb.answer;
  const tapped = pcAt(prompt, fb.answer);
  if (string !== prompt.string) {
    const same = midiAt(fb.answer, prompt.tuning) === midiAt(prompt.target, prompt.tuning);
    const what = same ? 'the same note, on another string' : `string ${string}, fret ${fret}`;
    return `You tapped ${tapped} (${what}). ${where}`;
  }
  const off = fret - prompt.target.fret;
  const how = off < 0 ? `${frets(-off)} too low` : `${frets(off)} too high`;
  return `You tapped ${tapped} (fret ${fret}), ${how}. ${where}`;
}

/**
 * The guide level the neck is drawn at. Guides fade as usual (design §3.5),
 * but the answer never shows as text before it is given: guide level 2+
 * names the open strings, so when one of those names is the note, the neck
 * drops to inlays only (level 1), as D2's does. Guided reps (worked
 * examples) and feedback show everything.
 */
export function d15NeckGuideLevel(
  prompt: D15Prompt,
  guideLevel: GuideLevel,
  opts: { guided: boolean; answered: boolean },
): GuideLevel {
  if (opts.guided) return 3;
  if (opts.answered || guideLevel < 2) return guideLevel;
  const target = chromaOf(prompt.pc);
  const named = allStrings(prompt.tuning).some(
    (string) => noteAt({ string, fret: 0 }, prompt.tuning).chroma === target,
  );
  return named ? 1 : guideLevel;
}

/**
 * The first compact window: at the nut, where the reference is, so it gives
 * nothing away. A guided rep (a worked example) opens on the note instead.
 */
export function d15InitialWindow(prompt: D15Prompt, guided: boolean, size?: number): FretRange {
  const fret = guided ? prompt.target.fret : prompt.activeRange.from;
  return d2SpanWindow([fret], prompt.activeRange, size);
}
