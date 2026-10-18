import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { createScheduler } from './scheduler';
import {
  buildSession,
  dueReviews,
  newItemBlock,
  pairConfusables,
  scheduleRetry,
  sessionLength,
  type SessionEntry,
} from './session';
import type { CardRecord, Item } from './model';

const now = new Date('2026-10-18T09:00:00Z');
const DAY = 86_400_000;
const s = createScheduler({ enableFuzz: false });
const items = (n: number, prefix = 'n'): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, skillId: 'sk' }));

/** Cards reviewed `ageDays` ago with one Good rating, so they are due now. */
function dueCard(id: string, ageDays: number): CardRecord {
  const then = new Date(now.getTime() - ageDays * DAY);
  return s.review(s.newCard({ id, skillId: 'sk' }, then), Rating.Good, then);
}

describe('sessionLength', () => {
  it('converts minutes to prompts with a floor', () => {
    expect(sessionLength(10)).toBe(86);
    expect(sessionLength(0)).toBe(5);
  });
});

describe('dueReviews', () => {
  it('returns only due cards, least retrievable first', () => {
    const fresh = s.review(s.newCard({ id: 'fresh', skillId: 'sk' }, now), Rating.Easy, now);
    const cards = [
      dueCard('a', 5),
      dueCard('b', 40),
      fresh,
      s.newCard({ id: 'new', skillId: 'sk' }, now),
    ];
    expect(dueReviews(cards, s, now).map((c) => c.itemId)).toEqual(['b', 'a']);
  });
});

describe('newItemBlock', () => {
  it('repeats the group round-robin with only the first pass guided', () => {
    const block = newItemBlock(items(2), 3);
    expect(block.map((e) => e.itemId)).toEqual(['n0', 'n1', 'n0', 'n1', 'n0', 'n1']);
    expect(block.map((e) => e.guided)).toEqual([true, true, false, false, false, false]);
    expect(block.every((e) => e.kind === 'new')).toBe(true);
  });
});

describe('buildSession', () => {
  it('fills a session with new items in blocks when nothing is due', () => {
    const plan = buildSession({ now, minutes: 2, cards: [], frontier: items(20), scheduler: s });
    // 17 slots → blocks of 4 items × 3 reps (12) + 1 item × 3 reps (3).
    expect(plan).toHaveLength(15);
    expect(new Set(plan.map((e) => e.itemId)).size).toBe(5);
    expect(plan.slice(0, 4).every((e) => e.guided)).toBe(true);
  });

  it('caps due reviews at 70% and interleaves new blocks', () => {
    const cards = Array.from({ length: 40 }, (_, i) => dueCard(`r${i}`, 3 + i));
    const plan = buildSession({
      now,
      minutes: 2,
      cards,
      frontier: items(10),
      scheduler: s,
      maxItems: 20,
    });
    const reviews = plan.filter((e) => e.kind === 'review');
    expect(reviews).toHaveLength(14);
    expect(plan.filter((e) => e.kind === 'new')).toHaveLength(6);
    expect(plan[0]?.kind).toBe('review');
    expect(plan.at(-1)?.kind).toBe('review');
  });

  it('tops up with extra reviews when the frontier is empty', () => {
    const cards = Array.from({ length: 30 }, (_, i) => dueCard(`r${i}`, 3 + i));
    const plan = buildSession({ now, minutes: 1, cards, frontier: [], scheduler: s, maxItems: 20 });
    expect(plan).toHaveLength(20);
    expect(plan.every((e) => e.kind === 'review')).toBe(true);
  });

  it('skips frontier items that already have cards', () => {
    const cards = [s.newCard({ id: 'n0', skillId: 'sk' }, now)];
    const plan = buildSession({
      now,
      minutes: 1,
      cards,
      frontier: items(2),
      scheduler: s,
      maxItems: 6,
    });
    expect(plan.map((e) => e.itemId)).not.toContain('n0');
  });

  it('pairs confusable items when confusions are provided', () => {
    const cards = ['E1', 'X1', 'X2', 'F1'].map((id, i) => dueCard(id, 10 + i));
    const plan = buildSession({
      now,
      minutes: 1,
      cards,
      frontier: [],
      scheduler: s,
      maxItems: 10,
      confusions: [{ a: 'E', b: 'F', count: 3 }],
      conceptOf: (id) => id[0] ?? null,
    });
    const ids = plan.map((e) => e.itemId);
    expect(Math.abs(ids.indexOf('E1') - ids.indexOf('F1'))).toBe(1);
  });
});

describe('pairConfusables', () => {
  const entry = (itemId: string): SessionEntry => ({
    itemId,
    skillId: 'sk',
    kind: 'review',
    guided: false,
  });
  const concept = (id: string) => id[0] ?? null;

  it('moves a later partner right after its pair', () => {
    const out = pairConfusables(
      ['E1', 'X1', 'X2', 'F1'].map(entry),
      [{ a: 'E', b: 'F', count: 1 }],
      concept,
    );
    expect(out.map((e) => e.itemId)).toEqual(['E1', 'F1', 'X1', 'X2']);
  });

  it('moves an earlier partner next to its pair', () => {
    const out = pairConfusables(
      ['F1', 'X1', 'X2', 'E1'].map(entry),
      [{ a: 'E', b: 'F', count: 1 }],
      concept,
    );
    expect(out.map((e) => e.itemId)).toEqual(['X1', 'X2', 'E1', 'F1']);
  });

  it('ignores pairs that are absent or have no count', () => {
    const base = ['E1', 'X1'].map(entry);
    expect(pairConfusables(base, [{ a: 'E', b: 'F', count: 2 }], concept)).toEqual(base);
    expect(
      pairConfusables(['E1', 'X', 'F1'].map(entry), [{ a: 'E', b: 'F', count: 0 }], concept).map(
        (e) => e.itemId,
      ),
    ).toEqual(['E1', 'X', 'F1']);
  });
});

describe('scheduleRetry', () => {
  const q = ['a', 'b', 'c', 'd', 'e'].map((itemId): SessionEntry => ({
    itemId,
    skillId: 'sk',
    kind: 'review',
    guided: false,
  }));

  it('re-inserts the current item a few prompts later as a retry', () => {
    const out = scheduleRetry(q, 0, 2);
    expect(out.map((e) => e.itemId)).toEqual(['a', 'b', 'c', 'a', 'd', 'e']);
    expect(out[3]?.kind).toBe('retry');
  });

  it('appends at the end when near the end and ignores bad indices', () => {
    expect(scheduleRetry(q, 4).map((e) => e.itemId)).toEqual(['a', 'b', 'c', 'd', 'e', 'e']);
    expect(scheduleRetry(q, 99)).toEqual(q);
  });
});
