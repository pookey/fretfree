import { parseFindItemId, type GuideLevel, type Handedness, type Item } from '../../engine/model';
import {
  allStrings,
  chromaOf,
  chromaToPc,
  inRange,
  noteAt,
  positionsOfPitchClass,
  samePosition,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D2_SCOPES, type D2Scope } from './meta';

export { D2_ID, D2_SCOPE, D2_SCOPES, d2CanTest, d2ConceptOf, type D2Scope } from './meta';

/** D2 "Find the note" (design §6): name → position, the pure half of the drill. */

const REGION: FretRange = { from: 0, to: 12 };
const NECK: FretRange = { from: 0, to: 15 };

/** Compact screens show a 5-fret window that the learner slides (design §7 iPhone). */
export const D2_WINDOW_FRETS = 5;
/** One slide moves the window this many frets, keeping one fret of overlap. */
export const D2_WINDOW_STEP = 4;

export interface D2Prompt {
  itemId: string;
  /** The named pitch class, spelled per the accidental preference. */
  pc: string;
  string: number;
  scope: D2Scope;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  /** Strings that accept taps. */
  liveStrings: number[];
  /** Every correct cell: the pitch class on the named string, within the active range. */
  targets: Position[];
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The answer is the tapped cell. */
export type D2Answer = Position;

export function d2ScopeFor(level: number): D2Scope {
  const i = Math.max(0, Math.min(D2_SCOPES.length - 1, Math.round(level)));
  return D2_SCOPES[i] as D2Scope;
}

export function d2MakePrompt(item: Item, ctx: DrillContext): D2Prompt {
  const ref = parseFindItemId(item.id);
  if (!ref || ref.string > stringCount(ctx.tuning)) {
    throw new Error(`D2 cannot test item ${item.id}`);
  }
  const scope = d2ScopeFor(ctx.scopeLevel);
  const activeRange = scope === 'neck' ? NECK : REGION;
  return {
    itemId: item.id,
    pc: chromaToPc(chromaOf(ref.pc), ctx.accidentalPref),
    string: ref.string,
    scope,
    activeRange,
    liveStrings: scope === 'string' ? [ref.string] : allStrings(ctx.tuning),
    targets: positionsOfPitchClass(ref.pc, {
      tuning: ctx.tuning,
      fretRange: activeRange,
      strings: [ref.string],
    }),
    tuning: ctx.tuning,
    accidentalPref: ctx.accidentalPref,
  };
}

/** True if a tap on this cell is an answer (dimmed cells are inert). */
export function d2IsLive(prompt: D2Prompt, pos: Position): boolean {
  return prompt.liveStrings.includes(pos.string) && inRange(pos.fret, prompt.activeRange);
}

function pcAt(prompt: D2Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).pc;
}

export function d2Check(prompt: D2Prompt, answer: D2Answer): DrillCheck {
  if (prompt.targets.some((t) => samePosition(t, answer))) {
    return { correct: true, expected: prompt.pc };
  }
  const given = d2IsLive(prompt, answer) ? pcAt(prompt, answer) : null;
  // The right note on the wrong string is a string error, not a note confusion.
  return given && chromaOf(given) !== chromaOf(prompt.pc)
    ? { correct: false, expected: prompt.pc, confusedWith: given }
    : { correct: false, expected: prompt.pc };
}

export function d2DescribeAnswer(answer: D2Answer): string {
  return `s${answer.string}f${answer.fret}`;
}

/** The target closest to a fret, so a wrong tap is paired with the nearest right one. */
export function d2NearestTarget(prompt: D2Prompt, fret: number): Position | null {
  let best: Position | null = null;
  for (const t of prompt.targets) {
    if (!best || Math.abs(t.fret - fret) < Math.abs(best.fret - fret)) best = t;
  }
  return best;
}

function nameAt(prompt: D2Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).name;
}

/** Correct: the tapped note. Wrong: the nearest right note, then the tapped one (design §7). */
export function d2Sounds(prompt: D2Prompt, fb: DrillFeedback<D2Answer>): DrillSounds {
  const tapped = nameAt(prompt, fb.answer);
  if (fb.result.correct) return { expected: [tapped] };
  const nearest = d2NearestTarget(prompt, fb.answer.fret);
  return nearest ? { expected: [nameAt(prompt, nearest)], given: [tapped] } : { expected: [] };
}

/** Every right cell, and the tapped cell when it was wrong. */
export function d2FeedbackPositions(
  prompt: D2Prompt,
  fb: DrillFeedback<D2Answer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: fb.result.correct ? [] : [fb.answer] };
}

function fretList(frets: readonly number[]): string {
  if (frets.length <= 1) return `fret ${frets[0] ?? '–'}`;
  return `frets ${frets.slice(0, -1).join(', ')} and ${frets.at(-1)}`;
}

