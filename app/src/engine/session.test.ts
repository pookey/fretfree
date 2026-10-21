import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import { createScheduler } from './scheduler';
import {
  blockBoundary,
  blockGuideLevel,
  buildSession,
  dueReviews,
  inLearningStep,
  laneQuotas,
  newItemBlock,
  newItemCap,
  planNewBlocks,
  retrievalPass,
  type FactRef,
  scheduleRetry,
  sessionLength,
  type SessionEntry,
} from './session';
import { frontierLanes, moduleOfTopic } from './frontier';
import { deriveStatus, isFrontier } from './mastery';
import type { CardRecord, Goal, Item, SkillStatus } from './model';
import type { SessionLane } from './session';
import { SKILLS } from './skills';

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

describe('dueReviews near-ties', () => {
  // Placement seeds every known card with the same `now` and stability, so a
  // whole batch comes due with identical retrievability.
  const placedAt = new Date(now.getTime() - 12 * DAY);
  const seeded = (skillId: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      s.seedKnownCard({ id: `${skillId}-${i}`, skillId }, placedAt),
    );
  const batch = [...seeded('a', 4), ...seeded('b', 4), ...seeded('c', 4)];
  const skills = (cards: readonly CardRecord[]) => cards.map((c) => c.skillId);
  /** A small deterministic PRNG (mulberry32). */
  const seededRng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const backToBack = (seq: readonly string[]) => seq.filter((x, i) => x === seq[i - 1]).length;

  it('interleaves a seeded batch from three skills', () => {
    expect(skills(dueReviews(batch, s, now))).toEqual(Array(4).fill(['a', 'b', 'c']).flat());
    const shuffled = dueReviews(batch, s, now, { rng: seededRng(7) });
    expect(shuffled).toHaveLength(12);
    expect(backToBack(skills(shuffled))).toBe(0);
  });

  it('balances uneven skills and alternates drills between them', () => {
    // Three one-item skills on one drill and a three-item skill across two
    // drills, as in the M2 QA batch: neither skills nor drills sit together.
    const cards = [
      ...seeded('t', 3),
      ...['x', 'y', 'z'].map((skillId) =>
        s.seedKnownCard({ id: `oct-${skillId}`, skillId }, placedAt),
      ),
    ];
    const drillOf = (id: string) => (id.startsWith('oct') ? 'D4' : id === 't-0' ? 'D6' : 'D5');
    const drills = (order: readonly CardRecord[]) => order.map((c) => drillOf(c.itemId));
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const order = dueReviews(cards, s, now, { rng: seededRng(seed), drillOf });
      expect(backToBack(skills(order)), `seed ${seed}`).toBe(0);
      expect(backToBack(drills(order)), `seed ${seed}`).toBe(0);
    }
    // Without a drill key, only skills alternate.
    expect(skills(dueReviews(cards, s, now))).toEqual(['t', 'x', 't', 'y', 'z', 't']);
  });

  it('gives the same order for the same rng', () => {
    const ids = (seed: number) =>
      dueReviews(batch, s, now, { rng: seededRng(seed) }).map((c) => c.itemId);
    expect(ids(3)).toEqual(ids(3));
    expect(new Set(ids(3))).toEqual(new Set(batch.map((c) => c.itemId)));
    expect(ids(3)).not.toEqual(ids(4));
  });

  it('still serves a clearly more overdue card first', () => {
    const overdue = s.seedKnownCard(
      { id: 'c-old', skillId: 'c' },
      new Date(now.getTime() - 40 * DAY),
    );
    for (const rng of [undefined, seededRng(1), seededRng(2)]) {
      const order = dueReviews([...batch, overdue], s, now, { rng });
      expect(order[0]?.itemId).toBe('c-old');
      expect(order).toHaveLength(13);
    }
  });

  it('carries the last skill and drill across a run boundary', () => {
    // `a-old` is its own run; the tied run after it would open on `a-0` by item ID.
    const old = s.seedKnownCard({ id: 'a-old', skillId: 'a' }, new Date(now.getTime() - 40 * DAY));
    const tied = [...seeded('a', 1), ...seeded('b', 1)];
    expect(dueReviews([old, ...tied], s, now).map((c) => c.itemId)).toEqual([
      'a-old',
      'b-0',
      'a-0',
    ]);
    // Skills differ either way, so the drill decides: `b-0` shares `a-old`'s drill.
    const others = [...seeded('b', 1), ...seeded('c', 1)];
    const drillOf = (id: string) => (id === 'c-0' ? 'D2' : 'D1');
    expect(dueReviews([old, ...others], s, now, { drillOf }).map((c) => c.itemId)).toEqual([
      'a-old',
      'c-0',
      'b-0',
    ]);
  });

  it('keeps overdue order outside the window', () => {
    const card = (skillId: string, age: number) => ({
      ...dueCard(`${skillId}${age}`, age),
      skillId,
    });
    const cards = [card('b', 5), card('a', 40), card('b', 4), card('a', 39)];
    // Days apart is well outside a zero window: skill a's items stay first, back to back.
    expect(dueReviews(cards, s, now, { window: 0 }).map((c) => c.itemId)).toEqual([
      'a40',
      'a39',
      'b5',
      'b4',
    ]);
    // A window wide enough to tie everything mixes the skills instead.
    expect(skills(dueReviews(cards, s, now, { window: 1 }))).toEqual(['a', 'b', 'a', 'b']);
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
    const plan = buildSession({
      now,
      minutes: 2,
      cards: [],
      frontier: items(20),
      scheduler: s,
      maxNew: 8,
    });
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
      maxItems: 27,
    });
    const reviews = plan.filter((e) => e.kind === 'review');
    // 18 reviews leave 9 slots: two new items × 4 reps. New material is left, so
    // the spare slot is not topped up past the cap.
    expect(reviews).toHaveLength(18);
    expect(plan.filter((e) => e.kind === 'new')).toHaveLength(8);
    expect(plan[0]?.kind).toBe('review');
    expect(plan.at(-1)?.kind).toBe('review');
  });

  it('leaves out a lone new item rather than repeat it back to back', () => {
    const cards = Array.from({ length: 40 }, (_, i) => dueCard(`r${i}`, 3 + i));
    // 14 reviews leave 6 slots: room for one new item only.
    const plan = buildSession({
      now,
      minutes: 2,
      cards,
      frontier: items(10),
      scheduler: s,
      maxItems: 20,
    });
    expect(plan.filter((e) => e.kind === 'new')).toHaveLength(0);
    expect(plan.filter((e) => e.kind === 'review')).toHaveLength(14);
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

describe('buildSession due ties', () => {
  it('interleaves a placement-seeded batch before capping it', () => {
    const placedAt = new Date(now.getTime() - 12 * DAY);
    const cards = ['a', 'b', 'c'].flatMap((skillId) =>
      Array.from({ length: 10 }, (_, i) =>
        s.seedKnownCard({ id: `${skillId}${i}`, skillId }, placedAt),
      ),
    );
    const plan = buildSession({
      now,
      minutes: 1,
      cards,
      frontier: items(4),
      scheduler: s,
      maxItems: 10,
      rng: () => 0.5,
    });
    const reviews = plan.filter((e) => e.kind === 'review').map((e) => e.skillId);
    expect(reviews).toHaveLength(7);
    expect(new Set(reviews)).toEqual(new Set(['a', 'b', 'c']));
    expect(reviews.some((x, i) => x === reviews[i - 1])).toBe(false);
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
      config: { ...ENGINE_CONFIG.session, newBlockSize: 2 },
    });
    expect(plan.slice(0, 8).every((e) => e.block === 'note:A')).toBe(true);
    // Partners keep their frontier order.
    expect(plan.slice(8).map((e) => e.itemId)).toEqual(Array(4).fill(['find:B', 'find:A']).flat());
  });

  it('stops at a partial block when the session is nearly full', () => {
    const plan = buildSession({
      now,
      minutes: 10,
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

describe('newItemCap', () => {
  it('is eight at ten minutes, scaled by minutes, never below one block', () => {
    expect(newItemCap(10)).toBe(ENGINE_CONFIG.session.maxNewPerSession);
    expect(newItemCap(5)).toBe(4);
    expect(newItemCap(15)).toBe(12);
    expect(newItemCap(2)).toBe(ENGINE_CONFIG.session.newBlockSize);
  });

  it('rises while recent accuracy is above the adaptive band', () => {
    expect(newItemCap(10, 0.95)).toBe(12);
    expect(newItemCap(10, 0.92)).toBe(8);
    expect(newItemCap(10, 0.5)).toBe(8);
  });
});

describe('laneQuotas', () => {
  it('deals by share, and hands what a lane can’t take to the rest', () => {
    expect(laneQuotas([20, 20, 20], [2, 1, 1], 8)).toEqual([4, 2, 2]);
    expect(laneQuotas([20, 20, 20, 20], [2, 1, 0.5, 0.5], 8)).toEqual([4, 2, 1, 1]);
    expect(laneQuotas([1, 20, 20], [2, 1, 1], 8)).toEqual([1, 4, 3]);
    expect(laneQuotas([3], [1], 8)).toEqual([3]);
    expect(laneQuotas([5, 5], [0, 1], 8)).toEqual([0, 5]);
    expect(laneQuotas([], [], 8)).toEqual([]);
  });

  it('deals in units, and breaks ties by rank', () => {
    expect(laneQuotas([20, 20, 20], [2, 1, 1], 8, { unit: 2 })).toEqual([4, 2, 2]);
    // Four items, two units: the goal, then whichever tied lane ranks first.
    expect(laneQuotas([20, 20, 20], [2, 1, 1], 4, { unit: 2 })).toEqual([2, 2, 0]);
    expect(laneQuotas([20, 20, 20], [2, 1, 1], 4, { unit: 2, rank: [0, 2, 1] })).toEqual([2, 0, 2]);
    // A lane with one item left takes it; an odd count ends on a single.
    expect(laneQuotas([1, 20], [1, 1], 4, { unit: 2 })).toEqual([1, 3]);
    expect(laneQuotas([20], [1], 3, { unit: 2 })).toEqual([3]);
  });

  it('grows a dealt lane with an odd remainder rather than open one with a single', () => {
    const three = [20, 20, 20];
    const four = [20, 20, 20, 20];
    const unit = { unit: 2 };
    expect(laneQuotas(three, [2, 1, 1], 3, unit)).toEqual([3, 0, 0]);
    expect(laneQuotas(three, [2, 1, 1], 5, unit)).toEqual([3, 2, 0]);
    expect(laneQuotas(three, [2, 1, 1], 7, unit)).toEqual([3, 2, 2]);
    expect(laneQuotas(four, [2, 1, 0.5, 0.5], 3, unit)).toEqual([3, 0, 0, 0]);
    expect(laneQuotas(four, [2, 1, 0.5, 0.5], 5, unit)).toEqual([3, 2, 0, 0]);
    // Two half shares never win a unit alone; `buildSession` merges a group first.
    expect(laneQuotas(four, [2, 1, 0.5, 0.5], 7, unit)).toEqual([5, 2, 0, 0]);
    // A single that ends a lane's pool is fine; one with nowhere to go is left out.
    expect(laneQuotas([1, 20], [2, 1], 3, unit)).toEqual([1, 2]);
    expect(laneQuotas([20], [1], 1, unit)).toEqual([0]);
    expect(laneQuotas([2, 20], [2, 1], 3, unit)).toEqual([2, 0]);
  });

  it('never deals a lane a single short of a block (exhaustive)', () => {
    const POOL_SIZES = [1, 2, 3, 5, 30];
    const SHARES = [
      [2, 1, 1, 1],
      [2, 1, 0.5, 0.5],
    ];
    const pools = (n: number): number[][] =>
      n === 0 ? [[]] : pools(n - 1).flatMap((p) => POOL_SIZES.map((size) => [...p, size]));
    for (let lanes = 1; lanes <= 4; lanes++) {
      for (const sizes of pools(lanes)) {
        for (const shares of SHARES.map((sh) => sh.slice(0, lanes))) {
          for (const rank of [sizes.map((_, i) => i), sizes.map((_, i) => lanes - 1 - i)]) {
            for (let count = 1; count <= 24; count++) {
              const out = laneQuotas(sizes, shares, count, { unit: 2, rank });
              const dealt = out.reduce((n, q) => n + q, 0);
              const why = JSON.stringify({ sizes, shares, rank, count, out });
              expect(dealt, why).toBeLessThanOrEqual(count);
              // At most an odd remainder of one is left for another day.
              const room = sizes.reduce((n, size) => n + size, 0);
              expect(dealt, why).toBeGreaterThanOrEqual(Math.min(count, room) - 1);
              out.forEach((q, i) => {
                expect(q, why).toBeLessThanOrEqual(sizes[i]!);
                // None, a full block, or the lane's last item(s).
                expect(q === 0 || q >= 2 || q === sizes[i], why).toBe(true);
              });
            }
          }
        }
      }
    }
  });
});

describe('retrievalPass', () => {
  it('recalls each item once, round-robin across skills, in the order introduced', () => {
    const pass = retrievalPass([
      { id: 'a1', skillId: 'a' },
      { id: 'a2', skillId: 'a' },
      { id: 'b1', skillId: 'b' },
    ]);
    expect(pass.map((e) => e.itemId)).toEqual(['a1', 'b1', 'a2']);
    expect(pass.every((e) => e.kind === 'stretch' && !e.guided && e.block === undefined)).toBe(
      true,
    );
  });
});

describe('buildSession lanes', () => {
  const lane = (id: string, share: number, n: number) => ({ id, share, items: items(n, id) });

  it('draws new blocks round-robin by share, up to the cap, never mixing lanes', () => {
    const plan = buildSession({
      now,
      minutes: 10,
      cards: [],
      lanes: [lane('g', 2, 20), lane('n', 1, 20), lane('p', 1, 20)],
      scheduler: s,
    });
    const fresh = new Set(plan.map((e) => e.itemId));
    expect(fresh.size).toBe(8);
    expect([...fresh].filter((id) => id.startsWith('g'))).toEqual(['g0', 'g1', 'g2', 'g3']);
    expect([...fresh].filter((id) => id.startsWith('n'))).toEqual(['n0', 'n1']);
    expect([...fresh].filter((id) => id.startsWith('p'))).toEqual(['p0', 'p1']);
    // Each block keeps to one lane, and the goal's comes first.
    const blocks = new Map<string, Set<string>>();
    for (const e of plan)
      blocks.set(e.block!, (blocks.get(e.block!) ?? new Set()).add(e.itemId[0]!));
    expect([...blocks.values()].every((lanes) => lanes.size === 1)).toBe(true);
    expect(plan[0]?.itemId).toBe('g0');
  });

  const parallel = (id: string, n: number) => ({ ...lane(id, 0.5, n), group: 'parallel' });
  const fourLanes = () => [
    lane('g', 2, 30),
    lane('n', 1, 30),
    parallel('e', 30),
    parallel('r', 30),
  ];
  const blockSizes = (plan: readonly SessionEntry[]) => {
    const size = new Map<string, Set<string>>();
    for (const e of plan) size.set(e.block!, (size.get(e.block!) ?? new Set()).add(e.itemId));
    return [...size.values()].map((b) => b.size);
  };

  it.each([5, 10, 15])('never makes a one-item block at %i minutes with four lanes', (minutes) => {
    for (const accuracy of [null, 1]) {
      const plan = buildSession({
        now,
        minutes,
        cards: [],
        lanes: fourLanes(),
        scheduler: s,
        maxNew: newItemCap(minutes, accuracy),
      });
      expect(new Set(plan.map((e) => e.itemId)).size).toBe(newItemCap(minutes, accuracy));
      expect(Math.min(...blockSizes(plan))).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives the parallel turn to the track introduced least recently', () => {
    const plan = (cards: CardRecord[]) =>
      new Set(
        buildSession({ now, minutes: 10, cards, lanes: fourLanes(), scheduler: s })
          .filter((e) => e.itemId.startsWith('e') || e.itemId.startsWith('r'))
          .map((e) => e.itemId[0]),
      );
    // Neither introduced yet: lane order, Ear.
    expect(plan([])).toEqual(new Set(['e']));
    const at = (id: string, daysAgo: number) =>
      s.newCard({ id, skillId: 'sk' }, new Date(now.getTime() - daysAgo * DAY));
    // Ear came yesterday, Rhythm three days ago: Rhythm's turn.
    expect(plan([at('e0', 1), at('r0', 3)])).toEqual(new Set(['r']));
    expect(plan([at('e0', 3), at('r0', 1)])).toEqual(new Set(['e']));
  });

  /**
   * A lane of `n` items over facts in both directions, names first and finds
   * after, as F2's are, so blocks pull in partners of the other direction.
   */
  const factLane = (id: string, share: number, n: number, group?: string): SessionLane => {
    const half = Math.ceil(n / 2);
    const ids = Array.from({ length: n }, (_, k) =>
      k < half ? `${id}:name:${k}` : `${id}:find:${k - half}`,
    );
    return {
      id,
      share,
      items: ids.map((x) => ({ id: x, skillId: id })),
      ...(group !== undefined ? { group } : {}),
    };
  };
  const factOfId = (i: Item): FactRef => {
    const [lane, direction, k] = i.id.split(':');
    return { fact: `${lane}:${k}`, direction: direction! };
  };

  /** Each one-item block is its lane's last item: the lane's whole pool was dealt. */
  function expectNoLoneBlocks(
    plan: readonly SessionEntry[],
    lanes: readonly SessionLane[],
    why: string,
  ) {
    const blocks = new Map<string, Set<string>>();
    for (const e of plan.filter((x) => x.kind === 'new')) {
      blocks.set(e.block!, (blocks.get(e.block!) ?? new Set()).add(e.itemId));
    }
    for (const [block, ids] of blocks) {
      if (ids.size > 1) continue;
      const laneId = block.split(':')[0];
      const pool = lanes.find((l) => l.id === laneId)!.items.length;
      const dealt = new Set(
        plan
          .filter((e) => e.kind === 'new' && e.itemId.startsWith(`${laneId}:`))
          .map((e) => e.itemId),
      ).size;
      expect(dealt, `${why}: lone block ${block}`).toBe(pool);
    }
  }

  it.each([3, 5, 7])('makes no one-item block with four lanes and maxNew %i', (maxNew) => {
    const lanes = fourLanes();
    const plan = buildSession({ now, minutes: 10, cards: [], lanes, scheduler: s, maxNew });
    expect(Math.min(...blockSizes(plan))).toBeGreaterThanOrEqual(2);
    expect(new Set(plan.map((e) => e.itemId)).size).toBeGreaterThanOrEqual(maxNew - 1);
  });

  it('makes no one-item block for any cap, pool or partner split (exhaustive)', () => {
    const POOL_SIZES = [1, 2, 3, 30];
    for (const a of POOL_SIZES)
      for (const b of POOL_SIZES)
        for (const c of POOL_SIZES)
          for (const d of POOL_SIZES) {
            const lanes = [
              factLane('g', 2, a),
              factLane('n', 1, b),
              factLane('e', 0.5, c, 'parallel'),
              factLane('r', 0.5, d, 'parallel'),
            ];
            for (let maxNew = 1; maxNew <= 24; maxNew++) {
              const why = JSON.stringify({ pools: [a, b, c, d], maxNew });
              const plan = buildSession({
                now,
                minutes: 15,
                cards: [],
                lanes,
                scheduler: s,
                maxNew,
                maxItems: 200,
                factOf: factOfId,
              });
              expectNoLoneBlocks(plan, lanes, why);
              const fresh = new Set(plan.map((e) => e.itemId)).size;
              expect(fresh, why).toBeLessThanOrEqual(maxNew);
            }
          }
  });

  it('gives both tracks a block when the cap has room', () => {
    const plan = buildSession({
      now,
      minutes: 15,
      cards: [],
      lanes: fourLanes(),
      scheduler: s,
      maxNew: 18,
    });
    const fresh = new Set(plan.map((e) => e.itemId[0]));
    expect(fresh).toEqual(new Set(['g', 'n', 'e', 'r']));
    expect(Math.min(...blockSizes(plan))).toBeGreaterThanOrEqual(2);
  });

  it('takes `maxNew` over the cap, and fills with due reviews once it is spent', () => {
    const cards = Array.from({ length: 30 }, (_, i) => dueCard(`r${i}`, 3 + i));
    const plan = buildSession({
      now,
      minutes: 10,
      cards,
      lanes: [lane('g', 2, 20)],
      scheduler: s,
      maxItems: 30,
      maxNew: 2,
    });
    expect(plan.filter((e) => e.kind === 'new')).toHaveLength(8);
    // 21 reviews fit the 70% share; the cap leaves room for one more.
    expect(plan.filter((e) => e.kind === 'review')).toHaveLength(22);
    // A cap of one can't make a block: due reviews fill the session instead.
    const one = buildSession({
      now,
      minutes: 10,
      cards,
      lanes: [lane('g', 2, 20)],
      scheduler: s,
      maxItems: 30,
      maxNew: 1,
    });
    expect(one.filter((e) => e.kind === 'new')).toHaveLength(0);
    expect(one.filter((e) => e.kind === 'review')).toHaveLength(30);
    const none = buildSession({
      now,
      minutes: 10,
      cards: [],
      lanes: [lane('g', 2, 5)],
      scheduler: s,
      maxNew: 0,
    });
    expect(none).toEqual([]);
  });
});

/** Frontier lanes as the runner hands them to `buildSession`. */
const toLanes = (lanes: ReturnType<typeof frontierLanes>): SessionLane[] =>
  lanes.map((l) => ({
    id: l.id,
    share: l.share,
    items: l.skills.flatMap((skill) => skill.items()),
    ...(l.group !== undefined ? { group: l.group } : {}),
  }));

/**
 * The first sessions of a new learner with the registered skills: each
 * session's new items are answered (one Good review) and their skills become
 * practising, a day apart. `mastered` skills start mastered (F1 opens Keys).
 */
function firstSessions(
  goal: Goal,
  count: number,
  { minutes = 10, mastered = [] as readonly string[] } = {},
): SessionEntry[][] {
  const statuses = new Map<string, SkillStatus>(mastered.map((id) => [id, 'mastered']));
  const cards: CardRecord[] = [];
  const plans: SessionEntry[][] = [];
  for (let k = 0; k < count; k++) {
    const at = new Date(now.getTime() + k * DAY);
    const frontier = SKILLS.filter((skill) => {
      const status = deriveStatus(skill, statuses, statuses.get(skill.id));
      statuses.set(skill.id, status);
      return isFrontier(status);
    });
    const lanes = toLanes(frontierLanes(frontier, goal, { firstSession: cards.length === 0 }));
    const plan = buildSession({ now: at, minutes, cards, lanes, scheduler: s });
    plans.push(plan);
    for (const e of plan.filter((x) => x.kind === 'new' && x.rep === 0)) {
      cards.push(s.review(s.newCard({ id: e.itemId, skillId: e.skillId }, at), Rating.Good, at));
      statuses.set(e.skillId, 'practising');
    }
  }
  return plans;
}

const TOPIC = new Map(SKILLS.map((skill) => [skill.id, skill.topic]));
const moduleOf = (e: SessionEntry) => moduleOfTopic(TOPIC.get(e.skillId) ?? '')?.id;
const newModules = (plan: readonly SessionEntry[]) =>
  new Set(plan.filter((e) => e.kind === 'new').map(moduleOf));

describe.each<Goal>(['songs', 'improvise', 'jazz', 'general'])(
  'the first sessions for %s',
  (goal) => {
    const plans = firstSessions(goal, 3);

    it('a 10-minute day-one session introduces at most the cap, all Neck basics', () => {
      const day1 = plans[0]!.filter((e) => e.kind === 'new');
      expect(new Set(day1.map((e) => e.itemId)).size).toBeLessThanOrEqual(newItemCap(10));
      expect(newModules(plans[0]!)).toEqual(new Set(['notes-1']));
    });

    it('never introduces more than the cap', () => {
      for (const plan of plans) {
        const fresh = new Set(plan.filter((e) => e.kind === 'new').map((e) => e.itemId));
        expect(fresh.size).toBeLessThanOrEqual(newItemCap(10));
      }
    });

    it('serves Ear or Rhythm within the first three sessions', () => {
      const parallel = plans.flatMap((p) => [...newModules(p)]);
      expect(parallel.some((m) => m === 'ear' || m === 'rhythm')).toBe(true);
    });

    it('draws from two open modules in one session', () => {
      const f2 = SKILLS.find((x) => x.id === 'F2.string6-naturals')!;
      const c4 = SKILLS.find((x) => x.id === 'C4.sharp-keys')!;
      const lanes = toLanes(frontierLanes([f2, c4], goal));
      const plan = buildSession({ now, minutes: 10, cards: [], lanes, scheduler: s });
      expect(newModules(plan)).toEqual(new Set(['notes-1', 'keys']));
    });

    it('with Keys open too, Ear and Rhythm both get a turn, in blocks of two or more', () => {
      const F1 = SKILLS.filter((x) => x.topic === 'F1').map((x) => x.id);
      const days = firstSessions(goal, 4, { mastered: F1 });
      const modules = days.flatMap((p) => [...newModules(p)]);
      expect(modules).toContain('keys');
      expect(modules).toContain('ear');
      expect(modules).toContain('rhythm');
      for (const plan of days) {
        const fresh = plan.filter((e) => e.kind === 'new');
        const sizes = new Map<string, Set<string>>();
        for (const e of fresh)
          sizes.set(e.block!, (sizes.get(e.block!) ?? new Set()).add(e.itemId));
        expect(Math.min(...[...sizes.values()].map((b) => b.size))).toBeGreaterThanOrEqual(2);
      }
    });

    it('still puts due reviews first (rule 16)', () => {
      const cards = Array.from({ length: 10 }, (_, i) => dueCard(`note@s6f${i}`, 5 + i));
      const frontier = SKILLS.filter((x) => x.id === 'F2.string5-naturals' || x.id === 'F4.pulse');
      const lanes = toLanes(frontierLanes(frontier, goal));
      const plan = buildSession({ now, minutes: 10, cards, lanes, scheduler: s });
      expect(plan[0]?.kind).toBe('review');
      expect(plan.filter((e) => e.kind === 'review')).toHaveLength(10);
    });
  },
);
