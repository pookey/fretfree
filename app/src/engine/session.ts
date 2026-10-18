import { State } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import type { CardRecord, ConfusionRecord, GuideLevel, Item } from './model';
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
  /** New-block entries: the block (its first item's ID), so nothing is slotted inside it. */
  block?: string;
  /** New-block entries: 0 is the worked example, then reps fade to independent. */
  rep?: number;
}

/**
 * The fact an item tests, the same key in both directions (e.g. `note@s6f5`
 * and `find:A@s6`), and which direction this item asks it in.
 */
export interface FactRef {
  fact: string;
  direction: string;
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
  /** The fact an item tests and its direction. New blocks are followed by their facts' other direction. */
  factOf?: (item: Item) => FactRef | null;
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

/**
 * Step 2: a blocked group of new items. Rep 0 is the worked example (guided),
 * then `reps` round-robin passes fade from guided to independent
 * (research/02 rules 6 and 8).
 */
export function newItemBlock(items: readonly Item[], reps: number): SessionEntry[] {
  const out: SessionEntry[] = [];
  const block = items[0]?.id;
  if (block === undefined) return out;
  for (let rep = 0; rep <= reps; rep++) {
    for (const item of items) {
      out.push({
        itemId: item.id,
        skillId: item.skillId,
        kind: 'new',
        guided: rep === 0,
        block,
        rep,
      });
    }
  }
  return out;
}

/**
 * Groups new items into blocks of up to `size`, in frontier order. Each block
 * is followed by a block of the same facts in their other direction, so one
 * fact is practised through both drills (research/02 rules 1 and 12).
 */
export function planNewBlocks(
  items: readonly Item[],
  size: number,
  factOf?: (item: Item) => FactRef | null,
): Item[][] {
  const out: Item[][] = [];
  let left = [...items];
  while (left.length > 0) {
    const lead = left.slice(0, size);
    left = left.slice(size);
    out.push(lead);
    if (!factOf) continue;
    // Fact → the directions the lead block already asks it in.
    const asked = new Map<string, Set<string>>();
    for (const ref of lead.map(factOf)) {
      if (ref) asked.set(ref.fact, (asked.get(ref.fact) ?? new Set()).add(ref.direction));
    }
    const partners = left
      .filter((i) => {
        const ref = factOf(i);
        const directions = ref ? asked.get(ref.fact) : undefined;
        return directions !== undefined && !directions.has(ref!.direction);
      })
      .slice(0, size);
    if (partners.length === 0) continue;
    out.push(partners);
    left = left.filter((i) => !partners.includes(i));
  }
  return out;
}

/**
 * The guide level of a new-block rep: full guides on the worked example,
 * fading to the skill's own level by the last rep (research/02 rule 8).
 */
export function blockGuideLevel(rep: number, reps: number, skillLevel: GuideLevel): GuideLevel {
  if (rep <= 0 || reps <= 0) return 3;
  const t = Math.min(1, rep / reps);
  return Math.round(3 - (3 - skillLevel) * t) as GuideLevel;
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
  const perItem = cfg.newBlockReps + 1;
  const blocks: SessionEntry[][] = [];
  let placed = 0;
  for (const group of planNewBlocks(fresh, cfg.newBlockSize, input.factOf)) {
    const fit = Math.min(group.length, Math.floor(slots / perItem));
    if (fit < 1) break;
    const block = newItemBlock(group.slice(0, fit), cfg.newBlockReps);
    blocks.push(block);
    slots -= block.length;
    placed += fit;
    if (fit < group.length) break;
  }

  // Top up with further due reviews only if no new material is left to fill the session.
  if (slots > 0 && placed === fresh.length && due.length > reviews.length) {
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
  out.splice(at, 0, {
    itemId: current.itemId,
    skillId: current.skillId,
    kind: 'retry',
    guided: false,
  });
  return out;
}

/**
 * A card in an FSRS learning or relearning step that comes due by `until`
 * (the end of the session): it should reappear in this session.
 */
export function inLearningStep(card: CardRecord, until: Date): boolean {
  const { state, due } = card.fsrs;
  return (
    (state === State.Learning || state === State.Relearning) && due.getTime() <= until.getTime()
  );
}

/**
 * The first index at or after `from` where an entry can be slotted in without
 * splitting a new block: blocks stay together until they end (rule 6).
 */
export function blockBoundary(queue: readonly SessionEntry[], from: number): number {
  for (let at = from; at < queue.length; at++) {
    // Blocks don't nest, so only the latest block before `at` can still be running.
    let block: string | undefined;
    for (let i = at - 1; i >= 0 && block === undefined; i--) block = queue[i]?.block;
    if (block === undefined || !queue.slice(at).some((e) => e.block === block)) return at;
  }
  return queue.length;
}
