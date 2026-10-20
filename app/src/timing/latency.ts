/**
 * Latency compensation (design §12), pure. A click scheduled at audio time t
 * leaves the speaker at t + output latency, and the learner answers what they
 * hear. So every onset has the context's reported output latency taken off,
 * then the learner's calibrated offset for that input: a tap run measures
 * touch latency and the learner's own habit, a mic run adds the input path.
 *
 * Calibration: tap (or strum) along with ~10s of clicks; the median offset of
 * the steady taps is the learner's offset, stored in `settings.timingOffsets`.
 */
import { ENGINE_CONFIG } from '../engine/config';
import type { TimingOffsets } from '../engine/model';
import { alignOnsets } from './grade';

export type OnsetKind = keyof TimingOffsets;

/** What a context reports; Safari has no `outputLatency`, so either may be missing. */
export interface LatencyReport {
  outputLatency?: number;
  baseLatency?: number;
}

/** Output plus base latency in ms; 0 for what the browser doesn't report. */
export function outputLatencyMs(ctx: LatencyReport): number {
  const seconds = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return (seconds(ctx.outputLatency) + seconds(ctx.baseLatency)) * 1000;
}

/** What to take off a raw onset time. */
export interface Compensation {
  outputMs: number;
  /** The learner's calibrated offset for this input; 0 before calibrating. */
  calibrationMs: number;
}

export function compensation(
  kind: OnsetKind,
  offsets: TimingOffsets,
  ctx: LatencyReport,
): Compensation {
  return { outputMs: outputLatencyMs(ctx), calibrationMs: offsets[kind] ?? 0 };
}

/** A raw onset (audio-clock ms) as the learner meant it. */
export function compensate(rawMs: number, c: Compensation): number {
  return rawMs - c.outputMs - c.calibrationMs;
}

export type CalibrationConfig = {
  [K in keyof (typeof ENGINE_CONFIG)['timing']['calibration']]: number;
};

export type CalibrationResult =
  | {
      ok: true;
      /** Median offset of the steady taps, ms; + late. What goes in settings. */
      offsetMs: number;
      /** Interquartile range of the kept offsets, ms. */
      spreadMs: number;
      samples: number;
    }
  | {
      ok: false;
      /** `too-few`: not enough taps near the clicks; `uneven`: too spread to trust. */
      reason: 'too-few' | 'uneven';
      samples: number;
      spreadMs: number | null;
    };

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * The offset from a calibration run. `clicksMs` are the clicks the learner
 * tapped along with (no count-in), and `onsetsMs` their onsets with only the
 * output latency taken off. The first `warmupClicks` are skipped, offsets
 * outside the Tukey fences trimmed, and the median of the rest is the result.
 */
export function summariseCalibration(
  clicksMs: readonly number[],
  onsetsMs: readonly number[],
  cfg: CalibrationConfig = ENGINE_CONFIG.timing.calibration,
): CalibrationResult {
  const counted = clicksMs.slice(cfg.warmupClicks);
  const { offsets } = alignOnsets(counted, onsetsMs, cfg.matchMs);
  const raw = offsets.filter((o): o is number => o !== null).sort((a, b) => a - b);
  if (raw.length < cfg.minSamples) return { ok: false, reason: 'too-few', samples: raw.length, spreadMs: null };
  const q1 = quantile(raw, 0.25);
  const q3 = quantile(raw, 0.75);
  const fence = cfg.outlierIqr * (q3 - q1);
  const kept = raw.filter((o) => o >= q1 - fence && o <= q3 + fence);
  const spreadMs = Math.round(quantile(kept, 0.75) - quantile(kept, 0.25));
  if (kept.length < cfg.minSamples)
    return { ok: false, reason: 'too-few', samples: kept.length, spreadMs };
  if (spreadMs > cfg.maxSpreadMs) return { ok: false, reason: 'uneven', samples: kept.length, spreadMs };
  return { ok: true, offsetMs: Math.round(quantile(kept, 0.5)), spreadMs, samples: kept.length };
}
