import { ENGINE_CONFIG } from '../../engine/config';
import type { FretRange, Position } from '../../theory';

/**
 * The pure side of latency calibration (design §3.2, §4 step 5): which dot
 * lights next, how long to wait before it does, and how a run of tap times
 * becomes the baseline. The view owns the clock and passes times in.
 */

export type CalibrationConfig = typeof ENGINE_CONFIG.calibration;

/** The median of `xs`, or null when empty. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The `p` quantile (0–1) of sorted, non-empty `xs`, interpolating linearly. */
export function quantile(sorted: readonly number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/**
 * Drop implausible taps (anticipations and lapses outside `validMs`), then
 * anything beyond the Tukey fences of what remains. Keeps the input order.
 */
export function trimOutliers(
  samples: readonly number[],
  cfg: Pick<CalibrationConfig, 'validMs' | 'outlierIqr'> = ENGINE_CONFIG.calibration,
): number[] {
  const valid = samples.filter((ms) => ms >= cfg.validMs.min && ms <= cfg.validMs.max);
  if (valid.length < 4) return valid;
  const sorted = [...valid].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const reach = cfg.outlierIqr * (q3 - q1);
  return valid.filter((ms) => ms >= q1 - reach && ms <= q3 + reach);
}

export interface CalibrationResult {
  /** The rounded trimmed median, or null when too few taps were usable. */
  baselineMs: number | null;
  /** The taps that counted. */
  kept: number[];
}

/**
 * The latency baseline from one run's tap times, in trial order: skip the
 * warm-up taps, trim outliers, and take the median of the rest.
 */
export function latencyBaseline(
  samples: readonly number[],
  cfg: CalibrationConfig = ENGINE_CONFIG.calibration,
): CalibrationResult {
  const kept = trimOutliers(samples.slice(cfg.warmupTrials), cfg);
  const mid = kept.length >= cfg.minSamples ? median(kept) : null;
  return { baselineMs: mid === null ? null : Math.round(mid), kept };
}

/** The pause before the next dot lights, uniform in `foreperiodMs`. */
export function foreperiod(
  rng: () => number,
  cfg: Pick<CalibrationConfig, 'foreperiodMs'> = ENGINE_CONFIG.calibration,
): number {
  const { min, max } = cfg.foreperiodMs;
  return Math.round(min + rng() * (max - min));
}

/** A random cell in `range` on one of `strings`, never the previous dot. */
export function nextDot(
  prev: Position | null,
  strings: readonly number[],
  range: FretRange,
  rng: () => number,
): Position {
  const cells: Position[] = [];
  for (const string of strings)
    for (let fret = range.from; fret <= range.to; fret++)
      if (!prev || prev.string !== string || prev.fret !== fret) cells.push({ string, fret });
  return cells[Math.min(cells.length - 1, Math.floor(rng() * cells.length))]!;
}
