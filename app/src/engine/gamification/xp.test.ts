import { Rating, type Grade } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../config';
import type { AnswerXpInput, CardKind } from './types';
import { xpForAnswer, type XpConfig } from './xp';

const KINDS: readonly CardKind[] = ['new', 'due', 'stretch', 'not-due'];
const CORRECT_GRADES: readonly Grade[] = [Rating.Hard, Rating.Good, Rating.Easy];
const STABILITIES = [0, 0.5, 1, 3, 7, 10, 30, 100, 365];

function answer(overrides: Partial<AnswerXpInput> = {}): AnswerXpInput {
  return {
    correct: true,
    rating: Rating.Good,
    kind: 'due',
    stabilityDays: 3,
    answeredToday: 0,
    ...overrides,
  };
}

/** Every outcome an answer can have: wrong, or correct at each speed. */
function outcomes(): Array<Pick<AnswerXpInput, 'correct' | 'rating'>> {
  return [
    { correct: false, rating: Rating.Again },
    ...CORRECT_GRADES.map((rating) => ({ correct: true, rating })),
  ];
}

/** mulberry32: a small seeded PRNG so the property runs are reproducible. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, xs: readonly T[]): T {
  const x = xs[Math.floor(rng() * xs.length)];
  if (x === undefined) throw new Error('empty list');
  return x;
}

function randomOutcome(rng: () => number): Pick<AnswerXpInput, 'correct' | 'rating'> {
  return pick(rng, outcomes());
}

function randomAnswer(rng: () => number): AnswerXpInput {
  return {
    ...randomOutcome(rng),
    kind: pick(rng, KINDS),
    stabilityDays: rng() * 400,
    answeredToday: Math.floor(rng() * 12),
  };
}

describe('xpForAnswer', () => {
  it('pays the documented amounts for a first answer to a due review', () => {
    expect(xpForAnswer(answer({ correct: false, rating: Rating.Again }))).toBe(6);
    expect(xpForAnswer(answer({ rating: Rating.Hard }))).toBe(10);
    expect(xpForAnswer(answer({ rating: Rating.Good }))).toBe(10);
    expect(xpForAnswer(answer({ rating: Rating.Easy }))).toBe(12);
  });

  it('weights new items like due reviews and stretch items slightly less', () => {
    expect(xpForAnswer(answer({ kind: 'new', stabilityDays: 0 }))).toBe(10);
    expect(xpForAnswer(answer({ kind: 'stretch' }))).toBe(8);
  });

  it('pays less for a not-due card, and less again the more stable it is', () => {
    expect(xpForAnswer(answer({ kind: 'not-due', stabilityDays: 0 }))).toBe(4);
    expect(xpForAnswer(answer({ kind: 'not-due', stabilityDays: 7 }))).toBe(2);
    expect(xpForAnswer(answer({ kind: 'not-due', stabilityDays: 100 }))).toBe(0);
  });

  it('gives a small fluent bonus only to correct Easy answers', () => {
    const { fluentBonus, correctBonus } = ENGINE_CONFIG.gamification.xp;
    expect(fluentBonus).toBeGreaterThan(0);
    expect(fluentBonus).toBeLessThan(correctBonus);
    const good = xpForAnswer(answer({ rating: Rating.Good }));
    expect(xpForAnswer(answer({ rating: Rating.Easy })) - good).toBe(fluentBonus);
    // A wrong answer can't carry Easy, but if it did it would earn no bonus.
    expect(xpForAnswer(answer({ correct: false, rating: Rating.Easy }))).toBe(6);
  });

  it('pays base XP for a wrong answer, weighted by the card kind', () => {
    const { attempt, kindWeight } = ENGINE_CONFIG.gamification.xp;
    for (const kind of ['new', 'due', 'stretch'] as const) {
      const wrong = xpForAnswer(answer({ kind, correct: false, rating: Rating.Again }));
      expect(wrong).toBe(Math.round(attempt * kindWeight[kind]));
      expect(wrong).toBeGreaterThan(0);
    }
  });

  it('decays XP for an item already answered today', () => {
    expect(xpForAnswer(answer({ answeredToday: 1 }))).toBe(5);
    expect(xpForAnswer(answer({ answeredToday: 2 }))).toBe(3);
    expect(xpForAnswer(answer({ answeredToday: 10 }))).toBe(0);
    expect(xpForAnswer(answer({ correct: false, rating: Rating.Again, answeredToday: 1 }))).toBe(3);
  });

  it('treats negative or fractional counters as their nearest valid value', () => {
    expect(xpForAnswer(answer({ answeredToday: -3 }))).toBe(10);
    expect(xpForAnswer(answer({ answeredToday: 1.7 }))).toBe(5);
    expect(xpForAnswer(answer({ kind: 'not-due', stabilityDays: -5 }))).toBe(4);
  });

  it('uses the weights it is given', () => {
    const cfg: XpConfig = {
      ...ENGINE_CONFIG.gamification.xp,
      attempt: 1,
      correctBonus: 1,
      fluentBonus: 1,
      repeatDecay: 1,
    };
    expect(xpForAnswer(answer({ rating: Rating.Easy, answeredToday: 5 }), cfg)).toBe(3);
  });
});

describe('xpForAnswer properties', () => {
  const RUNS = 5000;

  it('always returns a whole, non-negative number', () => {
    const rng = seededRng(1);
    for (let i = 0; i < RUNS; i++) {
      const xp = xpForAnswer(randomAnswer(rng));
      expect(Number.isInteger(xp) && xp >= 0).toBe(true);
    }
  });

  it('never pays more for an answer to the same item later the same day', () => {
    for (const kind of KINDS) {
      for (const outcome of outcomes()) {
        for (const stabilityDays of STABILITIES) {
          let previous = Infinity;
          for (let answeredToday = 0; answeredToday < 12; answeredToday++) {
            const xp = xpForAnswer({ ...outcome, kind, stabilityDays, answeredToday });
            expect(xp).toBeLessThanOrEqual(previous);
            previous = xp;
          }
        }
      }
    }
  });

  it('never pays more for a not-due card as its stability grows', () => {
    for (const outcome of outcomes()) {
      let previous = Infinity;
      for (const stabilityDays of STABILITIES) {
        const xp = xpForAnswer({ ...outcome, kind: 'not-due', stabilityDays, answeredToday: 0 });
        expect(xp).toBeLessThanOrEqual(previous);
        previous = xp;
      }
    }
  });

  it('never pays a correct answer less than a wrong one, or a fluent one less than a slow one', () => {
    const rng = seededRng(2);
    for (let i = 0; i < RUNS; i++) {
      const base = randomAnswer(rng);
      const wrong = xpForAnswer({ ...base, correct: false, rating: Rating.Again });
      const hard = xpForAnswer({ ...base, correct: true, rating: Rating.Hard });
      const good = xpForAnswer({ ...base, correct: true, rating: Rating.Good });
      const easy = xpForAnswer({ ...base, correct: true, rating: Rating.Easy });
      expect(hard).toBeGreaterThanOrEqual(wrong);
      expect(good).toBe(hard);
      expect(easy).toBeGreaterThanOrEqual(good);
    }
  });

  it('pays any not-due answer less than even a wrong first answer to a due review', () => {
    const worstDue = Math.min(
      ...outcomes().flatMap((outcome) =>
        STABILITIES.map((stabilityDays) =>
          xpForAnswer({ ...outcome, kind: 'due', stabilityDays, answeredToday: 0 }),
        ),
      ),
    );
    const bestNotDue = Math.max(
      ...outcomes().flatMap((outcome) =>
        STABILITIES.map((stabilityDays) =>
          xpForAnswer({ ...outcome, kind: 'not-due', stabilityDays, answeredToday: 0 }),
        ),
      ),
    );
    expect(bestNotDue).toBeLessThan(worstDue);
  });

  it('never lets grinding a stable card out-earn the same number of due reviews', () => {
    const rng = seededRng(3);
    for (let run = 0; run < 500; run++) {
      const answers = 1 + Math.floor(rng() * 40);
      // At least as stable as mastery requires: a card the learner already knows.
      const stabilityDays = ENGINE_CONFIG.mastery.stabilityDays + rng() * 365;
      let grind = 0;
      let reviews = 0;
      for (let i = 0; i < answers; i++) {
        // Grinding: the same not-due card, answered over and over today, at its best.
        grind += xpForAnswer({
          correct: true,
          rating: Rating.Easy,
          kind: 'not-due',
          stabilityDays,
          answeredToday: i,
        });
        // Due reviews: distinct cards, each answered once, with any outcome.
        reviews += xpForAnswer({
          ...randomOutcome(rng),
          kind: 'due',
          stabilityDays: rng() * 365,
          answeredToday: 0,
        });
      }
      expect(grind).toBeLessThanOrEqual(reviews);
    }
  });

  it('never lets fresh not-due cards out-earn due reviews either', () => {
    const rng = seededRng(4);
    for (let run = 0; run < 500; run++) {
      const answers = 1 + Math.floor(rng() * 40);
      let grind = 0;
      let reviews = 0;
      for (let i = 0; i < answers; i++) {
        // Many different not-due cards, each answered once today, all fluent.
        grind += xpForAnswer({
          correct: true,
          rating: Rating.Easy,
          kind: 'not-due',
          stabilityDays: rng() * 365,
          answeredToday: 0,
        });
        reviews += xpForAnswer({
          correct: false,
          rating: Rating.Again,
          kind: 'due',
          stabilityDays: rng() * 365,
          answeredToday: 0,
        });
      }
      expect(grind).toBeLessThan(reviews);
    }
  });
});
