import type { Item } from '../../engine/model';
import {
  allStrings,
  inRange,
  intervalFromRoot,
  intervalInfo,
  intervalSemitones,
  intervalShape,
  noteAt,
  openStringMidi,
  positionForInterval,
  positionsForInterval,
  samePosition,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type IntervalName,
  type Position,
  type Tuning,
} from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D6_SCOPES, conceptFor, tapRef, type D6Scope } from './meta';

export {
  D6_ID,
  D6_SCOPE,
  D6_SCOPES,
  GB_SHIFT_SUFFIX,
  d6CanTest,
  d6ConceptOf,
  type D6Scope,
} from './meta';

/**
 * D6 "Tap the M3/P5/b7 from a root" (design §6, research/03 C3): name →
 * position for interval shapes, the pure half of the drill. An item such as
 * `interval:M3@s6→s5` is one shape; each prompt puts its root on a fresh fret
 * so the shape is met in many keys and neck positions (research/02 rule 12).
 *
 * Any correct position in the active region counts, in any octave and on
 * either side of the root: the drill trains chord-tone degrees, and the 3rd
 * below a root is still that chord's 3rd.
 */

/** Frets 0–12: the whole region, and the bounds every prompt stays within. */
export const D6_NECK: FretRange = { from: 0, to: 12 };
/** The hand position: a 5-fret box around the root, which also fits a compact screen. */
export const D6_BOX_FRETS = 5;
/** Roots go on fretted notes, so every shape is a movable shape. */
const ROOT_FRETS: FretRange = { from: 1, to: 12 };

