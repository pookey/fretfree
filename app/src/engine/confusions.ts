import { ENGINE_CONFIG } from './config';
import type { ConfusionRecord } from './model';
import type { SessionEntry } from './session';

/**
 * Design §3.3 step 3: the confusion matrix. Seed pairs every learner mixes up
 * are merged with the pairs this learner has actually confused, which decay
 * unless the mistake recurs. The session builder uses it to place confusable
 * items next to each other (research/02 rule 6).
 */

type ConfusionConfig = {
  halfLifeDays: number;
  seedWeight: number;
  minLearnedWeight: number;
  maxDelay: number;
};

const DAY_MS = 86_400_000;

/**
 * Pairs to mix before any are learned, keyed like the drills' `conceptOf`.
 * Triads, CAGED shapes and progressions have no drill yet: their keys are
 * namespaced so they can't collide with pitch classes, and their drills
 * should return these keys.
 */
export const SEED_CONFUSIONS: readonly (readonly [string, string])[] = [
  // Natural notes a semitone apart, with no sharp between them (D1–D4: pitch class).
  ['E', 'F'],
  ['B', 'C'],
  // Interval shapes a fret apart (C3: the interval name).
  ['m3', 'M3'],
  ['m7', 'M7'],
  ['P4', 'TT'],
  ['TT', 'P5'],
  ['triad:maj', 'triad:min'],
  // Chord kinds (C5, D7: `chord:<kind>`): the b7 of 7 vs the 7 of maj7, and m7 vs m7b5.
  ['chord:7', 'chord:maj7'],
  ['chord:m7', 'chord:m7b5'],
  ['caged:C', 'caged:A'],
  ['prog:I-V-vi-IV', 'prog:vi-IV-I-V'],
  // Capo maths the wrong way round (C10, D13): up from the shapes vs down from the song.
  ['capo:up', 'capo:down'],
];

/** Pair weights by unordered concept pair. Read it with `weightOf`. */
export type ConfusionMatrix = ReadonlyMap<string, number>;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** A learned pair's weight at `now`: halved every `halfLifeDays` since it was last confused. */
export function learnedWeight(
  record: ConfusionRecord,
  now: Date,
  cfg: ConfusionConfig = ENGINE_CONFIG.confusions,
): number {
  const base = record.weight ?? record.count;
  // Rows from before decay was tracked keep their count until the pair is next confused.
  if (!record.lastAt) return base;
  const days = Math.max(0, now.getTime() - record.lastAt.getTime()) / DAY_MS;
  return base * 0.5 ** (days / cfg.halfLifeDays);
}

/** The record after one more confusion at `at`: the decayed weight plus one. */
export function bumpConfusion(
  record: ConfusionRecord,
  at: Date,
  cfg: ConfusionConfig = ENGINE_CONFIG.confusions,
): ConfusionRecord {
  return {
    a: record.a,
    b: record.b,
    count: record.count + 1,
    weight: learnedWeight(record, at, cfg) + 1,
    lastAt: at,
  };
}

/** Seed pairs merged with the learned ones that haven't decayed away. */
export function confusionMatrix(
  learned: readonly ConfusionRecord[],
  now: Date,
  seeds: readonly (readonly [string, string])[] = SEED_CONFUSIONS,
  cfg: ConfusionConfig = ENGINE_CONFIG.confusions,
): ConfusionMatrix {
  const out = new Map<string, number>();
  for (const [a, b] of seeds) if (a !== b) out.set(pairKey(a, b), cfg.seedWeight);
  for (const record of learned) {
    if (record.a === record.b) continue;
    const w = learnedWeight(record, now, cfg);
    if (w < cfg.minLearnedWeight) continue;
    const key = pairKey(record.a, record.b);
    out.set(key, (out.get(key) ?? 0) + w);
  }
  return out;
}

export function weightOf(matrix: ConfusionMatrix, a: string, b: string): number {
  return a === b ? 0 : (matrix.get(pairKey(a, b)) ?? 0);
}

export interface PairedEntries {
  entries: SessionEntry[];
  /** Indexes `i` where `entries[i]` and `entries[i + 1]` are a confusable pair, to keep together. */
  joined: ReadonlySet<number>;
}

/**
 * Step 3: place each review right after its most confusable partner, so the
 * learner has to discriminate them. Partners are only pulled earlier, and no
 * entry ends more than `maxDelay` slots after its due order, so pairing never
 * starves the least retrievable reviews. Only review entries are paired.
 */
export function pairConfusables(
  entries: readonly SessionEntry[],
  matrix: ConfusionMatrix,
  conceptOf: (itemId: string) => string | null,
  maxDelay: number = ENGINE_CONFIG.confusions.maxDelay,
): PairedEntries {
  const slots = entries.map((entry, from) => ({
    entry,
    from,
    concept: entry.kind === 'review' ? conceptOf(entry.itemId) : null,
  }));
  const paired = new Set<(typeof slots)[number]>();
  const joined = new Set<number>();
  const delay = (at: number) => at - (slots[at]?.from ?? at);
  for (let i = 0; i < slots.length - 1; i++) {
    const lead = slots[i]!;
    if (lead.concept === null || paired.has(lead)) continue;
    let best = -1;
    let bestWeight = 0;
    for (let j = i + 1; j < slots.length; j++) {
      // Pulling slot j forward pushes every slot between back by one.
      if (j > i + 1 && delay(j - 1) >= maxDelay) break;
      const other = slots[j]!;
      if (other.concept === null || paired.has(other)) continue;
      const w = weightOf(matrix, lead.concept, other.concept);
      if (w > bestWeight) [best, bestWeight] = [j, w];
    }
    if (best < 0) continue;
    const [partner] = slots.splice(best, 1);
    slots.splice(i + 1, 0, partner!);
    paired.add(lead).add(partner!);
    joined.add(i);
  }
  return { entries: slots.map((s) => s.entry), joined };
}
