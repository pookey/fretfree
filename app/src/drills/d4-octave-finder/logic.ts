import {
  parseOctaveItemId,
  parseOctavesItemId,
  type GuideLevel,
  type Item,
} from '../../engine/model';
import {
  allStrings,
  chromaOf,
  chromaToPc,
  crossesGBShift,
  inRange,
  midiAt,
  noteAt,
  positionsOfPitchClass,
  samePosition,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D4_SCOPES, d4ShapeLabel, d4SingleShape as singleShape, type D4Scope } from './meta';

export {
  D4_ID,
  D4_SCOPE,
  D4_SCOPES,
  d4CanTest,
  d4ConceptOf,
  d4ShapeLabel,
  type D4Scope,
} from './meta';

/**
 * D4 "Octave finder" (design §6), the pure half of the drill. It tests two
 * kinds of C1 item:
 *
 * - `octave:s6f5→s4` (single): a dot is shown; tap its octave on string 4.
 *   The answer is the octave nearest in fret (`octaveOnString`), so the G–B
 *   shift is part of the shape.
 * - `octaves:G` (every): one G is shown; tap every other G in frets 0–12.
 *   This is the multi-target drill (design §7): the whole neck on iPad,
 *   region by region on compact screens. It is graded on completion time per
 *   target (`d4GradedResponseMs`).
 *
 * The answer is the list of taps in order: one tap for a single item; for
 * every-octave items the round ends at the last target, at the first wrong
 * tap, or when the learner says they are done.
 */

/** Frets 0–12: the C1 region; above 12 the neck repeats (dimmed, not hidden). */
export const D4_REGION: FretRange = { from: 0, to: 12 };

/** How an every-octave round ends, said before it starts (copy audit §3). */
export const D4_ROUND_RULE =
  "Tap them in any order. A wrong tap ends the round; tap Done if you can't find the rest.";

/** Compact screens show single items in a window at least this wide, centred on the dot. */
export const D4_SHAPE_WINDOW_FRETS = 7;

