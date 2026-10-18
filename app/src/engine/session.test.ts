import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { createScheduler } from './scheduler';
import {
  blockBoundary,
  blockGuideLevel,
  buildSession,
  dueReviews,
  inLearningStep,
  newItemBlock,
  planNewBlocks,
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
  it('opens with a guided worked example, then repeats the group round-robin', () => {
    const block = newItemBlock(items(2), 3);
    expect(block.map((e) => e.itemId)).toEqual(['n0', 'n1', 'n0', 'n1', 'n0', 'n1', 'n0', 'n1']);
    expect(block.map((e) => e.guided)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(block.map((e) => e.rep)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(block.every((e) => e.kind === 'new' && e.block === 'n0')).toBe(true);
  });

  it('is empty without items', () => {
    expect(newItemBlock([], 3)).toEqual([]);
  });
});

describe('planNewBlocks', () => {
  // `note@…` and `find:…` items of the same letter are one fact in two directions.
  const both = (ids: string[]): Item[] => ids.map((id) => ({ id, skillId: 'sk' }));
  // `note:E` asks fact E by name and `find:E` asks it the other way.
  const fact = (i: Item) => {
    const [direction, f] = i.id.split(':');
    return i.id.startsWith('x') ? null : { fact: f!, direction: direction! };
  };
  const ids = (blocks: Item[][]) => blocks.map((b) => b.map((i) => i.id));

  it('chunks in frontier order without a fact key', () => {
    expect(ids(planNewBlocks(items(5), 2))).toEqual([['n0', 'n1'], ['n2', 'n3'], ['n4']]);
  });

  it('follows each block with its facts in the other direction', () => {
    const frontier = both(['note:E', 'note:F', 'note:G', 'note:E', 'find:E', 'find:G', 'find:F']);
    // The second `note:E` (an octave up) asks the same direction, so it is no partner.
    expect(ids(planNewBlocks(frontier, 2, fact))).toEqual([
      ['note:E', 'note:F'],
      ['find:E', 'find:F'],
      ['note:G', 'note:E'],
      ['find:G'],
    ]);
  });

  it('caps partner blocks at the block size and skips items without a fact', () => {
    const frontier = both(['note:A', 'x1', 'find:A', 'find:A']);
    expect(ids(planNewBlocks(frontier, 2, fact))).toEqual([
      ['note:A', 'x1'],
      ['find:A', 'find:A'],
    ]);
    expect(ids(planNewBlocks(both(['x1', 'x2', 'x3']), 2, fact))).toEqual([['x1', 'x2'], ['x3']]);
  });
});

describe('blockGuideLevel', () => {
  it('shows full guides on the worked example, then fades to the skill level', () => {
    expect([0, 1, 2, 3].map((rep) => blockGuideLevel(rep, 3, 0))).toEqual([3, 2, 1, 0]);
    expect([0, 1, 2, 3, 4].map((rep) => blockGuideLevel(rep, 3, 1))).toEqual([3, 2, 2, 1, 1]);
    expect([0, 1, 3].map((rep) => blockGuideLevel(rep, 3, 3))).toEqual([3, 3, 3]);
    expect(blockGuideLevel(1, 0, 0)).toBe(3);
  });
});

describe('buildSession', () => {
  it('fills a session with new items in blocks when nothing is due', () => {
    const plan = buildSession({ now, minutes: 2, cards: [], frontier: items(20), scheduler: s });
    // 17 slots → one block of 4 items × (worked example + 3 reps).
    expect(plan).toHaveLength(16);
    expect(new Set(plan.map((e) => e.itemId)).size).toBe(4);
    expect(plan.slice(0, 4).every((e) => e.guided)).toBe(true);
    expect(plan.slice(4).some((e) => e.guided)).toBe(false);
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
    // 14 reviews leave 6 slots: one new item × 4 reps. New material is left, so
    // the spare 2 slots are not topped up past the cap.
    expect(reviews).toHaveLength(14);
    expect(plan.filter((e) => e.kind === 'new')).toHaveLength(4);
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

describe('buildSession new blocks', () => {
  it('pairs each fact with its other direction in the next block', () => {
    const frontier: Item[] = ['note:A', 'note:B', 'find:B', 'find:A'].map((id) => ({
      id,
      skillId: 'sk',
    }));
    const plan = buildSession({
      now,
      minutes: 5,
      cards: [],
      frontier,
      scheduler: s,
      factOf: (i) => ({ fact: i.id.split(':')[1]!, direction: i.id.split(':')[0]! }),
      config: {
        secondsPerItem: 7,
        reviewShare: 0.7,
        newBlockSize: 2,
        newBlockReps: 3,
        retryGap: 3,
      },
    });
    expect(plan.slice(0, 8).every((e) => e.block === 'note:A')).toBe(true);
    // Partners keep their frontier order.
    expect(plan.slice(8).map((e) => e.itemId)).toEqual(Array(4).fill(['find:B', 'find:A']).flat());
  });

  it('stops at a partial block when the session is nearly full', () => {
    const plan = buildSession({
      now,
      minutes: 1,
      cards: [],
      frontier: items(10),
      scheduler: s,
      maxItems: 10,
    });
    // Two items × 4 reps fit; the rest of the 4-item block waits.
    expect(plan).toHaveLength(8);
    expect(new Set(plan.map((e) => e.itemId))).toEqual(new Set(['n0', 'n1']));
  });
});

describe('inLearningStep', () => {
  it('is true for a (re)learning card due before the session ends', () => {
    const fresh = s.review(s.newCard({ id: 'a', skillId: 'sk' }, now), Rating.Hard, now);
    const soon = new Date(now.getTime() + 10 * 60_000);
    expect(inLearningStep(fresh, soon)).toBe(true);
    expect(inLearningStep(fresh, now)).toBe(false);
    const known = s.seedKnownCard({ id: 'b', skillId: 'sk' }, new Date(now.getTime() - 5 * DAY), 3);
    expect(inLearningStep(known, soon)).toBe(false);
    const lapsed = s.review(known, Rating.Again, now);
    expect(inLearningStep(lapsed, soon)).toBe(true);
  });
});

describe('blockBoundary', () => {
  const e = (itemId: string, block?: string): SessionEntry => ({
    itemId,
    skillId: 'sk',
    kind: block ? 'new' : 'review',
    guided: false,
    ...(block ? { block } : {}),
  });

  it('skips to the end of a running block', () => {
    const q = [e('r1'), e('a', 'a'), e('b', 'a'), e('x'), e('a', 'a'), e('c', 'c'), e('r2')];
    expect(blockBoundary(q, 0)).toBe(0);
    expect(blockBoundary(q, 1)).toBe(1);
    expect(blockBoundary(q, 2)).toBe(5);
    expect(blockBoundary(q, 6)).toBe(6);
    expect(blockBoundary(q, 9)).toBe(7);
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
