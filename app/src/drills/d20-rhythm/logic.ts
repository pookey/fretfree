import { Rating, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../engine/config';
import { parseRhythmPatternItemId, type RhythmPattern } from '../../engine/items/rhythm-pattern';
import type { Item, TimingWindow } from '../../engine/model';
import {
  alignOnsets,
  gradeTiming,
  summariseTiming,
  type TimingGradeConfig,
  type TimingSummary,
} from '../../timing/grade';
import type { OnsetKind } from '../../timing/latency';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { PATTERNS, STEPS_PER_BAR, STEPS_PER_PULSE } from './patterns';

export { D20_ID, D20_SCOPE, d20CanTest, d20ConceptOf } from './meta';

/**
 * D20 "Tap and strum rhythm" (design §6, §12), the pure half. A bar of
 * count-in, then a one-bar rhythm played `bars` times against the timing
 * engine's click, tapped on the pad or strummed into the mic.
 *
 * Grading is the timing engine's (`timing/grade.ts`): each hit is matched to
 * the learner's nearest onset, and `gradeTiming` turns the offsets into the
 * FSRS rating with the learner's timing window (`ENGINE_CONFIG.rhythm.windows`,
 * ±30 ms target when strict). That rating replaces the speed grade (`DrillLogic.rating`). The
 * logged response time is the typical timing error (the median |offset| of
 * the on-time hits) for a rep within the window's target, and the time the rep
 * took otherwise. So a Good or Easy rep is fluent for mastery and guide
 * fading (rule 9), and a loose (Hard) or failed one is not. Speed measures
 * across drills leave D20 out (`engine/speed.ts`).
 */

const CFG = ENGINE_CONFIG.rhythm;

export interface D20Prompt {
  itemId: string;
  /** A strum card shows down and up strokes and can be strummed in mic mode. */
  kind: 'tap' | 'strum';
  pattern: RhythmPattern;
  name: string;
  hint: string;
  /** The steps of one bar that are played (`patterns.ts`). */
  hits: readonly number[];
  bpm: number;
  countInBars: number;
  bars: number;
  /** Every hit of the run, in pulses from the first beat after the count-in. */
  pulses: number[];
  /** Some hits fall on an "&", so the subdivided click helps. */
  offbeats: boolean;
}

export interface D20Answer {
  input: OnsetKind;
  /** When each hit was due, audio-clock ms (`metronome.timeAtPulse`), one per `prompt.pulses`. */
  targetsMs: number[];
  /** The learner's onsets in the run, latency taken off, audio-clock ms. */
  onsetsMs: number[];
  /** The timing window the rep is graded with: `settings.timingWindow` when it was played. */
  window: TimingWindow;
}

/** The grade for a timing window: its on-time, target and fluent windows, and the shared rest. */
export function d20GradeConfig(window: TimingWindow): TimingGradeConfig {
  return { ...CFG.grade, ...CFG.windows[window] };
}

/** A tempo from the scope level's band, a multiple of `tempoStep` (rule 12). */
export function d20Tempo(scopeLevel: number, rng: () => number): number {
  const bands = CFG.tempoBands;
  const band = bands[Math.max(0, Math.min(bands.length - 1, scopeLevel))]!;
  const [lo, hi] = band;
  const steps = Math.floor((hi - lo) / CFG.tempoStep);
  return lo + Math.min(steps, Math.floor(rng() * (steps + 1))) * CFG.tempoStep;
}

/** The hits of `bars` bars, in pulses from pulse 0. */
export function d20Pulses(hits: readonly number[], bars: number): number[] {
  const perBar = STEPS_PER_BAR / STEPS_PER_PULSE;
  return Array.from({ length: bars }, (_, bar) =>
    hits.map((step) => bar * perBar + step / STEPS_PER_PULSE),
  ).flat();
}

export function d20MakePrompt(item: Item, ctx: DrillContext): D20Prompt {
  const ref = parseRhythmPatternItemId(item.id);
  if (!ref) throw new Error(`D20 cannot test item ${item.id}`);
  const info = PATTERNS[ref.pattern];
  return {
    itemId: item.id,
    kind: ref.kind === 'strum-rhythm' ? 'strum' : 'tap',
    pattern: ref.pattern,
    name: info.name,
    hint: info.hint,
    hits: info.hits,
    bpm: d20Tempo(ctx.scopeLevel, ctx.rng),
    countInBars: CFG.countInBars,
    bars: CFG.bars,
    pulses: d20Pulses(info.hits, CFG.bars),
    offbeats: info.hits.some((s) => s % STEPS_PER_PULSE !== 0),
  };
}

export interface D20Result {
  /** Per hit, in order: the matched onset's offset (ms, + late), or `null` for a miss. */
  offsets: (number | null)[];
  extras: number;
  summary: TimingSummary;
  /** The rating before any hint cap. */
  rating: Grade;
  /** On-time hits a pass needs, with the extras counted. */
  needed: number;
}

export function d20Result(answer: D20Answer): D20Result {
  const cfg = d20GradeConfig(answer.window);
  const { offsets, extras } = alignOnsets(answer.targetsMs, answer.onsetsMs, cfg.matchMs);
  const summary = summariseTiming(offsets, cfg, extras.length);
  return {
    offsets,
    extras: extras.length,
    summary,
    rating: gradeTiming(offsets, cfg, { extras: extras.length }),
    needed: Math.ceil(cfg.passRate * (offsets.length + extras.length)),
  };
}

function extrasLine(extras: number): string {
  return extras === 0 ? '' : `, ${extras} extra ${extras === 1 ? 'hit' : 'hits'}`;
}

export function d20Check(_prompt: D20Prompt, answer: D20Answer): DrillCheck {
  const r = d20Result(answer);
  const { onTime, targets } = r.summary;
  const correct = r.rating !== Rating.Again;
  return correct
    ? { correct, expected: `${onTime} of ${targets} on time` }
    : {
        correct,
        expected: `${onTime} of ${targets} on time (${r.needed} needed${extrasLine(r.extras)})`,
      };
}

/** The timing grade, capped at Hard after a worked example (design §3.2). */
export function d20Rating(
  _prompt: D20Prompt,
  answer: D20Answer,
  { hintUsed }: { hintUsed: boolean },
): Grade {
  const r = d20Result(answer);
  return gradeTiming(r.offsets, d20GradeConfig(answer.window), {
    extras: r.extras,
    hintUsed,
  });
}

/**
 * The typical timing error of a rep within the target, so it counts as fluent;
 * the time the rep took otherwise, which is well past any speed target.
 */
export function d20GradedResponseMs(
  _prompt: D20Prompt,
  answer: D20Answer,
  elapsedMs: number,
): number {
  const { medianAbsMs } = d20Result(answer).summary;
  const { targetMs } = CFG.windows[answer.window];
  return medianAbsMs !== null && medianAbsMs <= targetMs ? medianAbsMs : elapsedMs;
}

/** Each hit's offset, for the review log: `+12 -5 miss +30, 1 extra hit`. */
export function d20DescribeAnswer(answer: D20Answer): string {
  const r = d20Result(answer);
  const hits = r.offsets.map((o) => {
    if (o === null) return 'miss';
    const ms = Math.round(o);
    return ms > 0 ? `+${ms}` : `${ms}`;
  });
  return `${answer.input}: ${hits.join(' ')}${extrasLine(r.extras)}`;
}

/** Nothing to play back: the click was the sound. */
export function d20Sounds(_prompt: D20Prompt, _feedback: DrillFeedback<D20Answer>): DrillSounds {
  return { expected: [] };
}

export type HitVerdict = 'on' | 'early' | 'late' | 'miss';

export interface HitMark {
  bar: number;
  step: number;
  offsetMs: number | null;
  verdict: HitVerdict;
}

/** Every hit of the run with how it landed, for the feedback grid. */
export function d20Marks(prompt: D20Prompt, answer: D20Answer): HitMark[] {
  const { offsets } = d20Result(answer);
  const { onTimeMs } = CFG.windows[answer.window];
  return offsets.map((o, i) => {
    const bar = Math.floor(i / prompt.hits.length);
    const step = prompt.hits[i % prompt.hits.length]!;
    let verdict: HitVerdict;
    if (o === null) verdict = 'miss';
    else if (Math.abs(o) <= onTimeMs) verdict = 'on';
    else verdict = o < 0 ? 'early' : 'late';
    return { bar, step, offsetMs: o === null ? null : Math.round(o), verdict };
  });
}

/**
 * Where a hit sits in its box, for the feedback grid: -1 at the box's left
 * edge (early), 0 on the click, 1 at its right edge (late). The edges are
 * `grade.matchMs`, the furthest a hit can be and still be this note's. The
 * scale is a square root, so a hit just outside the window sits clear of the
 * click even in a phone's small boxes.
 */
export function d20MarkX(offsetMs: number): number {
  const x = Math.sqrt(Math.min(1, Math.abs(offsetMs) / CFG.grade.matchMs));
  return offsetMs < 0 ? -x : x;
}

/** "12 ms late", "right on the click". */
export function d20DescribeOffset(ms: number): string {
  const r = Math.round(ms);
  if (Math.abs(r) < 1) return 'right on the click';
  return `${Math.abs(r)} ms ${r > 0 ? 'late' : 'early'}`;
}

/**
 * How the rep went, after the grade: how tight the on-time hits were, and
 * whether they leaned early (rushing) or late (dragging). A lean inside the
 * fluent window isn't worth mentioning.
 */
export function d20Explain(prompt: D20Prompt, feedback: DrillFeedback<D20Answer>): string {
  const r = d20Result(feedback.answer);
  const { medianAbsMs, meanOffsetMs, misses } = r.summary;
  const { onTimeMs, targetMs, fluentMs } = CFG.windows[feedback.answer.window];
  const parts: string[] = [];
  const matched = r.offsets.filter((o): o is number => o !== null);
  if (matched.length === 0) {
    parts.push('No hits landed near the rhythm. Listen to the count-in, then start on “1”.');
  } else if (medianAbsMs === null) {
    const off = Math.round(matched.reduce((sum, o) => sum + Math.abs(o), 0) / matched.length);
    const lean = matched.every((o) => o > 0)
      ? ', all late'
      : matched.every((o) => o < 0)
        ? ', all early'
        : '';
    parts.push(`Your hits were ${off} ms off on average${lean}. Within ${onTimeMs} ms counts.`);
  } else {
    parts.push(`Typically ${Math.round(medianAbsMs)} ms off (aim for ${targetMs}).`);
    if (meanOffsetMs !== null && Math.abs(meanOffsetMs) > fluentMs) {
      parts.push(
        meanOffsetMs < 0
          ? `You’re rushing: ${Math.round(-meanOffsetMs)} ms early on average.`
          : `You’re dragging: ${Math.round(meanOffsetMs)} ms late on average.`,
      );
    }
    if (misses > 0) parts.push(`${misses} missed.`);
  }
  if (r.extras > 0)
    parts.push(
      `${r.extras} extra ${r.extras === 1 ? 'hit' : 'hits'} between the rhythm’s ${prompt.kind === 'strum' ? 'strums' : 'taps'}.`,
    );
  return parts.join(' ');
}
