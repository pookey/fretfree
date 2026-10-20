import { Rating, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../engine/config';
import type { Item, Skill } from '../engine/model';

/**
 * The placement test's adaptive probe (design §3.4, §4 step 6), pure and
 * deterministic: pass `rng` and the elapsed time in.
 *
 * Each probed skill is a group. Groups run in curriculum order, and each
 * asks a few of its items, sampled at random. A group is **known** once
 * `knownAt` probes are fluent (correct within the speed target) and **not
 * known** once that can no longer happen, so most groups settle in two or
 * three probes. A group whose prerequisite isn't known is skipped unprobed:
 * if the first C3 interval group fails, the later ones are never asked.
 * The test ends when every group is settled or the time budget is spent.
 *
 * A known group's items are seeded as known, except any probe that wasn't
 * fluent: that item is taught like any other new one.
 */

/** See `ENGINE_CONFIG.placement.tiers`. */
export interface ProbeTier {
  upTo: number;
  probes: number;
  knownAt: number;
}

/** How a probe went: only fluent answers count as known (design §3.2 Good or Easy). */
export type ProbeOutcome = 'fluent' | 'slow' | 'wrong';

/**
 * `known` / `unknown`: settled by its probes. `skipped`: a prerequisite isn't
 * known. `open`: not settled yet (waiting on a prerequisite, in progress, or
 * the time ran out first).
 */
export type GroupVerdict = 'known' | 'unknown' | 'skipped' | 'open';

export interface GroupInput {
  /** The skill ID. */
  id: string;
  /** The items a drill can probe. */
  items: readonly Item[];
  /** Prerequisite group IDs; they must come earlier in the group list. */
  prerequisites: readonly string[];
  /**
   * Item IDs that must be probed. They are asked first, and the group asks
   * at least as many probes as there are of them, each extra one needing to
   * be fluent. A test-out uses it for items whose real reviews are still
   * shaky, so a sample can't vouch for them.
   */
  mustProbe?: readonly string[];
}

export interface ProbeGroup extends GroupInput {
  /** At most this many probes, drawn from the front of `items` (shuffled). */
  probes: number;
  knownAt: number;
}

export interface ProbeAnswer {
  itemId: string;
  groupId: string;
  outcome: ProbeOutcome;
}

export interface PlacementState {
  readonly groups: readonly ProbeGroup[];
  readonly answers: readonly ProbeAnswer[];
}

export interface Probe {
  group: ProbeGroup;
  item: Item;
}

/** Fisher–Yates on a copy. */
export function shuffled<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The probe count and pass mark for a group of `itemCount` items. */
export function probeTier(
  itemCount: number,
  tiers: readonly ProbeTier[] = ENGINE_CONFIG.placement.tiers,
): { probes: number; knownAt: number } {
  const tier = tiers.find((t) => itemCount <= t.upTo) ?? (tiers[tiers.length - 1] as ProbeTier);
  // A small group can't ask more probes than it has items.
  const probes = Math.min(tier.probes, itemCount);
  return { probes, knownAt: Math.min(tier.knownAt, probes) };
}

/**
 * The groups to probe: the skills `include` picks, in the order given (the
 * registry's curriculum order), keeping only items a drill can serve. Skills
 * with nothing to probe are left out, and so are prerequisites outside the
 * probed set.
 */
export function skillGroups(
  skills: readonly Skill[],
  canServe: (item: Item) => boolean,
  include: (skill: Skill) => boolean,
): GroupInput[] {
  const groups = skills
    .filter(include)
    .map((s) => ({ id: s.id, items: s.items().filter(canServe), prerequisites: s.prerequisites }))
    .filter((g) => g.items.length > 0);
  const ids = new Set(groups.map((g) => g.id));
  return groups.map((g) => ({ ...g, prerequisites: g.prerequisites.filter((p) => ids.has(p)) }));
}

/** The placement test's groups: every skill of the configured topics, bar `skipPlacement` ones. */
export function placementGroups(
  skills: readonly Skill[],
  canServe: (item: Item) => boolean,
  topics: readonly string[] = ENGINE_CONFIG.placement.topics,
): GroupInput[] {
  return skillGroups(skills, canServe, (s) => topics.includes(s.topic) && !s.skipPlacement);
}

export function startPlacement(
  groups: readonly GroupInput[],
  rng: () => number,
  tiers: readonly ProbeTier[] = ENGINE_CONFIG.placement.tiers,
): PlacementState {
  const seen = new Set<string>();
  for (const g of groups) {
    const late = g.prerequisites.find((p) => !seen.has(p));
    if (late) throw new Error(`Placement group ${g.id} comes before its prerequisite ${late}`);
    seen.add(g.id);
  }
  return {
    groups: groups.map((g) => {
      const must = new Set(g.mustProbe ?? []);
      const first = g.items.filter((i) => must.has(i.id));
      const rest = g.items.filter((i) => !must.has(i.id));
      const tier = probeTier(g.items.length, tiers);
      const probes = Math.max(tier.probes, first.length);
      return {
        ...g,
        items: [...shuffled(first, rng), ...shuffled(rest, rng)],
        probes,
        knownAt: Math.min(probes, tier.knownAt + probes - tier.probes),
      };
    }),
    answers: [],
  };
}

function settle(group: ProbeGroup, answers: readonly ProbeAnswer[]): GroupVerdict {
  const mine = answers.filter((a) => a.groupId === group.id);
  const fluent = mine.filter((a) => a.outcome === 'fluent').length;
  if (fluent >= group.knownAt) return 'known';
  if (mine.length - fluent > group.probes - group.knownAt) return 'unknown';
  return 'open';
}

/** Every group's verdict, in group order. */
export function verdicts(state: PlacementState): Map<string, GroupVerdict> {
  const out = new Map<string, GroupVerdict>();
  for (const g of state.groups) {
    const pre = g.prerequisites.map((p) => out.get(p));
    if (pre.some((p) => p === 'unknown' || p === 'skipped')) out.set(g.id, 'skipped');
    // Waiting on a prerequisite still being probed.
    else if (pre.some((p) => p !== 'known')) out.set(g.id, 'open');
    else out.set(g.id, settle(g, state.answers));
  }
  return out;
}

/**
 * The next probe, or `null` when the test is over: every group is settled,
 * or `elapsedMs` has reached the budget.
 */
export function nextProbe(
  state: PlacementState,
  elapsedMs: number,
  budgetMs: number = ENGINE_CONFIG.placement.budgetMs,
): Probe | null {
  if (elapsedMs >= budgetMs) return null;
  const v = verdicts(state);
  const group = state.groups.find(
    (g) => v.get(g.id) === 'open' && g.prerequisites.every((p) => v.get(p) === 'known'),
  );
  if (!group) return null;
  const asked = state.answers.filter((a) => a.groupId === group.id).length;
  // An open group always has an unasked item: settling takes at most `probes` answers.
  return { group, item: group.items[asked] as Item };
}

/** Record the answer to `probe`. */
export function answerProbe(
  state: PlacementState,
  probe: Probe,
  outcome: ProbeOutcome,
): PlacementState {
  return {
    ...state,
    answers: [...state.answers, { itemId: probe.item.id, groupId: probe.group.id, outcome }],
  };
}

/** A graded answer's outcome: Good or Easy is fluent, Hard is slow, Again is wrong. */
export function probeOutcome(rating: Grade): ProbeOutcome {
  if (rating === Rating.Again) return 'wrong';
  if (rating === Rating.Hard) return 'slow';
  return 'fluent';
}

/** The items to seed as known: every item of a known group except its non-fluent probes. */
export function knownItems(state: PlacementState): Item[] {
  const v = verdicts(state);
  const missed = new Set(state.answers.filter((a) => a.outcome !== 'fluent').map((a) => a.itemId));
  return state.groups
    .filter((g) => v.get(g.id) === 'known')
    .flatMap((g) => g.items.filter((i) => !missed.has(i.id)));
}

/** The share of the probing done, for a progress bar: settled groups over all groups. */
export function progress(state: PlacementState): number {
  if (state.groups.length === 0) return 1;
  const v = [...verdicts(state).values()];
  return v.filter((x) => x !== 'open').length / v.length;
}
