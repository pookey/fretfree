import { State, createEmptyCard, fsrs, generatorParameters, type FSRS, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import type { CardRecord, Item } from './model';

/** Thin wrapper around ts-fsrs (FSRS-6), research/02 rule 1. */

export interface Scheduler {
  readonly fsrs: FSRS;
  newCard(item: Item, now: Date): CardRecord;
  /** A card for an item the learner already knows (placement test, design §3.4). */
  seedKnownCard(item: Item, now: Date, stabilityDays?: number): CardRecord;
  review(card: CardRecord, grade: Grade, now: Date): CardRecord;
  retrievability(card: CardRecord, now: Date): number;
  isDue(card: CardRecord, now: Date): boolean;
}

export function createScheduler(
  opts: { requestRetention?: number; maximumIntervalDays?: number; enableFuzz?: boolean } = {},
): Scheduler {
  const f = fsrs(
    generatorParameters({
      request_retention: opts.requestRetention ?? ENGINE_CONFIG.fsrs.requestRetention,
      maximum_interval: opts.maximumIntervalDays ?? ENGINE_CONFIG.fsrs.maximumIntervalDays,
      enable_fuzz: opts.enableFuzz ?? true,
    }),
  );

  return {
    fsrs: f,
    newCard(item, now) {
      return {
        itemId: item.id,
        skillId: item.skillId,
        fsrs: createEmptyCard(now),
        createdAt: now,
        lastReviewedAt: null,
      };
    },
    seedKnownCard(item, now, stabilityDays = ENGINE_CONFIG.fsrs.seededStabilityDays) {
      const base = createEmptyCard(now);
      const due = new Date(now.getTime() + stabilityDays * 86_400_000);
      return {
        itemId: item.id,
        skillId: item.skillId,
        fsrs: {
          ...base,
          state: State.Review,
          stability: stabilityDays,
          difficulty: 5,
          scheduled_days: stabilityDays,
          reps: 1,
          due,
          last_review: now,
        },
        createdAt: now,
        lastReviewedAt: now,
      };
    },
    review(card, grade, now) {
      const { card: next } = f.next(card.fsrs, now, grade);
      return { ...card, fsrs: next, lastReviewedAt: now };
    },
    retrievability(card, now) {
      if (card.fsrs.state === State.New) return 0;
      return f.get_retrievability(card.fsrs, now, false);
    },
    isDue(card, now) {
      return card.fsrs.state !== State.New && card.fsrs.due.getTime() <= now.getTime();
    },
  };
}
