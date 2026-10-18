import {
  CLAMP_PARAMETERS,
  Rating,
  S_MAX,
  S_MIN,
  W17_W18_Ceiling,
  dateDiffInDays,
  default_w,
  type FSRSState,
  type Grade,
} from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import type { ReviewLogRecord } from './model';

/**
 * Per-user FSRS parameter refit (research/02 rule 1).
 *
 * ts-fsrs ships the scheduler but not the optimiser (that lives in the Rust
 * `fsrs-rs`, whose bindings are native or a large wasm). This is the
 * documented fallback: the same objective as the official optimiser, fitted
 * by plain gradient descent in TypeScript.
 *
 * - Each item's reviews are replayed through the FSRS-6 memory model (a
 *   lean mirror of ts-fsrs's `next_state`, see `replay`), with elapsed time
 *   in UTC calendar days exactly as the scheduler measures it.
 * - The loss is the mean log loss of the predicted recall probability on
 *   every review made on a later day than the item's previous one (Again =
 *   forgot, anything else = recalled). Same-day reviews still update the
 *   memory state but test the short-term model, not the forgetting curve,
 *   so like `fsrs-rs` they don't score.
 * - Adam steps on finite-difference gradients, each parameter normalised to
 *   its ts-fsrs clamp range, with an L2 pull towards the defaults that fades
 *   as the log grows.
 * - The fit is kept only if it beats the defaults on the same reviews.
 *
 * Deterministic: no clock and no randomness.
 */

/** A refit as stored in settings (`Settings.fsrsParams`). */
export interface FittedFsrsParams {
  /** The 21 FSRS-6 weights the scheduler uses. */
  w: number[];
  /** Whether `w` came from this fit (true) or the fit lost to the defaults. */
  accepted: boolean;
  /** Logged reviews at the time of the fit. */
  reviewCount: number;
  fittedAt: Date;
  /** Mean log loss on scored reviews: the defaults, and the weights in `w`. */
  defaultLogLoss: number;
  logLoss: number;
}

export type RefitConfig = { readonly [K in keyof typeof ENGINE_CONFIG.refit]: number };

/** Whether the review log has grown enough for a (re)fit. Never below `minReviews`. */
export function isRefitDue(
  fitted: FittedFsrsParams | null | undefined,
  reviewCount: number,
  cfg: RefitConfig = ENGINE_CONFIG.refit,
): boolean {
  if (reviewCount < cfg.minReviews) return false;
  return !fitted || reviewCount - fitted.reviewCount >= cfg.refitEveryReviews;
}

/** One item's reviews in order: grade and UTC days since the previous review. */
export interface ReviewHistory {
  grades: Grade[];
  deltas: number[];
}

/** Group the log by item, in time order. Manual (0) ratings are skipped. */
export function buildHistories(logs: readonly ReviewLogRecord[]): ReviewHistory[] {
  const byItem = new Map<string, ReviewLogRecord[]>();
  for (const log of logs) {
    if (log.rating === Rating.Manual) continue;
    const list = byItem.get(log.itemId);
    if (list) list.push(log);
    else byItem.set(log.itemId, [log]);
  }
  const out: ReviewHistory[] = [];
  for (const list of byItem.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id ?? 0) - (b.id ?? 0));
    const grades: Grade[] = [];
    const deltas: number[] = [];
    let prev: Date | null = null;
    for (const log of list) {
      grades.push(log.rating as Grade);
      deltas.push(prev ? Math.max(0, dateDiffInDays(prev, log.at)) : 0);
      prev = log.at;
    }
    out.push({ grades, deltas });
  }
  return out;
}

/** Reviews that score in the loss: not an item's first, and on a later day. */
export function countScored(histories: readonly ReviewHistory[]): number {
  let n = 0;
  for (const h of histories) for (let i = 1; i < h.deltas.length; i++) if (h.deltas[i]! > 0) n++;
  return n;
}

const EPS = 1e-6;

/**
 * Replay `histories` through the FSRS-6 memory model and return the mean log
 * loss on scored reviews (0 when none score), plus each item's final state.
 *
 * This mirrors `FSRSAlgorithm.next_state` formula for formula (short-term
 * on, as the scheduler runs it) without its 8-decimal rounding, because the
 * fit replays the log some two thousand times and ts-fsrs's own replay is
 * about ten times slower. `refit.test.ts` pins it to ts-fsrs.
 */
export function replay(
  w: readonly number[],
  histories: readonly ReviewHistory[],
): { logLoss: number; states: FSRSState[] } {
  const p = (i: number) => w[i] ?? 0;
  const decay = -p(20);
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  const initD = (g: number) => p(4) - Math.exp((g - 1) * p(5)) + 1;
  const easyD = initD(Rating.Easy);
  const minAfterFail = Math.exp(p(17) * p(18));
  let sum = 0;
  let n = 0;
  const states: FSRSState[] = [];
  for (const h of histories) {
    let s = 0;
    let d = 0;
    for (let i = 0; i < h.grades.length; i++) {
      const g = h.grades[i]!;
      const t = h.deltas[i]!;
      if (i === 0) {
        s = Math.max(p(g - 1), 0.1);
        d = clampTo(initD(g), 1, 10);
        continue;
      }
      const r = Math.pow(1 + (factor * t) / s, decay);
      if (t > 0) {
        const rc = Math.min(1 - EPS, Math.max(EPS, r));
        sum -= g === Rating.Again ? Math.log(1 - rc) : Math.log(rc);
        n++;
      }
      if (t === 0) {
        const sinc = Math.pow(s, -p(19)) * Math.exp(p(17) * (g - 3 + p(18)));
        s = clampTo(s * (g >= Rating.Hard ? Math.max(sinc, 1) : sinc), S_MIN, S_MAX);
      } else if (g === Rating.Again) {
        const fail = clampTo(
          p(11) * Math.pow(d, -p(12)) * (Math.pow(s + 1, p(13)) - 1) * Math.exp((1 - r) * p(14)),
          S_MIN,
          S_MAX,
        );
        s = clampTo(s / minAfterFail, S_MIN, fail);
      } else {
        const bonus = (g === Rating.Hard ? p(15) : 1) * (g === Rating.Easy ? p(16) : 1);
        const growth =
          Math.exp(p(8)) * (11 - d) * Math.pow(s, -p(9)) * (Math.exp((1 - r) * p(10)) - 1);
        s = clampTo(s * (1 + growth * bonus), S_MIN, S_MAX);
      }
      const damped = d + (-p(6) * (g - 3) * (10 - d)) / 9;
      d = clampTo(p(7) * easyD + (1 - p(7)) * damped, 1, 10);
    }
    states.push({ stability: s, difficulty: d });
  }
  return { logLoss: n === 0 ? 0 : sum / n, states };
}

