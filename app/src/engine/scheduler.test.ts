import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { createScheduler } from './scheduler';

const item = { id: 'note@s6f5', skillId: 'F2.string6-naturals' };
const now = new Date('2026-10-18T09:00:00Z');
const DAY = 86_400_000;

describe('scheduler (ts-fsrs wrapper)', () => {
  const s = createScheduler({ enableFuzz: false });

  it('creates new cards that are not yet due for review', () => {
    const c = s.newCard(item, now);
    expect(c.itemId).toBe(item.id);
    expect(c.skillId).toBe(item.skillId);
    expect(c.fsrs.state).toBe(State.New);
    expect(c.lastReviewedAt).toBeNull();
    expect(s.isDue(c, now)).toBe(false);
    expect(s.retrievability(c, now)).toBe(0);
  });

  it('schedules longer intervals for better ratings', () => {
    const c = s.newCard(item, now);
    const again = s.review(c, Rating.Again, now);
    const easy = s.review(c, Rating.Easy, now);
    expect(easy.fsrs.due.getTime()).toBeGreaterThan(again.fsrs.due.getTime());
    expect(easy.lastReviewedAt).toEqual(now);
  });

  it('grows stability over successful spaced reviews', () => {
    let c = s.newCard(item, now);
    let t = now;
    for (let i = 0; i < 4; i++) {
      c = s.review(c, Rating.Good, t);
      t = new Date(c.fsrs.due.getTime());
    }
    expect(c.fsrs.state).toBe(State.Review);
    expect(c.fsrs.stability).toBeGreaterThan(5);
  });

  it('reports due cards and decaying retrievability', () => {
    const c = s.review(s.newCard(item, now), Rating.Good, now);
    const later = new Date(c.fsrs.due.getTime() + DAY);
    expect(s.isDue(c, later)).toBe(true);
    const r1 = s.retrievability(c, new Date(now.getTime() + DAY));
    const r2 = s.retrievability(c, new Date(now.getTime() + 30 * DAY));
    expect(r1).toBeGreaterThan(r2);
  });

  it('seeds known cards at the configured stability (placement test)', () => {
    const c = s.seedKnownCard(item, now);
    expect(c.fsrs.state).toBe(State.Review);
    expect(c.fsrs.stability).toBe(10);
    expect(s.isDue(c, now)).toBe(false);
    expect(s.isDue(c, new Date(now.getTime() + 11 * DAY))).toBe(true);
    expect(s.seedKnownCard(item, now, 3).fsrs.stability).toBe(3);
  });

  it('uses default parameters when none are given', () => {
    expect(createScheduler().fsrs.parameters.request_retention).toBe(0.9);
  });
});
