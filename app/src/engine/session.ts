import { State } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import { confusionMatrix, pairConfusables } from './confusions';
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

/** A lane of new material (`frontierLanes`): its items in order, and its share of the new items. */
export interface SessionLane {
  id: string;
  share: number;
  items: readonly Item[];
}

export interface SessionPlanInput {
  now: Date;
  minutes: number;
  cards: readonly CardRecord[];
  /** Unseen items from frontier skills, already ordered by goal priority: a single lane. */
  frontier?: readonly Item[];
  /** Lanes of frontier items, drawn from by their shares. Takes the place of `frontier`. */
  lanes?: readonly SessionLane[];
  /** New items this plan may introduce. Without it, `newItemCap(minutes)`. */
  maxNew?: number;
  scheduler: Scheduler;
  /** Learned confusions. Merged with the seed pairs and decayed to `now`. */
  confusions?: readonly ConfusionRecord[];
  /** Maps an item to the concept its confusions are keyed by (e.g. its pitch class). Enables pairing. */
  conceptOf?: (itemId: string) => string | null;
  /** The fact an item tests and its direction. New blocks are followed by their facts' other direction. */
  factOf?: (item: Item) => FactRef | null;
  maxItems?: number;
  config?: SessionConfig;
  /** Shuffles tied due reviews before they are dealt (`DueOrder`). */
  rng?: () => number;
  /** The drill that serves an item, so tied due reviews alternate drills too. */
  drillOf?: (itemId: string) => string | null;
}

type SessionConfig = {
  secondsPerItem: number;
  reviewShare: number;
  newBlockSize: number;
  newBlockReps: number;
  retryGap: number;
  maxNewPerSession: number;
  newCapMinutes: number;
  newCapRaise: number;
};

/** Number of prompts that fit the time budget. */
export function sessionLength(minutes: number, cfg: SessionConfig = ENGINE_CONFIG.session): number {
  return Math.max(5, Math.round((minutes * 60) / cfg.secondsPerItem));
}

/**
 * The most new items a session of `minutes` introduces (research/02 rule 11):
 * `maxNewPerSession` scaled by minutes, raised by `newCapRaise` while recent
 * accuracy is above the adaptive band's top (rule 5). Never below one.
 */
export function newItemCap(
  minutes: number,
  recentAccuracy: number | null = null,
  cfg: SessionConfig = ENGINE_CONFIG.session,
  bandTop: number = ENGINE_CONFIG.adaptive.widenAbove,
): number {
  const base = (cfg.maxNewPerSession * minutes) / cfg.newCapMinutes;
  const raise = recentAccuracy !== null && recentAccuracy > bandTop ? 1 + cfg.newCapRaise : 1;
  return Math.max(1, Math.round(base * raise));
}

/**
 * How many of `count` new items each lane gets: a smooth weighted
 * round-robin by `shares`, so 2:1:1 deals goal, neck, parallel, goal… A lane
 * never gets more than its `sizes`; what it can't take goes to the others.
 */
export function laneQuotas(
  sizes: readonly number[],
  shares: readonly number[],
  count: number,
): number[] {
  const out = sizes.map(() => 0);
  const credit = sizes.map(() => 0);
  for (let k = 0; k < count; k++) {
    const open = sizes.flatMap((n, i) => (out[i]! < n && shares[i]! > 0 ? [i] : []));
    if (open.length === 0) break;
    const total = open.reduce((sum, i) => sum + shares[i]!, 0);
    let best = open[0]!;
    for (const i of open) {
      credit[i]! += shares[i]!;
      if (credit[i]! > credit[best]!) best = i;
    }
    credit[best]! -= total;
    out[best]!++;
  }
  return out;
}

export interface DueOrder {
  /** Shuffles a tied run before it is dealt. Without it, ties keep item-ID order. */
  rng?: () => number;
  /** The drill that serves an item, so tied neighbours differ in drill as well as skill. */
  drillOf?: (itemId: string) => string | null;
  /** Retrievability span that counts as a tie (`ENGINE_CONFIG.dueTies.window`). */
  window?: number;
}

