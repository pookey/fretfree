import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import {
  SEED_CONFUSIONS,
  bumpConfusion,
  confusionMatrix,
  learnedWeight,
  pairConfusables,
  weightOf,
  type ConfusionMatrix,
} from './confusions';
import { createScheduler } from './scheduler';
import { buildSession, type SessionEntry } from './session';
import type { CardRecord, ConfusionRecord } from './model';

const now = new Date('2026-10-18T09:00:00Z');
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const cfg = ENGINE_CONFIG.confusions;
const half = cfg.halfLifeDays;

const entry = (itemId: string, kind: SessionEntry['kind'] = 'review'): SessionEntry => ({
  itemId,
  skillId: 'sk',
  kind,
  guided: false,
});
/** Test items are named by their concept's first letter: `E1` tests E. */
const concept = (id: string) => id[0] ?? null;
const ids = (es: readonly SessionEntry[]) => es.map((e) => e.itemId);
const matrixOf = (pairs: [string, string, number][]): ConfusionMatrix =>
  confusionMatrix(
    pairs.map(([a, b, weight]) => ({ a, b, count: 1, weight, lastAt: now })),
    now,
    [],
  );

/** Deterministic PRNG (mulberry32) for the randomised pairing checks. */
function rng(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('learnedWeight', () => {
  it('halves every half-life since the pair was last confused', () => {
    const r: ConfusionRecord = { a: 'E', b: 'G', count: 3, weight: 2, lastAt: daysAgo(half) };
    expect(learnedWeight(r, now)).toBeCloseTo(1);
    expect(learnedWeight({ ...r, lastAt: daysAgo(2 * half) }, now)).toBeCloseTo(0.5);
    expect(learnedWeight({ ...r, lastAt: now }, now)).toBe(2);
  });

  it('never grows for a timestamp in the future', () => {
    expect(learnedWeight({ a: 'E', b: 'G', count: 1, weight: 1, lastAt: daysAgo(-3) }, now)).toBe(
      1,
    );
  });

  it('keeps the count of rows saved before decay was tracked', () => {
    expect(learnedWeight({ a: 'E', b: 'G', count: 4 }, now)).toBe(4);
  });
});

describe('bumpConfusion', () => {
  it('adds one to the decayed weight and stamps the time', () => {
    const first = bumpConfusion({ a: 'E', b: 'G', count: 0 }, daysAgo(half));
    expect(first).toEqual({ a: 'E', b: 'G', count: 1, weight: 1, lastAt: daysAgo(half) });
    const second = bumpConfusion(first, now);
    expect(second.count).toBe(2);
    expect(second.weight).toBeCloseTo(1.5);
    expect(second.lastAt).toEqual(now);
  });

  it('starts a legacy row from its count', () => {
    expect(bumpConfusion({ a: 'E', b: 'G', count: 3 }, now).weight).toBe(4);
  });
});

describe('confusionMatrix', () => {
  it('seeds the pairs every learner confuses, in either order', () => {
    const m = confusionMatrix([], now);
    for (const [a, b] of [
      ['E', 'F'],
      ['C', 'B'],
      ['triad:maj', 'triad:min'],
      ['caged:A', 'caged:C'],
      ['M3', 'm3'],
      ['P5', 'TT'],
    ] as const) {
      expect(weightOf(m, a, b)).toBe(cfg.seedWeight);
    }
    expect(weightOf(m, 'E', 'G')).toBe(0);
    expect(weightOf(m, 'E', 'E')).toBe(0);
    expect(SEED_CONFUSIONS.length).toBe(m.size);
  });

  it('merges learned confusions with the seeds', () => {
    const m = confusionMatrix(
      [
        { a: 'E', b: 'F', count: 2, weight: 2, lastAt: now },
        { a: 'A', b: 'G', count: 1, weight: 1, lastAt: now },
      ],
      now,
    );
    expect(weightOf(m, 'F', 'E')).toBe(2 + cfg.seedWeight);
    expect(weightOf(m, 'G', 'A')).toBe(1);
  });

  it('forgets learned confusions that have decayed away, but keeps the seeds', () => {
    const old = (a: string, b: string, days: number): ConfusionRecord => ({
      a,
      b,
      count: 1,
      weight: 1,
      lastAt: daysAgo(days),
    });
    // One mistake drops below the 0.25 floor after two half-lives.
    const m = confusionMatrix([old('A', 'G', 3 * half), old('E', 'F', 3 * half)], now);
    expect(weightOf(m, 'A', 'G')).toBe(0);
    expect(weightOf(m, 'E', 'F')).toBe(cfg.seedWeight);
    // A recent mistake outweighs a seed.
    expect(weightOf(confusionMatrix([old('A', 'G', 1)], now), 'A', 'G')).toBeGreaterThan(
      cfg.seedWeight,
    );
  });

  it('ignores self-pairs, never-counted rows and self-seeds', () => {
    const m = confusionMatrix(
      [
        { a: 'E', b: 'E', count: 5 },
        { a: 'A', b: 'G', count: 0 },
      ],
      now,
      [['C', 'C']],
    );
    expect(m.size).toBe(0);
  });
});

describe('pairConfusables', () => {
  const ef = matrixOf([['E', 'F', 1]]);

  it('pulls a later partner forward to sit right after its pair', () => {
    const out = pairConfusables(
      ['E1', 'X1', 'F1', 'X2'].map((id) => entry(id)),
      ef,
      concept,
    );
    expect(ids(out.entries)).toEqual(['E1', 'F1', 'X1', 'X2']);
    expect([...out.joined]).toEqual([0]);
  });

  it('pairs whichever of the two comes due first, with the partner after it', () => {
    const out = pairConfusables(
      ['F1', 'X1', 'E1'].map((id) => entry(id)),
      ef,
      concept,
    );
    expect(ids(out.entries)).toEqual(['F1', 'E1', 'X1']);
  });

  it('picks the most confusable partner in reach', () => {
    const m = matrixOf([
      ['E', 'F', 1],
      ['E', 'G', 3],
    ]);
    const out = pairConfusables(
      ['E1', 'F1', 'G1'].map((id) => entry(id)),
      m,
      concept,
    );
    expect(ids(out.entries)).toEqual(['E1', 'G1', 'F1']);
  });

  it('pairs each item once', () => {
    const out = pairConfusables(
      ['E1', 'F1', 'E2', 'F2'].map((id) => entry(id)),
      ef,
      concept,
    );
    expect(ids(out.entries)).toEqual(['E1', 'F1', 'E2', 'F2']);
    expect([...out.joined]).toEqual([0, 2]);
  });

  it('never delays a due review more than maxDelay slots', () => {
    // Pulling F1 forward pushes X1–X3 back one slot each.
    const queue = ['E1', 'X1', 'X2', 'X3', 'F1'].map((id) => entry(id));
    expect(ids(pairConfusables(queue, ef, concept, 3).entries)).toEqual([
      'E1',
      'F1',
      'X1',
      'X2',
      'X3',
    ]);
    // With a budget of 0 only an adjacent partner could pair.
    expect(ids(pairConfusables(queue, ef, concept, 0).entries)).toEqual(ids(queue));
    const chained = ['E1', 'E2', 'X1', 'F1', 'F2'].map((id) => entry(id));
    const out = pairConfusables(chained, ef, concept, 1);
    // E1 takes F1, pushing E2 and X1 back once; E2 can't reach F2 without pushing X1 again.
    expect(ids(out.entries)).toEqual(['E1', 'F1', 'E2', 'X1', 'F2']);
  });

  it('leaves non-review entries and concept-less items unpaired', () => {
    const out = pairConfusables([entry('E1'), entry('F1', 'new'), entry('?1')], ef, (id) =>
      id.startsWith('?') ? null : concept(id),
    );
    expect(ids(out.entries)).toEqual(['E1', 'F1', '?1']);
    expect(out.joined.size).toBe(0);
  });

  it('keeps every entry, bounds each delay and places paired items side by side (randomised)', () => {
    const m = matrixOf([
      ['E', 'F', 2],
      ['B', 'C', 1],
      ['A', 'G', 0.5],
      ['E', 'G', 1.5],
    ]);
    const letters = 'ABCDEFG';
    for (let seed = 1; seed <= 200; seed++) {
      const next = rng(seed);
      const queue = Array.from({ length: 3 + Math.floor(next() * 25) }, (_, i) =>
        entry(
          `${letters[Math.floor(next() * letters.length)]}${i}`,
          next() < 0.1 ? 'new' : 'review',
        ),
      );
      const maxDelay = Math.floor(next() * 4);
      const out = pairConfusables(queue, m, concept, maxDelay);
      // Nothing is dropped or added: due reviews are only reordered.
      expect(ids(out.entries).sort()).toEqual(ids(queue).sort());
      out.entries.forEach((e, at) => {
        expect(at - queue.indexOf(e)).toBeLessThanOrEqual(maxDelay);
      });
      for (const i of out.joined) {
        const [x, y] = [out.entries[i]!, out.entries[i + 1]!];
        expect(weightOf(m, concept(x.itemId)!, concept(y.itemId)!)).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildSession confusable pairing', () => {
  const s = createScheduler({ enableFuzz: false });
  function dueCard(id: string, ageDays: number): CardRecord {
    const then = daysAgo(ageDays);
    return s.review(s.newCard({ id, skillId: 'sk' }, then), Rating.Good, then);
  }
  const plan = (cards: CardRecord[], confusions: ConfusionRecord[] = []) =>
    ids(
      buildSession({
        now,
        minutes: 1,
        cards,
        frontier: [],
        scheduler: s,
        maxItems: 20,
        confusions,
        conceptOf: concept,
      }),
    );
  const gapOf = (out: string[], x: string, y: string) => Math.abs(out.indexOf(x) - out.indexOf(y));

  it('pairs seed confusions from the first session, with nothing learned yet', () => {
    // Oldest first: E1 is the least retrievable, F1 the most.
    const out = plan([dueCard('E1', 40), dueCard('X1', 30), dueCard('F1', 20)]);
    expect(out).toEqual(['E1', 'F1', 'X1']);
  });

  it('pairs learned confusions, and stops once they decay', () => {
    const cards = [dueCard('A1', 40), dueCard('X1', 30), dueCard('G1', 20)];
    const fresh: ConfusionRecord = { a: 'A', b: 'G', count: 1, weight: 1, lastAt: daysAgo(1) };
    expect(gapOf(plan(cards, [fresh]), 'A1', 'G1')).toBe(1);
    const stale = { ...fresh, lastAt: daysAgo(5 * half) };
    expect(plan(cards, [stale])).toEqual(['A1', 'X1', 'G1']);
  });

  it('keeps every due review, each within maxDelay of its due order', () => {
    const order = ['E1', 'X1', 'X2', 'B1', 'X3', 'F1', 'C1', 'X4'];
    const cards = order.map((id, i) => dueCard(id, 60 - i * 5));
    const out = plan(cards);
    expect([...out].sort()).toEqual([...order].sort());
    out.forEach((id, at) => expect(at - order.indexOf(id)).toBeLessThanOrEqual(cfg.maxDelay));
    expect(gapOf(out, 'B1', 'C1')).toBe(1);
  });

  it('never splits a pair with a block of new items', () => {
    const cards = [dueCard('X1', 40), dueCard('E1', 30), dueCard('X2', 20), dueCard('F1', 10)];
    const out = buildSession({
      now,
      minutes: 1,
      cards,
      frontier: [{ id: 'n1', skillId: 'sk' }],
      scheduler: s,
      maxItems: 8,
      conceptOf: concept,
      config: { ...ENGINE_CONFIG.session, reviewShare: 0.5, newBlockSize: 1, newBlockReps: 1 },
    });
    // Without the guard the block would land at the even split, between E1 and F1.
    expect(ids(out)).toEqual(['X1', 'E1', 'F1', 'n1', 'n1', 'X2']);
  });
});
