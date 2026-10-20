/**
 * Timing grade (design §12, §3.2), pure. Onsets are matched to their targets,
 * and the offsets become an FSRS rating with the same shape as an answer's:
 *
 * ```
 * on-time share < passRate                    → Again (wrong)
 * correct, median |offset| > targetMs         → Hard  (correct but loose)
 * correct, fluentMs < median |offset| ≤ target → Good
 * correct, median |offset| ≤ fluentMs         → Easy  (fluent)
 * ```
 *
 * An onset is on time within ±`onTimeMs`. Misses, and stray onsets that
 * match no target, count against the on-time share. Any hint caps at Hard.
 * Offsets are ms, positive when late (dragging), negative when early (rushing).
 */
import { Rating, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../engine/config';

/** `ENGINE_CONFIG.timing.grade`, widened so a drill can pass its own (D20: `targetMs: 30`). */
export interface TimingGradeConfig {
  onTimeMs: number;
  passRate: number;
  targetMs: number;
  fluentMs: number;
  matchMs: number;
}

export interface Alignment {
  /** Per target, in order: the matched onset's offset in ms, or `null` for a miss. */
  offsets: (number | null)[];
  /** Onsets near the targets that matched none of them (a doubled tap, a stray strum). */
  extras: number[];
}

/**
 * Matches each target to its nearest onset within `matchMs`, and never further
 * than half the gap to a neighbouring target, so no onset serves two targets
 * and an early onset for one target isn't a late one for the last. Onsets
 * outside the span the targets cover (a count-in tap, say) are ignored.
 * Both lists are ms on the same clock; `targetsMs` must be ascending.
 */
export function alignOnsets(
  targetsMs: readonly number[],
  onsetsMs: readonly number[],
  matchMs: number = ENGINE_CONFIG.timing.grade.matchMs,
): Alignment {
  const reach = targetsMs.map((t, i) => {
    const prev = targetsMs[i - 1];
    const next = targetsMs[i + 1];
    return {
      before: prev === undefined ? matchMs : Math.min(matchMs, (t - prev) / 2),
      after: next === undefined ? matchMs : Math.min(matchMs, (next - t) / 2),
    };
  });
  const first = targetsMs[0];
  const last = targetsMs.at(-1);
  const sorted = [...onsetsMs].sort((a, b) => a - b);
  const used = new Set<number>();
  const offsets = targetsMs.map((t, i) => {
    const r = reach[i]!;
    let best: number | null = null;
    sorted.forEach((o, j) => {
      if (used.has(j) || o < t - r.before || o > t + r.after) return;
      if (best === null || Math.abs(o - t) < Math.abs(sorted[best]! - t)) best = j;
    });
    if (best === null) return null;
    used.add(best);
    return sorted[best]! - t;
  });
  const extras =
    first === undefined || last === undefined
      ? []
      : sorted.filter(
          (o, j) =>
            !used.has(j) && o >= first - reach[0]!.before && o <= last + reach.at(-1)!.after,
        );
  return { offsets, extras };
}

export interface TimingSummary {
  /** Targets graded. */
  targets: number;
  /** Onsets within ±`onTimeMs` of their target. */
  onTime: number;
  misses: number;
  extras: number;
  /** On-time onsets over targets plus extras, 0–1. */
  onTimeRate: number;
  /** Median |offset| of the on-time onsets; `null` when none were on time. */
  medianAbsMs: number | null;
  /** Mean signed offset of the on-time onsets: + dragging, − rushing; `null` when none. */
  meanOffsetMs: number | null;
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function summariseTiming(
  offsetsMs: readonly (number | null)[],
  cfg: Pick<TimingGradeConfig, 'onTimeMs'> = ENGINE_CONFIG.timing.grade,
  extras = 0,
): TimingSummary {
  if (offsetsMs.length === 0) throw new RangeError('Timing needs at least one target');
  const onTime = offsetsMs.filter((o): o is number => o !== null && Math.abs(o) <= cfg.onTimeMs);
  return {
    targets: offsetsMs.length,
    onTime: onTime.length,
    misses: offsetsMs.filter((o) => o === null).length,
    extras,
    onTimeRate: onTime.length / (offsetsMs.length + extras),
    medianAbsMs: onTime.length ? median(onTime.map(Math.abs)) : null,
    meanOffsetMs: onTime.length ? onTime.reduce((s, o) => s + o, 0) / onTime.length : null,
  };
}

export interface TimingGradeOptions {
  /** Stray onsets (`Alignment.extras.length`). */
  extras?: number;
  /** Counting syllables or another guide was shown: the rating is capped at Hard. */
  hintUsed?: boolean;
}

/** Onset offsets → FSRS rating. See the table at the top of this file. */
export function gradeTiming(
  offsetsMs: readonly (number | null)[],
  cfg: TimingGradeConfig = ENGINE_CONFIG.timing.grade,
  opts: TimingGradeOptions = {},
): Grade {
  const s = summariseTiming(offsetsMs, cfg, opts.extras ?? 0);
  if (s.onTimeRate < cfg.passRate || s.medianAbsMs === null) return Rating.Again;
  let rating: Grade;
  if (s.medianAbsMs > cfg.targetMs) rating = Rating.Hard;
  else if (s.medianAbsMs > cfg.fluentMs) rating = Rating.Good;
  else rating = Rating.Easy;
  if (opts.hintUsed && rating > Rating.Hard) rating = Rating.Hard;
  return rating;
}
