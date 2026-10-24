import { Rating, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../engine/config';
import {
  parseAccentItemId,
  type AccentPattern,
  type CountPattern,
} from '../../engine/items/accent';
import type { GuideLevel, Item, TimingWindow } from '../../engine/model';
import { fadeLadder, type ClickFade } from '../../timing/fade';
import {
  alignOnsets,
  gradeTiming,
  summariseTiming,
  type TimingGradeConfig,
  type TimingSummary,
} from '../../timing/grade';
import type { OnsetKind } from '../../timing/latency';
import type { ClickMeter } from '../../timing/meter';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { accentBar, countBar, type Bar, type Stroke } from './patterns';

export { D31_ID, D31_SCOPE, d31CanTest, d31ConceptOf } from './meta';

/**
 * D31 "Accent and strum in meter" (design §6, §12), the pure half. A bar of
 * count-in, then a bar tapped or strummed `bars` times against the timing
 * engine's click, some strokes strong and the rest soft.
 *
 * **The click fades** (design §12, guidance hypothesis): a rep starts on a
 * rung of the fade ladder (`timing/fade.ts`) set by the guide level, and
 * climbs it bar by bar while the strokes are right, so the learner carries
 * the pulse and the bar alone. A dropped click is still on the grid and
 * still graded.
 *
 * **Grading** is the timing engine's: each stroke is matched to the
 * learner's nearest onset and `gradeTiming` turns the offsets into the FSRS
 * rating with the learner's timing window (`ENGINE_CONFIG.rhythm.windows`,
 * shared with D20). A stroke with the wrong accent counts as a miss: it was
 * played, but not the stroke asked for. On the pads the accent is the pad
 * (strong or soft); from the mic it is how loud a strum is against the
 * others (`d31HeardAccents`). The logged response time is the typical timing
 * error of a rep within the window's target and the rep's length otherwise,
 * as D20's, so only a Good or Easy rep is fluent (rule 9).
 */

const CFG = ENGINE_CONFIG.accentStrum;

export interface D31Prompt {
  itemId: string;
  kind: 'count' | 'accent';
  pattern: CountPattern | AccentPattern;
  meter: string;
  /** What the prompt calls the bar. */
  name: string;
  hint: string;
  /** A strumming pattern: strokes show down and up, and it starts on the mic in mic mode. */
  strum: boolean;
  click: ClickMeter;
  stepsPerPulse: number;
  steps: number;
  hits: readonly number[];
  accents: readonly number[];
  strokes: readonly Stroke[] | null;
  syllables: readonly string[];
  beatStarts: readonly number[];
  /** Click pulses a minute. */
  bpm: number;
  countInBars: number;
  bars: number;
  /** Every stroke of the run, in pulses from the first beat after the count-in. */
  pulses: number[];
  /** Per stroke of the run: whether it is accented. */
  accented: boolean[];
  /** The click's fade ladder for this bar, fullest first; the view starts on a rung by guide level. */
  ladder: ClickFade[];
}

/** An onset as graded: when (audio-clock ms, latency taken off) and how hard. */
export interface D31Onset {
  at: number;
  strength: number;
}

export interface D31Answer {
  input: OnsetKind;
  /** When each stroke was due, audio-clock ms, one per `prompt.pulses`. */
  targetsMs: number[];
  onsets: D31Onset[];
  window: TimingWindow;
  /** The fade rung each bar was played on. */
  rungs: number[];
}

/** The grade for a timing window: the engine's shared grade with the window's own limits. */
export function d31GradeConfig(window: TimingWindow): TimingGradeConfig {
  return { ...ENGINE_CONFIG.timing.grade, ...ENGINE_CONFIG.rhythm.windows[window] };
}

export function d31Bar(item: Item): Bar {
  const ref = parseAccentItemId(item.id);
  if (!ref) throw new Error(`D31 cannot test item ${item.id}`);
  return ref.kind === 'count' ? countBar(ref.pattern) : accentBar(ref.pattern);
}

/**
 * A tempo in click pulses a minute from the scope level's band (rule 12): a
 * multiple of `tempoStep`, an eighth-note meter's at twice the quarter tempo,
 * and slowed so the strokes come no faster than `maxStrokesPerMinute`.
 */
export function d31Tempo(bar: Bar, scopeLevel: number, rng: () => number): number {
  const bands = CFG.tempoBands;
  const [lo, hi] = bands[Math.max(0, Math.min(bands.length - 1, scopeLevel))]!;
  const steps = Math.floor((hi - lo) / CFG.tempoStep);
  const quarter = lo + Math.min(steps, Math.floor(rng() * (steps + 1))) * CFG.tempoStep;
  const pulse = (quarter * bar.ts.bottom) / 4;
  const fastest = CFG.maxStrokesPerMinute / bar.stepsPerPulse;
  return Math.min(pulse, Math.floor(fastest / CFG.tempoStep) * CFG.tempoStep);
}

/** The rung a rep starts on: higher (less click) as the guides fade. */
export function d31StartRung(guideLevel: GuideLevel, rungs: number): number {
  const rung = CFG.startRung[guideLevel] ?? 0;
  return Math.max(0, Math.min(rungs - 1, rung));
}

export function d31MakePrompt(item: Item, ctx: DrillContext): D31Prompt {
  const bar = d31Bar(item);
  const ref = parseAccentItemId(item.id)!;
  const ladder = fadeLadder(bar.click, bar.stepsPerPulse);
  const strokes = Array.from({ length: CFG.bars }, (_, b) =>
    bar.hits.map((s) => ({ b, s })),
  ).flat();
  return {
    itemId: item.id,
    kind: ref.kind,
    pattern: ref.pattern,
    meter: bar.meter,
    name: bar.name,
    hint: bar.hint,
    strum: bar.strokes !== null,
    click: bar.click,
    stepsPerPulse: bar.stepsPerPulse,
    steps: bar.steps,
    hits: bar.hits,
    accents: bar.accents,
    strokes: bar.strokes,
    syllables: bar.syllables,
    beatStarts: bar.beatStarts,
    bpm: d31Tempo(bar, ctx.scopeLevel, ctx.rng),
    countInBars: CFG.countInBars,
    bars: CFG.bars,
    pulses: strokes.map(({ b, s }) => b * bar.ts.top + s / bar.stepsPerPulse),
    accented: strokes.map(({ s }) => bar.accents.includes(s)),
    ladder,
  };
}

/**
 * Which strokes were played strong, from their onsets' strengths. A pad tap
 * is strong from the accent pad. A strum is strong when it stands out from
 * the take's others: with the loudest at least `micContrast` times the
 * quietest, louder than their geometric mean. All strummed alike, none is.
 */
export function d31HeardAccents(input: OnsetKind, strengths: readonly number[]): boolean[] {
  const { tapAccentMin, micContrast } = CFG.accents;
  if (input === 'tap') return strengths.map((s) => s >= tapAccentMin);
  if (strengths.length === 0) return [];
  const lo = Math.max(Math.min(...strengths), Number.EPSILON);
  const hi = Math.max(...strengths);
  if (hi < lo * micContrast) return strengths.map(() => false);
  const mid = Math.sqrt(lo * hi);
  return strengths.map((s) => s >= mid);
}

/**
 * Per stroke, whether its onset was heard as an accent (`null` for a miss).
 * `alignOnsets` gives each stroke's offset from its target, which finds the
 * onset it matched.
 */
function heardPerStroke(
  input: OnsetKind,
  targetsMs: readonly number[],
  offsets: readonly (number | null)[],
  onsets: readonly D31Onset[],
): (boolean | null)[] {
  const matched = offsets.map((o, i) =>
    o === null ? null : onsets.find((on) => Math.abs(on.at - (targetsMs[i]! + o)) < 1e-6)!,
  );
  const strong = d31HeardAccents(
    input,
    matched.filter((m): m is D31Onset => m !== null).map((m) => m.strength),
  );
  let k = 0;
  return matched.map((m) => (m === null ? null : strong[k++]!));
}

export type StrokeVerdict = 'on' | 'early' | 'late' | 'miss' | 'loud' | 'soft';

export interface Scored {
  /** Per stroke: the matched onset's offset (ms, + late), or `null` for a miss. */
  offsets: (number | null)[];
  /** Per stroke: whether its onset was heard as an accent; `null` for a miss. */
  heard: (boolean | null)[];
  /** Per stroke: how it went. */
  verdicts: StrokeVerdict[];
  /** The offsets `gradeTiming` sees: a stroke with the wrong accent is a miss. */
  graded: (number | null)[];
  extras: number;
}

/**
 * Scores strokes against onsets: timing first (`alignOnsets`, the grade's
 * on-time window), then each matched stroke's accent.
 */
export function d31Score(
  input: OnsetKind,
  window: TimingWindow,
  targetsMs: readonly number[],
  accented: readonly boolean[],
  onsets: readonly D31Onset[],
): Scored {
  const cfg = d31GradeConfig(window);
  const { offsets, extras } = alignOnsets(
    targetsMs,
    onsets.map((o) => o.at),
    cfg.matchMs,
  );
  const heard = heardPerStroke(input, targetsMs, offsets, onsets);
  const verdicts = offsets.map((o, i): StrokeVerdict => {
    if (o === null) return 'miss';
    if (Math.abs(o) > cfg.onTimeMs) return o < 0 ? 'early' : 'late';
    if (heard[i] !== accented[i]) return accented[i] ? 'soft' : 'loud';
    return 'on';
  });
  return {
    offsets,
    heard,
    verdicts,
    graded: offsets.map((o, i) => (verdicts[i] === 'loud' || verdicts[i] === 'soft' ? null : o)),
    extras: extras.length,
  };
}

/** The share of strokes played right, with stray onsets counted against it: what the fade climbs on. */
export function d31RightRate(scored: Scored): number {
  const right = scored.verdicts.filter((v) => v === 'on').length;
  return right / Math.max(1, scored.verdicts.length + scored.extras);
}

export interface D31Result extends Scored {
  summary: TimingSummary;
  /** Strokes on time with the wrong accent. */
  accentErrors: number;
  /** The rating before any hint cap. */
  rating: Grade;
  /** Right strokes a pass needs, with the extras counted. */
  needed: number;
}

export function d31Result(prompt: D31Prompt, answer: D31Answer): D31Result {
  const cfg = d31GradeConfig(answer.window);
  const scored = d31Score(
    answer.input,
    answer.window,
    answer.targetsMs,
    prompt.accented,
    answer.onsets,
  );
  return {
    ...scored,
    summary: summariseTiming(scored.graded, cfg, scored.extras),
    accentErrors: scored.verdicts.filter((v) => v === 'loud' || v === 'soft').length,
    rating: gradeTiming(scored.graded, cfg, { extras: scored.extras }),
    needed: Math.ceil(cfg.passRate * (scored.graded.length + scored.extras)),
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function d31Check(prompt: D31Prompt, answer: D31Answer): DrillCheck {
  const r = d31Result(prompt, answer);
  const { onTime, targets } = r.summary;
  const correct = r.rating !== Rating.Again;
  if (correct) return { correct, expected: `${onTime} of ${targets} right` };
  const why = [
    r.accentErrors > 0 ? plural(r.accentErrors, 'accent') + ' off' : '',
    r.extras > 0 ? plural(r.extras, 'extra stroke') : '',
  ].filter(Boolean);
  return {
    correct,
    expected: `${onTime} of ${targets} right (${r.needed} needed${why.length ? `; ${why.join(', ')}` : ''})`,
  };
}

/** The timing grade, capped at Hard after a worked example (design §3.2). */
export function d31Rating(
  prompt: D31Prompt,
  answer: D31Answer,
  { hintUsed }: { hintUsed: boolean },
): Grade {
  const r = d31Result(prompt, answer);
  return gradeTiming(r.graded, d31GradeConfig(answer.window), { extras: r.extras, hintUsed });
}

/** The typical timing error of a rep within the target, so it is fluent; the rep's length otherwise. */
export function d31GradedResponseMs(
  prompt: D31Prompt,
  answer: D31Answer,
  elapsedMs: number,
): number {
  const { medianAbsMs } = d31Result(prompt, answer).summary;
  const { targetMs } = ENGINE_CONFIG.rhythm.windows[answer.window];
  return medianAbsMs !== null && medianAbsMs <= targetMs ? medianAbsMs : elapsedMs;
}

/**
 * Each stroke for the review log, as played: its offset, and `!` when it was
 * strong. `tap: +12!, -5, miss, +30; click rungs 0 0 1 2`. The log has no
 * prompt, so it records what was heard, not whether it was asked for.
 */
export function d31DescribeAnswer(answer: D31Answer): string {
  const { offsets } = alignOnsets(
    answer.targetsMs,
    answer.onsets.map((o) => o.at),
    d31GradeConfig(answer.window).matchMs,
  );
  const heard = heardPerStroke(answer.input, answer.targetsMs, offsets, answer.onsets);
  const strokes = offsets.map((o, i) => {
    if (o === null) return 'miss';
    const ms = Math.round(o);
    return `${ms > 0 ? `+${ms}` : `${ms}`}${heard[i] ? '!' : ''}`;
  });
  return `${answer.input}: ${strokes.join(', ')}; click rungs ${answer.rungs.join(' ')}`;
}

/** Nothing to play back: the click was the sound. */
export function d31Sounds(_prompt: D31Prompt, _feedback: DrillFeedback<D31Answer>): DrillSounds {
  return { expected: [] };
}

export interface StrokeMark {
  bar: number;
  step: number;
  accented: boolean;
  offsetMs: number | null;
  verdict: StrokeVerdict;
}

/** Every stroke of the run with how it landed, for the feedback grid. */
export function d31Marks(prompt: D31Prompt, answer: D31Answer): StrokeMark[] {
  const r = d31Result(prompt, answer);
  return r.offsets.map((o, i) => ({
    bar: Math.floor(i / prompt.hits.length),
    step: prompt.hits[i % prompt.hits.length]!,
    accented: prompt.accented[i]!,
    offsetMs: o === null ? null : Math.round(o),
    verdict: r.verdicts[i]!,
  }));
}

/** What a fade step leaves of the click, for the status line and the results. */
export function d31DescribeFade(
  prompt: Pick<D31Prompt, 'click' | 'stepsPerPulse'>,
  fade: ClickFade,
): string {
  const groups = prompt.click.groups.length;
  switch (fade.keep) {
    case 'all':
      return prompt.stepsPerPulse > 1 ? 'every step' : 'every beat';
    case 'pulses':
      return 'every beat';
    case 'accents':
      return groups > 1 ? 'the start of each beat group' : 'beat 1';
    case 'bars': {
      const every = fade.everyBars ?? 1;
      return every === 1 ? 'beat 1' : `beat 1 of every ${every === 2 ? '2nd' : `${every}th`} bar`;
    }
    case 'none':
      return 'none';
  }
}

/** "Click: beat 1 only", "No click". */
export function d31ClickLine(prompt: D31Prompt, rung: number): string {
  const fade = prompt.ladder[Math.max(0, Math.min(prompt.ladder.length - 1, rung))]!;
  const what = d31DescribeFade(prompt, fade);
  return what === 'none' ? 'No click: keep the pulse yourself' : `Click: ${what}`;
}

/** "12 ms late", "right on the click". */
export function d31DescribeOffset(ms: number): string {
  const r = Math.round(ms);
  if (Math.abs(r) < 1) return 'right on the click';
  return `${Math.abs(r)} ms ${r > 0 ? 'late' : 'early'}`;
}

/**
 * How the rep went, after the grade: the timing (how tight, rushing or
 * dragging), the accents that were off, and how far the click faded.
 */
export function d31Explain(prompt: D31Prompt, feedback: DrillFeedback<D31Answer>): string {
  const { answer } = feedback;
  const r = d31Result(prompt, answer);
  const { onTimeMs, targetMs, fluentMs } = ENGINE_CONFIG.rhythm.windows[answer.window];
  const parts: string[] = [];
  const matched = r.offsets.filter((o): o is number => o !== null);
  const timed = r.offsets.filter((o): o is number => o !== null && Math.abs(o) <= onTimeMs);
  if (matched.length === 0) {
    parts.push('No strokes landed near the bar. Listen to the count-in, then start on “1”.');
  } else if (timed.length === 0) {
    const off = Math.round(matched.reduce((sum, o) => sum + Math.abs(o), 0) / matched.length);
    parts.push(`Your strokes were ${off} ms off on average. Within ${onTimeMs} ms counts.`);
  } else {
    const median = [...timed].map(Math.abs).sort((a, b) => a - b)[timed.length >> 1]!;
    const mean = timed.reduce((sum, o) => sum + o, 0) / timed.length;
    parts.push(`Typically ${Math.round(median)} ms off (aim for ${targetMs}).`);
    if (Math.abs(mean) > fluentMs)
      parts.push(
        mean < 0
          ? `You’re rushing: ${Math.round(-mean)} ms early on average.`
          : `You’re dragging: ${Math.round(mean)} ms late on average.`,
      );
  }
  const soft = r.verdicts.filter((v) => v === 'soft').length;
  const loud = r.verdicts.filter((v) => v === 'loud').length;
  if (soft > 0) parts.push(`${plural(soft, 'accent')} played soft.`);
  if (loud > 0) parts.push(`${plural(loud, 'soft stroke')} played strong.`);
  if (soft + loud > 0 && answer.input === 'mic')
    parts.push('Strum the accents clearly harder than the rest.');
  const top = Math.max(0, ...answer.rungs);
  if (top > 0 && top >= prompt.ladder.length - 1) parts.push('The click dropped out altogether.');
  else if (top > 0)
    parts.push(`The click faded to ${d31DescribeFade(prompt, prompt.ladder[top]!)}.`);
  return parts.join(' ');
}