interface D4Base {
  itemId: string;
  /** The dot's pitch class, spelled per the accidental preference. */
  pc: string;
  /** The dot the learner starts from. */
  source: Position;
  /** Every cell to tap. */
  targets: Position[];
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  /** Strings that accept taps. */
  liveStrings: number[];
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

export interface D4SinglePrompt extends D4Base {
  mode: 'single';
  /** The string the octave is on. */
  string: number;
  scope: D4Scope;
  /** Frets from the dot to its octave. */
  offset: number;
  /** The shape, e.g. "2 strings up, 3 frets higher": its confusion concept. */
  shape: string;
  /** The shape as the learner reads it, saying which way "up" is (`d4ShapeText`). */
  shapeText: string;
  /** The shape crosses the G–B strings (research/03: teach it explicitly). */
  gbShift: boolean;
  /**
   * The fret the shape lands on with the G–B shift the other way round:
   * unshifted for a shape that crosses it, shifted for one that doesn't.
   * Tapping it is logged as confusing the two shapes (research/02 rule 6).
   */
  otherFret: number;
  otherShape: string;
  otherShapeText: string;
}

export interface D4EveryPrompt extends D4Base {
  mode: 'every';
}

export type D4Prompt = D4SinglePrompt | D4EveryPrompt;

/** The taps, in order. */
export type D4Answer = readonly Position[];

export function d4ScopeFor(level: number): D4Scope {
  const i = Math.max(0, Math.min(D4_SCOPES.length - 1, Math.round(level)));
  return D4_SCOPES[i] as D4Scope;
}

/**
 * The offset of the same string move with the G–B shift the other way round.
 * Moving up across the shift adds a fret (+3 for +2, −2 for −3), so the
 * unshifted shape is one fret lower; moving down, one fret higher. A shape
 * that doesn't cross the shift is confused with the shifted one instead.
 */
export function d4OtherOffset(from: number, to: number, offset: number, tuning: Tuning): number {
  const up = to < from ? 1 : -1;
  const crosses = crossesGBShift(from, to, tuning);
  return offset + (crosses ? -up : up);
}

/**
 * A shape as the learner reads it: "2 strings up (toward string 1), 3 frets
 * higher". "Up the neck" elsewhere means toward the body, so the string move
 * names its direction. The bare `d4ShapeLabel` stays the confusion concept.
 */
export function d4ShapeText(from: number, to: number, offset: number): string {
  const label = d4ShapeLabel(from, to, offset);
  const toward = to < from ? 'up (toward string 1)' : 'down (toward string 6)';
  return label.replace(/ (up|down),/, ` ${toward},`);
}

function spell(pos: Position, tuning: Tuning, pref: AccidentalPref): string {
  return noteAt(pos, tuning, pref).pc;
}

function makeSingle(
  item: Item,
  ref: { from: Position; string: number },
  ctx: DrillContext,
): D4SinglePrompt {
  const { tuning, accidentalPref } = ctx;
  const n = stringCount(tuning);
  const shape =
    ref.from.string <= n && ref.string <= n && singleShape(ref.from, ref.string, tuning);
  if (!shape) throw new Error(`D4 cannot test item ${item.id}`);
  const scope = d4ScopeFor(ctx.scopeLevel);
  const otherOffset = d4OtherOffset(ref.from.string, ref.string, shape.offset, tuning);
  return {
    mode: 'single',
    itemId: item.id,
    pc: spell(ref.from, tuning, accidentalPref),
    source: ref.from,
    targets: [shape.target],
    activeRange: D4_REGION,
    liveStrings: scope === 'string' ? [ref.string] : allStrings(tuning),
    tuning,
    accidentalPref,
    string: ref.string,
    scope,
    offset: shape.offset,
    shape: shape.shape,
    shapeText: d4ShapeText(ref.from.string, ref.string, shape.offset),
    gbShift: crossesGBShift(ref.from.string, ref.string, tuning),
    otherFret: ref.from.fret + otherOffset,
    otherShape: d4ShapeLabel(ref.from.string, ref.string, otherOffset),
    otherShapeText: d4ShapeText(ref.from.string, ref.string, otherOffset),
  };
}

function makeEvery(item: Item, pc: string, ctx: DrillContext): D4EveryPrompt {
  const { tuning, accidentalPref } = ctx;
  const strings = allStrings(tuning);
  // Start from a dot on one of the two lowest strings, where root shapes start.
  const low = strings.slice(-2);
  const starts = positionsOfPitchClass(pc, { tuning, fretRange: D4_REGION, strings: low });
  const source = starts[Math.floor(ctx.rng() * starts.length)] ?? starts[0];
  if (!source) throw new Error(`D4 cannot test item ${item.id}`);
  const targets = positionsOfPitchClass(pc, { tuning, fretRange: D4_REGION }).filter(
    (p) => !samePosition(p, source),
  );
  return {
    mode: 'every',
    itemId: item.id,
    pc: chromaToPc(chromaOf(pc), accidentalPref),
    source,
    targets,
    activeRange: D4_REGION,
    liveStrings: strings,
    tuning,
    accidentalPref,
  };
}

export function d4MakePrompt(item: Item, ctx: DrillContext): D4Prompt {
  const single = parseOctaveItemId(item.id);
  if (single) return makeSingle(item, single, ctx);
  const every = parseOctavesItemId(item.id);
  if (every) return makeEvery(item, every.pc, ctx);
  throw new Error(`D4 cannot test item ${item.id}`);
}

/** True if a tap on this cell is an answer (dimmed cells are inert). */
export function d4IsLive(prompt: D4Prompt, pos: Position): boolean {
  return prompt.liveStrings.includes(pos.string) && inRange(pos.fret, prompt.activeRange);
}

export function d4IsTarget(prompt: D4Prompt, pos: Position): boolean {
  return prompt.targets.some((t) => samePosition(t, pos));
}

/** The targets among the taps, in tap order. */
export function d4Found(prompt: D4Prompt, taps: D4Answer): Position[] {
  return taps.filter((p) => d4IsTarget(prompt, p));
}

/** The targets not tapped. */
export function d4Missed(prompt: D4Prompt, taps: D4Answer): Position[] {
  return prompt.targets.filter((t) => !taps.some((p) => samePosition(p, t)));
}

/** Taps that are not a target (the dot itself is never an answer). */
export function d4WrongTaps(prompt: D4Prompt, taps: D4Answer): Position[] {
  return taps.filter((p) => !d4IsTarget(prompt, p) && !samePosition(p, prompt.source));
}

function pcAt(prompt: D4Prompt, pos: Position): string {
  return spell(pos, prompt.tuning, prompt.accidentalPref);
}

/**
 * `expected` is what the feedback bar prints (`2 strings up (toward string 1),
 * 3 frets higher`, `F♯`); the confusion matrix keeps the bare shape label or
 * the ASCII pitch class as its concept.
 */
function checkSingle(prompt: D4SinglePrompt, taps: D4Answer): DrillCheck {
  const tap = taps[0];
  const base = { expected: prompt.shapeText, concept: prompt.shape };
  if (tap && d4IsTarget(prompt, tap)) return { correct: true, ...base };
  if (tap && tap.string === prompt.string && tap.fret === prompt.otherFret) {
    return { correct: false, ...base, confusedWith: prompt.otherShape };
  }
  return { correct: false, ...base };
}

function checkEvery(prompt: D4EveryPrompt, taps: D4Answer): DrillCheck {
  const base = { expected: displayPc(prompt.pc), concept: prompt.pc };
  const wrong = d4WrongTaps(prompt, taps)[0];
  if (wrong) {
    const given = d4IsLive(prompt, wrong) ? pcAt(prompt, wrong) : null;
    return given
      ? { correct: false, ...base, confusedWith: given }
      : { correct: false, ...base };
  }
  return { correct: d4Missed(prompt, taps).length === 0, ...base };
}

export function d4Check(prompt: D4Prompt, taps: D4Answer): DrillCheck {
  return prompt.mode === 'single' ? checkSingle(prompt, taps) : checkEvery(prompt, taps);
}

export function d4DescribeAnswer(taps: D4Answer): string {
  return taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/** Completion time per target, so a whole-neck round meets the usual speed targets. */
export function d4GradedResponseMs(prompt: D4Prompt, _taps: D4Answer, elapsedMs: number): number {
  return prompt.mode === 'every' ? elapsedMs / Math.max(1, prompt.targets.length) : elapsedMs;
}

function nameAt(prompt: D4Prompt, pos: Position): string {
  return noteAt(pos, prompt.tuning, prompt.accidentalPref).name;
}

/** Each pitch once, low to high. */
function names(prompt: D4Prompt, positions: readonly Position[]): string[] {
  const sorted = [...positions].sort((a, b) => midiAt(a, prompt.tuning) - midiAt(b, prompt.tuning));
  return [...new Set(sorted.map((p) => nameAt(prompt, p)))];
}

/**
 * The dot and its octaves, low to high (sound, sight and name together); a
 * wrong tap adds the tapped note (design §7).
 */
export function d4Sounds(prompt: D4Prompt, fb: DrillFeedback<D4Answer>): DrillSounds {
  const expected = names(prompt, [prompt.source, ...prompt.targets]);
  const wrong = d4WrongTaps(prompt, fb.answer);
  return wrong.length > 0 ? { expected, given: names(prompt, wrong) } : { expected };
}

export function d4FeedbackPositions(
  prompt: D4Prompt,
  fb: DrillFeedback<D4Answer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: d4WrongTaps(prompt, fb.answer) };
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

function explainSingle(prompt: D4SinglePrompt, fb: DrillFeedback<D4Answer>): string {
  const target = prompt.targets[0] as Position;
  const shift = prompt.gbShift
    ? ' The shape crosses the G–B strings, which are a fret closer, so it shifts a fret.'
    : '';
  const answer = `The octave is at ${where(target)}: ${prompt.shapeText}.${shift}`;
  const tap = fb.answer[0];
  if (fb.result.correct || !tap) return answer;
  const tapped = `You tapped ${displayPc(pcAt(prompt, tap))} (${where(tap)}).`;
  if (fb.result.confusedWith) {
    const why = prompt.gbShift
      ? `That is the shape without the G–B shift: ${prompt.otherShapeText}.`
      : `This shape doesn't cross the G–B strings, so there is no extra fret.`;
    return `${tapped} ${why} ${answer}`;
  }
  return `${tapped} ${answer}`;
}

function explainEvery(prompt: D4EveryPrompt, fb: DrillFeedback<D4Answer>): string {
  if (fb.result.correct) return `That's every ${displayPc(prompt.pc)} in frets 0–12.`;
  const missed = d4Missed(prompt, fb.answer).length;
  const left =
    missed > 0 ? `${missed} ${missed === 1 ? 'is' : 'are'} still to find, ringed on the neck.` : '';
  const wrong = d4WrongTaps(prompt, fb.answer)[0];
  if (!wrong) return left;
  return `You tapped ${displayPc(pcAt(prompt, wrong))} (${where(wrong)}). ${left}`.trim();
}

/** One line of feedback naming the shape, or what was missed. */
export function d4Explain(prompt: D4Prompt, fb: DrillFeedback<D4Answer>): string {
  return prompt.mode === 'single' ? explainSingle(prompt, fb) : explainEvery(prompt, fb);
}

/**
 * The guide level the neck is drawn at. Guides fade as usual (design §3.5),
 * but string names at guide level 2+ would name a fret-0 answer, so before
 * an answer the neck drops to inlays only (level 1) when an open string has
 * the dot's pitch class. Guided reps (worked examples) show everything.
 */
export function d4NeckGuideLevel(
  prompt: D4Prompt,
  guideLevel: GuideLevel,
  opts: { guided: boolean; answered: boolean },
): GuideLevel {
  if (opts.guided) return 3;
  if (opts.answered || guideLevel < 2) return guideLevel;
  const chroma = chromaOf(prompt.pc);
  const named = allStrings(prompt.tuning).some(
    (string) => noteAt({ string, fret: 0 }, prompt.tuning).chroma === chroma,
  );
  return named ? 1 : guideLevel;
}

/** Every-octave rounds show the target count only while guides are up (rule 9). */
export function d4ShowsCount(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= 2;
}

// --- Compact layout -------------------------------------------------------

function clampWindow(from: number, bounds: FretRange, size: number): FretRange {
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const start = Math.max(bounds.from, Math.min(from, bounds.to - width + 1));
  return { from: start, to: start + width - 1 };
}

/**
 * The rounds of a region-by-region every-octave round (design §7 iPhone),
 * from `neckRegions` and `targetsByRegion`. The round starts in the region
 * nearest the dot, so octave shapes can be read from it, then works outward.
 */
export function d4RoundOrder<T extends { region: FretRange }>(
  rounds: readonly T[],
  dotFret: number,
): T[] {
  const distance = ({ region }: T) =>
    dotFret < region.from ? region.from - dotFret : Math.max(0, dotFret - region.to);
  return [...rounds].sort((a, b) => distance(a) - distance(b) || a.region.from - b.region.from);
}

/** The frets on screen for a region: a full window, so a short region keeps its cell size. */
export function d4RegionWindow(region: FretRange, bounds: FretRange, size: number): FretRange {
  return clampWindow(region.from, bounds, size);
}

/** The compact window for a single item: centred on the dot, wide enough for any octave shape. */
export function d4ShapeWindow(prompt: D4Prompt, compactFrets = D4_SHAPE_WINDOW_FRETS): FretRange {
  const size = Math.max(D4_SHAPE_WINDOW_FRETS, compactFrets);
  return clampWindow(prompt.source.fret - Math.floor(size / 2), prompt.activeRange, size);
}

export function d4TargetsIn(prompt: D4Prompt, range: FretRange): Position[] {
  return prompt.targets.filter((t) => inRange(t.fret, range));
}
