import {
  FSRSAlgorithm,
  Rating,
  createEmptyCard,
  default_w,
  forgetting_curve,
  fsrs,
  generatorParameters,
  type FSRSState,
  type Grade,
} from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from './config';
import { DEFAULT_SETTINGS, type ReviewLogRecord } from './model';
import { createScheduler, type Scheduler } from './scheduler';
import {
  buildHistories,
  countScored,
  fitWeights,
  isRefitDue,
  logLoss,
  refitParameters,
  replay,
  type FittedFsrsParams,
  type ReviewHistory,
} from './refit';

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T09:00:00Z');

function log(itemId: string, rating: Rating, at: Date, id?: number): ReviewLogRecord {
  return {
    id,
    itemId,
    skillId: 's',
    drillType: 'd1',
    correct: rating !== Rating.Again,
    responseMs: 1000,
    rating,
    hintUsed: false,
    answerGiven: '',
    at,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A learner whose memory follows FSRS with weights `trueW`: each review
 * recalls with the true retrievability, and the app schedules with ts-fsrs
 * defaults (as it would before a refit).
 */
function simulate(trueW: readonly number[], items: number, days: number, seed: number) {
  const rng = mulberry32(seed);
  const truth = fsrs(generatorParameters({ w: [...trueW], enable_fuzz: false }));
  const app = fsrs(generatorParameters({ enable_fuzz: false }));
  const logs: ReviewLogRecord[] = [];
  for (let i = 0; i < items; i++) {
    const intro = T0.getTime() + Math.floor(rng() * 10) * DAY;
    let appCard = createEmptyCard(new Date(intro));
    let trueCard = createEmptyCard(new Date(intro));
    let at = new Date(intro);
    while (at.getTime() < T0.getTime() + days * DAY) {
      const r = trueCard.last_review ? truth.get_retrievability(trueCard, at, false) : 0;
      const recalled = trueCard.last_review ? rng() < r : rng() < 0.6;
      const grade: Grade = recalled ? (rng() < 0.15 ? Rating.Easy : Rating.Good) : Rating.Again;
      logs.push(log(`i${i}`, grade, at));
      trueCard = truth.next(trueCard, at, grade).card;
      appCard = app.next(appCard, at, grade).card;
      // Same-day reps land a few minutes later; otherwise go to the due date.
      at = new Date(Math.max(appCard.due.getTime(), at.getTime() + 5 * 60_000));
    }
  }
  return logs;
}

const fitted = (reviewCount: number): FittedFsrsParams => ({
  w: [...default_w],
  accepted: false,
  reviewCount,
  fittedAt: T0,
  defaultLogLoss: 0.3,
  logLoss: 0.3,
});

describe('isRefitDue', () => {
  const cfg = ENGINE_CONFIG.refit;

  it('is never due below the review threshold', () => {
    expect(isRefitDue(null, 0)).toBe(false);
    expect(isRefitDue(null, cfg.minReviews - 1)).toBe(false);
    expect(isRefitDue(undefined, cfg.minReviews - 1)).toBe(false);
  });

  it('is due at about 1,000 reviews with no fit yet', () => {
    expect(cfg.minReviews).toBe(1000);
    expect(isRefitDue(null, cfg.minReviews)).toBe(true);
  });

  it('is due again only after another batch of reviews', () => {
    const last = fitted(cfg.minReviews);
    expect(isRefitDue(last, cfg.minReviews + cfg.refitEveryReviews - 1)).toBe(false);
    expect(isRefitDue(last, cfg.minReviews + cfg.refitEveryReviews)).toBe(true);
  });
});

describe('buildHistories', () => {
  it('groups by item in time order with UTC-day deltas, skipping manual ratings', () => {
    const logs = [
      log('b', Rating.Good, new Date(T0.getTime() + 2 * DAY)),
      log('a', Rating.Again, new Date(T0.getTime() + 60_000)),
      log('a', Rating.Good, T0, 2),
      log('a', Rating.Good, T0, 1),
      log('a', Rating.Manual, new Date(T0.getTime() + DAY)),
      log('a', Rating.Hard, new Date(T0.getTime() + 3 * DAY)),
    ];
    const [b, a] = buildHistories(logs);
    expect(b).toEqual({ grades: [Rating.Good], deltas: [0] });
    expect(a).toEqual({
      grades: [Rating.Good, Rating.Good, Rating.Again, Rating.Hard],
      deltas: [0, 0, 0, 3],
    });
    expect(countScored([a!, b!])).toBe(1);
  });
});

/** The same replay through ts-fsrs itself: the reference `replay` must match. */
function referenceReplay(w: readonly number[], histories: readonly ReviewHistory[]) {
  const algo = new FSRSAlgorithm(generatorParameters({ w: [...w], enable_short_term: true }));
  let sum = 0;
  let n = 0;
  const states: FSRSState[] = [];
  for (const h of histories) {
    let state: FSRSState | null = null;
    h.grades.forEach((g, i) => {
      const t = h.deltas[i]!;
      if (state && t > 0) {
        const r = forgetting_curve(w, t, state.stability);
        sum -= g === Rating.Again ? Math.log(1 - r) : Math.log(r);
        n++;
      }
      state = algo.next_state(state, t, g);
    });
    states.push(state!);
  }
  return { logLoss: sum / n, states };
}

describe('replay', () => {
  const histories = buildHistories([
    ...simulate(default_w, 30, 120, 11),
    ...simulate(default_w, 10, 60, 12).map((l) => ({
      ...l,
      rating: Rating.Hard,
      itemId: `h${l.itemId}`,
    })),
  ]);
  const perturbed = default_w.map((x, i) => (i === 20 ? 0.3 : i % 2 ? x * 1.2 : x * 0.85));

  it.each([
    ['default', [...default_w]],
    ['perturbed', generatorParameters({ w: perturbed }).w],
  ])('matches ts-fsrs next_state and forgetting_curve (%s weights)', (_, w) => {
    const ours = replay(w, histories);
    const ref = referenceReplay(w, histories);
    expect(ours.logLoss).toBeCloseTo(ref.logLoss, 5);
    ours.states.forEach((s, i) => {
      const r = ref.states[i]!;
      expect(s.difficulty).toBeCloseTo(r.difficulty, 5);
      expect(Math.abs(s.stability - r.stability) / r.stability).toBeLessThan(1e-5);
    });
  });
});

describe('logLoss', () => {
  it('is 0 when nothing scores', () => {
    expect(logLoss(default_w, buildHistories([log('a', Rating.Good, T0)]))).toBe(0);
  });

  it('is lower for weights that predict the outcome', () => {
    const recalled = buildHistories([
      log('a', Rating.Good, T0),
      log('a', Rating.Good, new Date(T0.getTime() + 30 * DAY)),
    ]);
    const forgot = buildHistories([
      log('a', Rating.Good, T0),
      log('a', Rating.Again, new Date(T0.getTime() + 30 * DAY)),
    ]);
    // A higher initial Good stability (w2) predicts better recall after 30 days.
    const strong = [...default_w];
    strong[2] = 60;
    expect(logLoss(strong, recalled)).toBeLessThan(logLoss(default_w, recalled));
    expect(logLoss(strong, forgot)).toBeGreaterThan(logLoss(default_w, forgot));
  });
});

describe('fitWeights', () => {
  it('keeps every weight inside the ts-fsrs bounds', () => {
    const logs = simulate(default_w, 20, 60, 7);
    const { w } = fitWeights(buildHistories(logs), { ...ENGINE_CONFIG.refit, iterations: 5 });
    expect(w).toHaveLength(21);
    expect(() => generatorParameters({ w })).not.toThrow();
    const reclipped = generatorParameters({ w }).w;
    w.forEach((x, i) => expect(x).toBeCloseTo(reclipped[i]!, 6));
  });
});

describe('refitParameters', () => {
  it('returns null when too few reviews are on a later day', () => {
    const logs = Array.from({ length: 1000 }, (_, i) =>
      log(`i${i % 50}`, Rating.Good, new Date(T0.getTime() + i * 1000)),
    );
    expect(refitParameters(logs, T0)).toBeNull();
  });

  it('beats the defaults for a learner who forgets faster than they assume', () => {
    // Initial stabilities a quarter of the defaults: this learner forgets fast.
    const trueW = [...default_w];
    for (const i of [0, 1, 2, 3]) trueW[i] = default_w[i]! / 4;
    const logs = simulate(trueW, 150, 90, 42);
    expect(logs.length).toBeGreaterThan(1000);
    const now = new Date(T0.getTime() + 90 * DAY);
    const res = refitParameters(logs, now);
    expect(res).not.toBeNull();
    expect(res!.accepted).toBe(true);
    expect(res!.reviewCount).toBe(logs.length);
    expect(res!.fittedAt).toBe(now);
    expect(res!.logLoss).toBeLessThan(res!.defaultLogLoss);
    // Good's initial stability moves towards the truth.
    expect(res!.w[2]!).toBeLessThan(default_w[2]!);
  });

  it('is deterministic', () => {
    const logs = simulate(default_w, 15, 40, 3);
    const cfg = { ...ENGINE_CONFIG.refit, minCrossDayReviews: 1, iterations: 3 };
    expect(refitParameters(logs, T0, cfg)).toEqual(refitParameters(logs, T0, cfg));
  });

  it('falls back to the defaults when the fit does not beat them', () => {
    const logs = simulate(default_w, 15, 40, 3);
    const cfg = {
      ...ENGINE_CONFIG.refit,
      minCrossDayReviews: 1,
      iterations: 3,
      minImprovement: 10,
    };
    const res = refitParameters(logs, T0, cfg)!;
    expect(res.accepted).toBe(false);
    expect(res.w).toEqual([...default_w]);
    expect(res.logLoss).toBe(res.defaultLogLoss);
  });
});

describe('createScheduler with refit weights', () => {
  const item = { id: 'note@s6f5', skillId: 'F2.string6-naturals' };

  /** Due dates and stabilities over a fixed run of reviews. */
  function trace(s: Scheduler) {
    let card = s.newCard(item, T0);
    let at = T0;
    const out: [number, number][] = [];
    for (const g of [Rating.Good, Rating.Good, Rating.Again, Rating.Hard, Rating.Easy] as Grade[]) {
      card = s.review(card, g, at);
      out.push([card.fsrs.due.getTime(), card.fsrs.stability]);
      at = new Date(card.fsrs.due.getTime() + DAY);
    }
    return { out, r: s.retrievability(card, new Date(at.getTime() + 10 * DAY)) };
  }

  const baseline = trace(createScheduler({ enableFuzz: false }));

  it('is unchanged without fitted weights (below the threshold)', () => {
    expect(DEFAULT_SETTINGS.fsrsParams).toBeNull();
    expect(
      trace(createScheduler({ enableFuzz: false, weights: DEFAULT_SETTINGS.fsrsParams?.w })),
    ).toEqual(baseline);
    expect(trace(createScheduler({ enableFuzz: false, weights: null }))).toEqual(baseline);
    expect(trace(createScheduler({ enableFuzz: false, weights: default_w }))).toEqual(baseline);
  });

  it('ignores malformed weights', () => {
    expect(trace(createScheduler({ enableFuzz: false, weights: [1, 2, 3] }))).toEqual(baseline);
    const nan = [...default_w];
    nan[3] = Number.NaN;
    expect(trace(createScheduler({ enableFuzz: false, weights: nan }))).toEqual(baseline);
  });

  it('schedules with the fitted weights', () => {
    const fast = [...default_w];
    for (const i of [0, 1, 2, 3]) fast[i] = default_w[i]! / 4;
    const s = createScheduler({ enableFuzz: false, weights: fast });
    expect(s.fsrs.parameters.w[2]).toBeCloseTo(fast[2]!, 8);
    const fitted = trace(s);
    expect(fitted).not.toEqual(baseline);
    expect(fitted.out[0]![1]).toBeLessThan(baseline.out[0]![1]);
  });
});