/** One line of feedback naming every right fret, so octave repeats are seen too. */
export function d2Explain(prompt: D2Prompt, fb: DrillFeedback<D2Answer>): string {
  const where = `${prompt.pc} is at ${fretList(prompt.targets.map((t) => t.fret))} on string ${prompt.string}.`;
  if (fb.result.correct) return where;
  const { string, fret } = fb.answer;
  return `You tapped ${pcAt(prompt, fb.answer)} (string ${string}, fret ${fret}). ${where}`;
}

/**
 * The guide level the neck is drawn at. Guides fade as usual (design §3.5),
 * but an unanswered recall prompt must never show its answer as text on the
 * neck. Guide level 2+ names the open strings, so when one of those names is
 * the pitch class being asked for, the neck drops to inlays only (level 1).
 * Guided reps (worked examples) and feedback show everything.
 */
export function d2NeckGuideLevel(
  prompt: D2Prompt,
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

// --- Compact window -------------------------------------------------------

function clampWindow(from: number, bounds: FretRange, size: number): FretRange {
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const start = Math.max(bounds.from, Math.min(from, bounds.to - width + 1));
  return { from: start, to: start + width - 1 };
}

/**
 * The first compact window. It starts at the nut so it gives nothing away; a
 * guided rep (a worked example) opens on the target instead.
 */
export function d2InitialWindow(
  prompt: D2Prompt,
  guided: boolean,
  size = D2_WINDOW_FRETS,
): FretRange {
  const target = prompt.targets[0];
  if (guided && target) return clampWindow(target.fret - 2, prompt.activeRange, size);
  return clampWindow(prompt.activeRange.from, prompt.activeRange, size);
}

/** Slide the window by `steps` (negative = toward the nut), staying within bounds. */
export function d2SlideWindow(
  win: FretRange,
  steps: number,
  bounds: FretRange,
  step = D2_WINDOW_STEP,
): FretRange {
  return clampWindow(win.from + steps * step, bounds, win.to - win.from + 1);
}

/** The smallest slide that brings a fret into view. */
export function d2WindowContaining(win: FretRange, fret: number, bounds: FretRange): FretRange {
  const size = win.to - win.from + 1;
  if (fret < win.from) return clampWindow(fret, bounds, size);
  if (fret > win.to) return clampWindow(fret - size + 1, bounds, size);
  return win;
}

/** A window wide enough to show every given fret at once (wrong-answer feedback). */
export function d2SpanWindow(
  frets: readonly number[],
  bounds: FretRange,
  minSize = D2_WINDOW_FRETS,
): FretRange {
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  const span = hi - lo + 1;
  const size = Math.max(minSize, span);
  return clampWindow(lo - Math.floor((size - span) / 2), bounds, size);
}

// --- Keyboard path ----------------------------------------------------------

/**
 * Arrow keys move a focus cell over the live area (design §10 keyboard path).
 * Up/down follow the screen: string 1 is drawn at the top. Left/right follow
 * the neck as drawn, which a left-handed neck mirrors. Home/End jump to the
 * ends of the string. Returns null for keys it doesn't handle.
 */
export function d2MoveFocus(
  focus: Position,
  key: string,
  area: { strings: readonly number[]; range: FretRange },
  handedness: Handedness,
): Position | null {
  const strings = [...area.strings].sort((a, b) => a - b);
  const clampFret = (f: number) => Math.max(area.range.from, Math.min(area.range.to, f));
  const toward = handedness === 'left' ? -1 : 1;
  const si = Math.max(0, strings.indexOf(focus.string));
  const string = (i: number) => strings[Math.max(0, Math.min(strings.length - 1, i))] as number;
  switch (key) {
    case 'ArrowUp':
      return { string: string(si - 1), fret: clampFret(focus.fret) };
    case 'ArrowDown':
      return { string: string(si + 1), fret: clampFret(focus.fret) };
    case 'ArrowRight':
      return { string: string(si), fret: clampFret(focus.fret + toward) };
    case 'ArrowLeft':
      return { string: string(si), fret: clampFret(focus.fret - toward) };
    case 'Home':
      return { string: string(si), fret: area.range.from };
    case 'End':
      return { string: string(si), fret: area.range.to };
    default:
      return null;
  }
}

/** Where the focus cell starts: the open string of the named string, which gives nothing away. */
export function d2InitialFocus(prompt: D2Prompt, range: FretRange): Position {
  return { string: prompt.string, fret: Math.max(range.from, prompt.activeRange.from) };
}

/** The overlap of two fret ranges (the live frets that are on screen). */
export function intersectRange(a: FretRange, b: FretRange): FretRange {
  return { from: Math.max(a.from, b.from), to: Math.min(a.to, b.to) };
}