export interface D6Prompt {
  itemId: string;
  interval: IntervalName;
  root: Position;
  /** The cell the item's shape lands on: the interval above the root on the shape's upper string. */
  shapeTarget: Position;
  /** The shape crosses the G–B pair, so it sits one fret higher than the all-fourths shape. */
  gbShift: boolean;
  scope: D6Scope;
  /** The hand position around the root and the shape target. */
  box: FretRange;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  /** Strings that accept taps. */
  liveStrings: number[];
  /** Every correct cell: the interval's degree in the active region. */
  targets: Position[];
  /** The concept and the feedback text, e.g. `M3` or `M3 (G–B shift)`. */
  expected: string;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The answer is the tapped cell. */
export type D6Answer = Position;

export function d6ScopeFor(level: number): D6Scope {
  const i = Math.max(0, Math.min(D6_SCOPES.length - 1, Math.round(level)));
  return D6_SCOPES[i] as D6Scope;
}

/** How far a shape between two strings sits above the all-fourths shape (1 across G–B). */
function shiftFrets(from: number, to: number, tuning: Tuning): number {
  const fourths = 5 * (from - to);
  return fourths - (openStringMidi(to, tuning) - openStringMidi(from, tuning));
}

/** Root frets whose shape target stays on frets 0–12. */
export function d6RootFrets(
  interval: IntervalName,
  from: number,
  to: number,
  tuning: Tuning,
): number[] {
  const out: number[] = [];
  for (let fret = ROOT_FRETS.from; fret <= ROOT_FRETS.to; fret++) {
    const target = positionForInterval({ string: from, fret }, interval, to, { tuning });
    if (target && inRange(target.fret, D6_NECK)) out.push(fret);
  }
  return out;
}

/** A box of at least `size` frets holding every given fret, centred on them and kept within frets 0–12. */
export function d6Box(frets: readonly number[], size = D6_BOX_FRETS): FretRange {
  const lo = Math.max(D6_NECK.from, Math.min(...frets));
  const hi = Math.min(D6_NECK.to, Math.max(...frets));
  const width = Math.max(size, hi - lo + 1);
  const ideal = lo - Math.floor((width - (hi - lo + 1)) / 2);
  const from = Math.max(D6_NECK.from, Math.min(ideal, D6_NECK.to - width + 1));
  return { from, to: from + width - 1 };
}

export function d6MakePrompt(item: Item, ctx: DrillContext): D6Prompt {
  const ref = tapRef(item);
  const strings = stringCount(ctx.tuning);
  if (!ref || ref.from > strings || ref.to > strings || ref.from === ref.to) {
    throw new Error(`D6 cannot test item ${item.id}`);
  }
  const frets = d6RootFrets(ref.interval, ref.from, ref.to, ctx.tuning);
  if (frets.length === 0) throw new Error(`D6 cannot place item ${item.id} on frets 0–12`);
  const rootFret = frets[Math.min(frets.length - 1, Math.floor(ctx.rng() * frets.length))]!;
  const root = { string: ref.from, fret: rootFret };
  const shapeTarget = positionForInterval(root, ref.interval, ref.to, {
    tuning: ctx.tuning,
  }) as Position;
  const gbShift = intervalShape(ref.interval, ref.from, ref.to, ctx.tuning).gbShift;
  const scope = d6ScopeFor(ctx.scopeLevel);
  // The box also holds the unshifted shape, so forgetting the G–B shift is a
  // live (and diagnosable) tap rather than a dead one.
  const unshifted = gbShift ? shapeTarget.fret - shiftFrets(ref.from, ref.to, ctx.tuning) : null;
  const box = d6Box([root.fret, shapeTarget.fret, ...(unshifted === null ? [] : [unshifted])]);
  const activeRange = scope === 'neck' ? D6_NECK : box;
  const liveStrings = scope === 'shape' ? [ref.to] : allStrings(ctx.tuning);
  return {
    itemId: item.id,
    interval: ref.interval,
    root,
    shapeTarget,
    gbShift,
    scope,
    box,
    activeRange,
    liveStrings,
    targets: positionsForInterval(root, ref.interval, {
      tuning: ctx.tuning,
      fretRange: activeRange,
      strings: liveStrings,
    }),
    expected: conceptFor(ref.interval, gbShift),
    tuning: ctx.tuning,
    accidentalPref: ctx.accidentalPref,
  };
}

/** True if a tap on this cell is an answer (dimmed cells are inert). */
export function d6IsLive(prompt: D6Prompt, pos: Position): boolean {
  return prompt.liveStrings.includes(pos.string) && inRange(pos.fret, prompt.activeRange);
}

/**
 * Where the shape would land without the G–B shift: the all-fourths shape,
 * one fret below the real one. Null for shapes that don't cross G–B.
 */
export function d6UnshiftedTarget(prompt: D6Prompt): Position | null {
  if (!prompt.gbShift) return null;
  const { root, shapeTarget, tuning } = prompt;
  return {
    string: shapeTarget.string,
    fret: shapeTarget.fret - shiftFrets(root.string, shapeTarget.string, tuning),
  };
}

/** True if the tap is the shape without its G–B shift: the misconception research/03 names. */
export function d6ForgotShift(prompt: D6Prompt, answer: D6Answer): boolean {
  const unshifted = d6UnshiftedTarget(prompt);
  return unshifted !== null && samePosition(unshifted, answer);
}

export function d6Check(prompt: D6Prompt, answer: D6Answer): DrillCheck {
  const expected = prompt.expected;
  if (prompt.targets.some((t) => samePosition(t, answer))) return { correct: true, expected };
  if (!d6IsLive(prompt, answer)) return { correct: false, expected };
  // Forgetting the shift is confused with the unshifted shape, so the session
  // pairs shifted and unshifted items of this interval (research/02 rule 6).
  if (d6ForgotShift(prompt, answer)) {
    return { correct: false, expected, confusedWith: conceptFor(prompt.interval, false) };
  }
  const given = intervalFromRoot(prompt.root, answer, prompt.tuning);
  // The root itself, or its octave, isn't an interval the drill teaches.
  return given === 'P1' || given === 'P8'
    ? { correct: false, expected }
    : { correct: false, expected, confusedWith: given };
}

export function d6DescribeAnswer(answer: D6Answer): string {
  return `s${answer.string}f${answer.fret}`;
}

/** The target closest to a cell, so a wrong tap is paired with the nearest right one. */
export function d6NearestTarget(prompt: D6Prompt, pos: Position): Position | null {
  const dist = (p: Position) => Math.abs(p.fret - pos.fret) + Math.abs(p.string - pos.string);
  let best: Position | null = null;
  for (const t of prompt.targets) if (!best || dist(t) < dist(best)) best = t;
  return best;
}

function nameAt(prompt: D6Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).name;
}

/**
 * The root, then the interval (research/03 C3): the tapped note when right;
 * when wrong, the nearest right note, then the tapped one.
 */