/**
 * Step 1: due reviews, lowest retrievability first. Cards within `window` of
 * the most overdue card in their run are tied, and a tied run is dealt so
 * neighbours differ in skill, then in drill (research/02 rule 6). With `rng`,
 * the run is shuffled first: the order varies, but not for the same `rng`.
 */
export function dueReviews(
  cards: readonly CardRecord[],
  scheduler: Scheduler,
  now: Date,
  { rng, drillOf, window = ENGINE_CONFIG.dueTies.window }: DueOrder = {},
): CardRecord[] {
  const ranked = cards
    .filter((c) => scheduler.isDue(c, now))
    .map((c) => ({ c, r: scheduler.retrievability(c, now) }))
    .sort((a, b) => a.r - b.r || a.c.itemId.localeCompare(b.c.itemId));
  const out: CardRecord[] = [];
  for (let start = 0; start < ranked.length;) {
    const lead = ranked[start]!.r;
    let end = start + 1;
    while (end < ranked.length && ranked[end]!.r - lead <= window) end++;
    const tied = ranked.slice(start, end).map(({ c }) => c);
    // Deal on from the previous run's last card, so a run doesn't open on the skill it ended with.
    out.push(...dealTies(rng ? shuffle(tied, rng) : tied, drillOf, out.at(-1)));
    start = end;
  }
  return out;
}

/**
 * Each pick is the first card that differs from the last one (starting from
 * `prev`) in skill, then in drill, favouring the skill with the most cards
 * left so none clumps at the end.
 */
function dealTies(
  cards: readonly CardRecord[],
  drillOf?: (itemId: string) => string | null,
  prev?: CardRecord,
): CardRecord[] {
  const left = cards.map((c) => ({ c, drill: drillOf?.(c.itemId) ?? null }));
  const count = new Map<string, number>();
  for (const { c } of left) count.set(c.skillId, (count.get(c.skillId) ?? 0) + 1);
  const out: CardRecord[] = [];
  let last: (typeof left)[number] | undefined = prev && {
    c: prev,
    drill: drillOf?.(prev.itemId) ?? null,
  };
  while (left.length > 0) {
    const score = ({ c, drill }: (typeof left)[number]) =>
      (c.skillId !== last?.c.skillId ? 2 : 0) +
      (drill === null || drill !== last?.drill ? 1 : 0) +
      (count.get(c.skillId) ?? 0) / (cards.length + 1);
    let best = 0;
    for (let i = 1; i < left.length; i++) if (score(left[i]!) > score(left[best]!)) best = i;
    last = left.splice(best, 1)[0]!;
    count.set(last.c.skillId, count.get(last.c.skillId)! - 1);
    out.push(last.c);
  }
  return out;
}

/** Fisher–Yates on a copy. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
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

/** A lane's first `quota` new items as blocks, a block never longer than the quota. */
function laneBlocks(
  items: readonly Item[],
  quota: number,
  cfg: SessionConfig,
  factOf?: (item: Item) => FactRef | null,
): SessionEntry[][] {
  const out: SessionEntry[][] = [];
  if (quota < 1) return out;
  let left = quota;
  for (const group of planNewBlocks(items, Math.min(cfg.newBlockSize, quota), factOf)) {
    if (left < 1) break;
    const take = group.slice(0, left);
    out.push(newItemBlock(take, cfg.newBlockReps));
    left -= take.length;
  }
  return out;
}

/** Blocks dealt round-robin across lanes, each lane's in order. A block never mixes lanes. */
function interleaveLanes(lanes: readonly SessionEntry[][][]): SessionEntry[][] {
  const out: SessionEntry[][] = [];
  for (let round = 0; lanes.some((l) => round < l.length); round++) {
    for (const lane of lanes) if (lane[round]) out.push(lane[round]!);
  }
  return out;
}