function clampTo(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Mean log loss of `w`'s recall predictions on the scored reviews (0 when none score). */
export function logLoss(w: readonly number[], histories: readonly ReviewHistory[]): number {
  return replay(w, histories).logLoss;
}

const BOUNDS = CLAMP_PARAMETERS(W17_W18_Ceiling, true);

function bound(i: number): [number, number] {
  const b = BOUNDS[i];
  return b ? [b[0]!, b[1]!] : [-Infinity, Infinity];
}

function clip(w: number[]): number[] {
  return w.map((v, i) => {
    const [lo, hi] = bound(i);
    return Math.min(hi, Math.max(lo, v));
  });
}

/**
 * Fit FSRS-6 weights to `histories` from `start`, one Adam step per yield
 * so a caller can spread the work over frames. Returns the weights and
 * their log loss.
 */
export function* fitSteps(
  histories: readonly ReviewHistory[],
  cfg: RefitConfig = ENGINE_CONFIG.refit,
  start: readonly number[] = default_w,
): Generator<void, { w: number[]; logLoss: number }> {
  const prior = [...default_w];
  const ranges = prior.map((_, i) => {
    const [lo, hi] = bound(i);
    return hi - lo;
  });
  const scored = Math.max(1, countScored(histories));
  const lambda = cfg.priorStrength / scored;
  const objective = (w: readonly number[]) => {
    let reg = 0;
    for (let i = 0; i < w.length; i++) reg += ((w[i]! - prior[i]!) / ranges[i]!) ** 2;
    return logLoss(w, histories) + lambda * reg;
  };

  const B1 = 0.9;
  const B2 = 0.999;
  let w = clip([...start]);
  const m = w.map(() => 0);
  const v = w.map(() => 0);
  for (let step = 1; step <= cfg.iterations; step++) {
    const base = objective(w);
    // Gradient in range-normalised units, by forward (or, at a bound, backward) differences.
    const grad = w.map((wi, i) => {
      const h = 1e-4 * ranges[i]!;
      const up = wi + h <= bound(i)[1];
      const probe = [...w];
      probe[i] = up ? wi + h : wi - h;
      const d = (objective(probe) - base) / 1e-4;
      return up ? d : -d;
    });
    w = clip(
      w.map((wi, i) => {
        const g = grad[i]!;
        m[i] = B1 * m[i]! + (1 - B1) * g;
        v[i] = B2 * v[i]! + (1 - B2) * g * g;
        const mHat = m[i]! / (1 - B1 ** step);
        const vHat = v[i]! / (1 - B2 ** step);
        return wi - cfg.learningRate * ranges[i]! * (mHat / (Math.sqrt(vHat) + 1e-8));
      }),
    );
    yield;
  }
  return { w, logLoss: logLoss(w, histories) };
}

/** `fitSteps` run to the end in one go. */
export function fitWeights(
  histories: readonly ReviewHistory[],
  cfg: RefitConfig = ENGINE_CONFIG.refit,
  start: readonly number[] = default_w,
): { w: number[]; logLoss: number } {
  return drain(fitSteps(histories, cfg, start));
}

/**
 * Refit from the whole review log, yielding between optimiser steps.
 * Returns `null` when too few reviews score to say anything (the scheduler
 * keeps what it has). Otherwise the record to store: the fitted weights
 * when they beat the defaults, else the defaults.
 */
export function* refitSteps(
  logs: readonly ReviewLogRecord[],
  now: Date,
  cfg: RefitConfig = ENGINE_CONFIG.refit,
): Generator<void, FittedFsrsParams | null> {
  const histories = buildHistories(logs);
  if (countScored(histories) < cfg.minCrossDayReviews) return null;
  const defaultLogLoss = logLoss(default_w, histories);
  const fit = yield* fitSteps(histories, cfg);
  const accepted = fit.logLoss < defaultLogLoss - cfg.minImprovement;
  return {
    w: accepted ? fit.w : [...default_w],
    accepted,
    reviewCount: logs.length,
    fittedAt: now,
    defaultLogLoss,
    logLoss: accepted ? fit.logLoss : defaultLogLoss,
  };
}

/** `refitSteps` run to the end in one go. */
export function refitParameters(
  logs: readonly ReviewLogRecord[],
  now: Date,
  cfg: RefitConfig = ENGINE_CONFIG.refit,
): FittedFsrsParams | null {
  return drain(refitSteps(logs, now, cfg));
}

function drain<T>(gen: Generator<void, T>): T {
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}
