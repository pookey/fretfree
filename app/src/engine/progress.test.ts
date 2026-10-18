import { describe, expect, it } from 'vitest';
import { Rating, type Grade } from 'ts-fsrs';
import type { CardRecord, Item } from './model';
import {
  isLearning,
  isStable,
  latestOutcomes,
  progressBySkill,
  type ReviewOutcome,
} from './progress';
import { createScheduler } from './scheduler';

const scheduler = createScheduler({ enableFuzz: false });
const t0 = new Date('2026-10-18T09:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const item = (id: string, skillId = 's'): Item => ({ id, skillId });

/** A card reviewed with `grades`, a minute apart, and the logs those reviews write. */
function practised(it: Item, grades: Grade[]): { card: CardRecord; logs: ReviewOutcome[] } {
  let card = scheduler.newCard(it, t0);
  const logs: ReviewOutcome[] = [];
  grades.forEach((rating, i) => {
    card = scheduler.review(card, rating, at(i + 1));
    logs.push({ itemId: it.id, rating, at: at(i + 1) });
  });
  return { card, logs };
}

describe('latestOutcomes', () => {
  it('keeps each item’s latest review, correct unless rated Again', () => {
    const logs: ReviewOutcome[] = [
      { itemId: 'a', rating: Rating.Again, at: at(1) },
      { itemId: 'a', rating: Rating.Hard, at: at(2) },
      { itemId: 'b', rating: Rating.Good, at: at(3) },
      { itemId: 'b', rating: Rating.Again, at: at(4) },
      // Out of order: an older log doesn't override a newer one.
      { itemId: 'a', rating: Rating.Again, at: at(0) },
    ];
    expect(latestOutcomes(logs)).toEqual(
      new Map([
        ['a', true],
        ['b', false],
      ]),
    );
  });

  it('lets the later log win a tie in time', () => {
    const tie = at(5);
    expect(
      latestOutcomes([
        { itemId: 'a', rating: Rating.Again, at: tie },
        { itemId: 'a', rating: Rating.Easy, at: tie },
      ]).get('a'),
    ).toBe(true);
    expect(latestOutcomes([]).size).toBe(0);
  });
});

describe('isLearning and isStable', () => {
  it('counts a same-day Good as learning but not stable', () => {
    const { card, logs } = practised(item('a'), [Rating.Good, Rating.Good, Rating.Good]);
    expect(isStable(card)).toBe(false);
    expect(isLearning(card, latestOutcomes(logs).get('a'))).toBe(true);
  });

  it('drops a lapsed item until it is answered correctly again', () => {
    const missed = practised(item('a'), [Rating.Good, Rating.Again]);
    expect(isLearning(missed.card, latestOutcomes(missed.logs).get('a'))).toBe(false);
    const back = practised(item('a'), [Rating.Good, Rating.Again, Rating.Hard]);
    expect(isLearning(back.card, latestOutcomes(back.logs).get('a'))).toBe(true);
  });

  it('counts a seeded placement card with no review log, but not an unreviewed new card', () => {
    const seeded = scheduler.seedKnownCard(item('a'), t0);
    expect(isLearning(seeded, undefined)).toBe(true);
    expect(isStable(seeded)).toBe(true);
    // A real review after placement overrides its judgement.
    expect(isLearning(seeded, false)).toBe(false);
    expect(isLearning(scheduler.newCard(item('b'), t0), undefined)).toBe(false);
  });

  it('reads the threshold from config unless given one', () => {
    const seeded = scheduler.seedKnownCard(item('a'), t0, 3);
    expect(isStable(seeded)).toBe(false);
    expect(isStable(seeded, 3)).toBe(true);
  });
});

describe('progressBySkill', () => {
  it('counts learning and stable items per skill, stable within learning', () => {
    const good = practised(item('a1', 'a'), [Rating.Good]);
    const missed = practised(item('a2', 'a'), [Rating.Easy, Rating.Again]);
    const fresh = scheduler.newCard(item('a3', 'a'), t0);
    const seeded = scheduler.seedKnownCard(item('b1', 'b'), t0);
    const easy = practised(item('b2', 'b'), [Rating.Easy]);
    const cards = [good.card, missed.card, fresh, seeded, easy.card];
    const outcomes = latestOutcomes([...good.logs, ...missed.logs, ...easy.logs]);
    expect(progressBySkill(cards, outcomes)).toEqual(
      new Map([
        ['a', { learning: 1, stable: 0 }],
        ['b', { learning: 2, stable: 2 }],
      ]),
    );
  });

  it('keeps a stable item in learning even after a missed review', () => {
    const seeded = scheduler.seedKnownCard(item('a'), t0, 30);
    expect(progressBySkill([seeded], new Map([['a', false]]))).toEqual(
      new Map([['s', { learning: 1, stable: 1 }]]),
    );
    expect(progressBySkill([seeded], new Map([['a', false]]), 60).size).toBe(0);
  });
});