export function d6Sounds(prompt: D6Prompt, fb: DrillFeedback<D6Answer>): DrillSounds {
  const root = nameAt(prompt, prompt.root);
  const tapped = nameAt(prompt, fb.answer);
  if (fb.result.correct) return { expected: [root, tapped] };
  const nearest = d6NearestTarget(prompt, fb.answer);
  return nearest
    ? { expected: [root, nameAt(prompt, nearest)], given: [tapped] }
    : { expected: [root] };
}

/** Every right cell, and the tapped cell when it was wrong. */
export function d6FeedbackPositions(
  prompt: D6Prompt,
  fb: DrillFeedback<D6Answer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: fb.result.correct ? [] : [fb.answer] };
}

// --- Wording ----------------------------------------------------------------

/** `major 3rd`, `perfect 5th`, `minor 7th`. */
export function d6IntervalName(interval: IntervalName): string {
  return intervalInfo(interval).long;
}

/**
 * The degree a cell is above the root, as the neck labels it: `R`, `3`, `♭7`.
 * The theory's degree IDs stay ASCII (`b7`); the learner reads the glyph.
 */
export function d6DegreeAt(prompt: D6Prompt, pos: Position): string {
  const iv = intervalFromRoot(prompt.root, pos, prompt.tuning);
  return iv === 'P1' || iv === 'P8' ? 'R' : displayPc(intervalInfo(iv).degree);
}

function frets(n: number): string {
  return n === 1 ? '1 fret' : `${n} frets`;
}

/** Where the shape lands from the root, e.g. `string 5, 1 fret toward the nut`. */
export function d6ShapeHint(prompt: D6Prompt): string {
  const offset = prompt.shapeTarget.fret - prompt.root.fret;
  const where =
    offset === 0
      ? 'the same fret'
      : offset < 0
        ? `${frets(-offset)} toward the nut`
        : `${frets(offset)} up the neck`;
  return `string ${prompt.shapeTarget.string}, ${where}`;
}

const SHIFT_RULE = 'Crossing the G and B strings, a shape moves up 1 fret.';

/** The worked example for a guided first rep (research/02 rule 8). */
export function d6WorkedExample(prompt: D6Prompt): string {
  const base = `This is the ${d6IntervalName(prompt.interval)} above the root: ${d6ShapeHint(prompt)}.`;
  return prompt.gbShift ? `${base} ${SHIFT_RULE}` : base;
}

/** The recall question, without the interval name's emphasis. */
export function d6Question(prompt: D6Prompt): { before: string; after: string } {
  return prompt.scope === 'shape'
    ? { before: 'Tap the ', after: ` above the root on string ${prompt.shapeTarget.string}` }
    : { before: 'Tap a ', after: ' from the root, on any string' };
}

/** Where taps count, shown under an unanswered question. */
export function d6Hint(prompt: D6Prompt): string {
  if (prompt.scope === 'shape') return `Tap the fret on string ${prompt.shapeTarget.string}.`;
  const { from, to } = prompt.activeRange;
  return `Any string, frets ${from}–${to}. Above or below the root both count.`;
}

/** One line of feedback: what was tapped, and the shape that answers it. */
export function d6Explain(prompt: D6Prompt, fb: DrillFeedback<D6Answer>): string {
  const name = d6IntervalName(prompt.interval);
  const shape = `The ${name} shape: ${d6ShapeHint(prompt)}.`;
  const shift = prompt.gbShift ? ` ${SHIFT_RULE}` : '';
  if (fb.result.correct) return `${shape}${shift}`;
  if (d6ForgotShift(prompt, fb.answer)) {
    return `That's the shape without the G–B shift. ${SHIFT_RULE} ${shape}`;
  }
  const degree = d6DegreeAt(prompt, fb.answer);
  const tapped =
    degree === 'R'
      ? 'the root'
      : `the ${degree} (${d6IntervalName(intervalFromRoot(prompt.root, fb.answer, prompt.tuning))})`;
  return `You tapped ${tapped}. ${shape}${shift}`;
}

/** Semitones the drill asks for, for the context panel. */
export function d6Semitones(prompt: D6Prompt): number {
  return intervalSemitones(prompt.interval);
}