/**
 * One spaced retrieval pass over a session's new items, for when its new
 * cap is reached and nothing is due: recalling them once more after a gap
 * consolidates them (research/02 rule 6). Dealt round-robin across skills,
 * each skill's items in the order they were introduced.
 */
export function retrievalPass(items: readonly Item[]): SessionEntry[] {
  const bySkill = new Map<string, Item[]>();
  for (const i of items) bySkill.set(i.skillId, [...(bySkill.get(i.skillId) ?? []), i]);
  const queues = [...bySkill.values()];
  const out: SessionEntry[] = [];
  for (let round = 0; queues.some((q) => round < q.length); round++) {
    for (const q of queues) {
      const i = q[round];
      if (i) out.push({ itemId: i.id, skillId: i.skillId, kind: 'stretch', guided: false });
    }
  }
  return out;
}

/**
 * Spread blocks evenly among reviews, starting with a short warm-up of
 * reviews. A block never splits a confusable pair (`joined`, see
 * `pairConfusables`).
 */
function interleave(
  reviews: SessionEntry[],
  blocks: SessionEntry[][],
  joined: ReadonlySet<number>,
): SessionEntry[] {
  if (blocks.length === 0) return reviews;
  const out: SessionEntry[] = [];
  const gap = Math.floor(reviews.length / (blocks.length + 1));
  let r = 0;
  for (const block of blocks) {
    let end = Math.min(reviews.length, r + gap);
    if (joined.has(end - 1)) end++;
    out.push(...reviews.slice(r, end));
    r = end;
    out.push(...block);
  }
  out.push(...reviews.slice(r));
  return out;
}

export function buildSession(input: SessionPlanInput): SessionEntry[] {
  const cfg = input.config ?? ENGINE_CONFIG.session;
  const total = input.maxItems ?? sessionLength(input.minutes, cfg);
  const due = dueReviews(input.cards, input.scheduler, input.now, {
    rng: input.rng,
    drillOf: input.drillOf,
  });
  const reviewCap = Math.floor(total * cfg.reviewShare);
  const reviews: SessionEntry[] = due.slice(0, reviewCap).map((c) => ({
    itemId: c.itemId,
    skillId: c.skillId,
    kind: 'review',
    guided: false,
  }));

  const carded = new Set(input.cards.map((c) => c.itemId));
  const lanes = (input.lanes ?? [{ id: 'frontier', share: 1, items: input.frontier ?? [] }]).map(
    (l) => ({ ...l, items: l.items.filter((i) => !carded.has(i.id)) }),
  );
  const fresh = lanes.reduce((n, l) => n + l.items.length, 0);
  const perItem = cfg.newBlockReps + 1;
  const maxNew = Math.max(0, input.maxNew ?? newItemCap(input.minutes, null, cfg));
  const quotas = laneQuotas(
    lanes.map((l) => l.items.length),
    lanes.map((l) => l.share),
    Math.min(maxNew, Math.floor((total - reviews.length) / perItem)),
  );
  const blocks = interleaveLanes(
    lanes.map((l, i) => laneBlocks(l.items, quotas[i]!, cfg, input.factOf)),
  );
  const placed = quotas.reduce((n, q) => n + q, 0);
  const slots = total - reviews.length - placed * perItem;

  // Top up with further due reviews unless new items were left out for want of time.
  if (slots > 0 && (placed === fresh || placed >= maxNew) && due.length > reviews.length) {
    for (const c of due.slice(reviews.length, reviews.length + slots)) {
      reviews.push({ itemId: c.itemId, skillId: c.skillId, kind: 'review', guided: false });
    }
  }

  // Step 3: seed and learned confusions, so pairing works from the first session.
  const { entries: paired, joined } = input.conceptOf
    ? pairConfusables(reviews, confusionMatrix(input.confusions ?? [], input.now), input.conceptOf)
    : { entries: reviews, joined: new Set<number>() };
  return interleave(paired, blocks, joined);
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
