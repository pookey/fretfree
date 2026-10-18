import { ENGINE_CONFIG } from './config';
import type { CardRecord, ConfusionRecord, Item } from './model';
import type { Scheduler } from './scheduler';

/** Design §3.3: the session builder pipeline. */

/** `stretch`: a not-yet-stable frontier card that tops up a session (§3.7). */
export type EntryKind = 'review' | 'new' | 'retry' | 'stretch';

export interface SessionEntry {
  itemId: string;
  skillId: string;
  kind: EntryKind;
  /** Full guides and a worked example: the first rep of a new item. */
  guided: boolean;
}

export interface SessionPlanInput {
  now: Date;
  minutes: number;
  cards: readonly CardRecord[];
  /** Unseen items from frontier skills, already ordered by goal priority. */
  frontier: readonly Item[];
  scheduler: Scheduler;
  confusions?: readonly ConfusionRecord[];
  /** Maps an item to the concept its confusions are keyed by (e.g. its pitch class). */
  conceptOf?: (itemId: string) => string | null;
  maxItems?: number;
  config?: SessionConfig;
}

type SessionConfig = {
  secondsPerItem: number;
  reviewShare: number;
  newBlockSize: number;
  newBlockReps: number;
  retryGap: number;
};

/** Number of prompts that fit the time budget. */
export function sessionLength(minutes: number, cfg: SessionConfig = ENGINE_CONFIG.session): number {
  return Math.max(5, Math.round((minutes * 60) / cfg.secondsPerItem));
}

/** Step 1: due reviews, lowest retrievability first. */
export function dueReviews(
  cards: readonly CardRecord[],
  scheduler: Scheduler,
  now: Date,
): CardRecord[] {
  return cards
    .filter((c) => scheduler.isDue(c, now))
    .map((c) => ({ c, r: scheduler.retrievability(c, now) }))
    .sort((a, b) => a.r - b.r || a.c.itemId.localeCompare(b.c.itemId))
    .map(({ c }) => c);
}

/** Step 2: a blocked group of new items — `reps` round-robin passes, the first guided. */
export function newItemBlock(items: readonly Item[], reps: number): SessionEntry[] {
  const out: SessionEntry[] = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const item of items) {
      out.push({ itemId: item.id, skillId: item.skillId, kind: 'new', guided: rep === 0 });
    }
  }
  return out;
}

/**
 * Step 3: move confusable items next to each other so the learner has to
 * discriminate them (research/02 rule 6). Only affects review entries.
 */
export function pairConfusables(
  entries: readonly SessionEntry[],
  confusions: readonly ConfusionRecord[],
  conceptOf: (itemId: string) => string | null,
): SessionEntry[] {
  const out = [...entries];
  const pairs = [...confusions].filter((c) => c.count > 0).sort((x, y) => y.count - x.count);
  const moved = new Set<number>();
  for (const { a, b } of pairs) {
    const ia = out.findIndex(
      (e, i) => e.kind === 'review' && !moved.has(i) && conceptOf(e.itemId) === a,
    );
    const ib = out.findIndex(
      (e, i) => e.kind === 'review' && !moved.has(i) && conceptOf(e.itemId) === b,
    );
    if (ia < 0 || ib < 0) continue;
    const [entry] = out.splice(ib, 1);
    const target = ib < ia ? ia : ia + 1;
    out.splice(target, 0, entry as SessionEntry);
    const placedB = target;
    const placedA = ib < ia ? ia - 1 : ia;
    moved.add(placedA);
    moved.add(placedB);
  }
  return out;
}

/** Spread blocks evenly among reviews, starting with a short warm-up of reviews. */
function interleave(reviews: SessionEntry[], blocks: SessionEntry[][]): SessionEntry[] {
  if (blocks.length === 0) return reviews;
  const out: SessionEntry[] = [];
  const gap = Math.floor(reviews.length / (blocks.length + 1));
  let r = 0;
  for (const block of blocks) {
    out.push(...reviews.slice(r, r + gap));
    r += gap;
    out.push(...block);
  }
  out.push(...reviews.slice(r));
  return out;
}

export function buildSession(input: SessionPlanInput): SessionEntry[] {
  const cfg = input.config ?? ENGINE_CONFIG.session;
  const total = input.maxItems ?? sessionLength(input.minutes, cfg);
  const due = dueReviews(input.cards, input.scheduler, input.now);
  const reviewCap = Math.floor(total * cfg.reviewShare);
  const reviews: SessionEntry[] = due.slice(0, reviewCap).map((c) => ({
    itemId: c.itemId,
    skillId: c.skillId,
    kind: 'review',
    guided: false,
  }));

  const carded = new Set(input.cards.map((c) => c.itemId));
  const fresh = input.frontier.filter((i) => !carded.has(i.id));
  let slots = total - reviews.length;
  const blocks: SessionEntry[][] = [];
  let next = 0;
  while (slots >= cfg.newBlockReps && next < fresh.length) {
    const size = Math.min(
      cfg.newBlockSize,
      Math.floor(slots / cfg.newBlockReps),
      fresh.length - next,
    );
    const items = fresh.slice(next, next + size);
    next += size;
    const block = newItemBlock(items, cfg.newBlockReps);
    blocks.push(block);
    slots -= block.length;
  }

  // Top up with further due reviews if no new material fills the session.
  if (slots > 0 && due.length > reviews.length) {
    for (const c of due.slice(reviews.length, reviews.length + slots)) {
      reviews.push({ itemId: c.itemId, skillId: c.skillId, kind: 'review', guided: false });
    }
  }

  const paired =
    input.confusions && input.conceptOf
      ? pairConfusables(reviews, input.confusions, input.conceptOf)
      : reviews;
  return interleave(paired, blocks);
}

/** A wrong answer is retried a few items later in the same session (design §7). */
export function scheduleRetry(
  queue: readonly SessionEntry[],
  currentIndex: number,
  gap: number = ENGINE_CONFIG.session.retryGap,
): SessionEntry[] {
  const current = queue[currentIndex];
  if (!current) return [...queue];
  const out = [...queue];
  const at = Math.min(out.length, currentIndex + 1 + gap);
  out.splice(at, 0, { ...current, kind: 'retry', guided: false });
  return out;
}
