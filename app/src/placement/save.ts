import type { Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../engine/config';
import type { SpeedTargets } from '../engine/grading';
import { isMastered } from '../engine/mastery';
import type {
  CardRecord,
  GuideLevel,
  Item,
  ReviewLogRecord,
  Skill,
  SkillStateRecord,
} from '../engine/model';
import type { Scheduler } from '../engine/scheduler';
import type { FretworkDB } from '../storage';
import { knownItems, verdicts, type PlacementState } from './algorithm';

/**
 * Persists a finished placement test (design §3.4). Known items get a card
 * seeded at stability ≈ 10 days (`seedKnownCard`), so they come back as a
 * check-up review instead of being taught from scratch. Items that already
 * have a card are never re-seeded: real history beats a placement guess, and
 * a probe on one is evidence, so it is reviewed with the probe's rating.
 * Every answered probe is logged as a review (research/02 rule 17), marked
 * as a placement log. A known skill is marked mastered when every probed
 * item has a card and the mastery rule holds, or practising otherwise, so the
 * skills after it unlock while a probe it missed stays on the frontier, to
 * be taught as a new item.
 */

/** Placement probes log `drillType` as this prefix plus the drill's ID. */
export const PLACEMENT_LOG_PREFIX = 'placement:';

/** True for a review log written by the placement test, not a session. */
export function isPlacementLog(log: Pick<ReviewLogRecord, 'drillType'>): boolean {
  return log.drillType.startsWith(PLACEMENT_LOG_PREFIX);
}

/** One answered probe, as the review log stores it. */
export interface ProbeLog {
  item: Item;
  drillType: string;
  correct: boolean;
  responseMs: number;
  rating: Grade;
  answerGiven: string;
  at: Date;
}

export interface PlacementSummary {
  /** Known skill IDs, in curriculum order. */
  knownSkills: string[];
  /** Cards seeded as known. */
  seeded: number;
}

const DEFAULT_GUIDE: GuideLevel = 3;

/** A known skill's state, never lowering what the learner already has. */
export function knownSkillState(
  skillId: string,
  existing: SkillStateRecord | undefined,
  mastered: boolean,
  accuracy: number,
  knownGuideLevel: number = ENGINE_CONFIG.placement.knownGuideLevel,
): SkillStateRecord {
  const status = existing?.status === 'mastered' || mastered ? 'mastered' : 'practising';
  const guideLevel = Math.min(existing?.guideLevel ?? DEFAULT_GUIDE, knownGuideLevel) as GuideLevel;
  return { skillId, status, guideLevel, rollingAccuracy: existing?.rollingAccuracy ?? accuracy };
}

export async function savePlacement(
  db: FretworkDB,
  input: {
    state: PlacementState;
    logs: readonly ProbeLog[];
    skills: readonly Skill[];
    scheduler: Scheduler;
    targets: SpeedTargets;
    now: Date;
  },
): Promise<PlacementSummary> {
  const { state, logs, scheduler, targets, now } = input;
  const groupItems = state.groups.flatMap((g) => g.items);
  const existing = new Map(
    (await db.cards.bulkGet(groupItems.map((i) => i.id)))
      .filter((c): c is CardRecord => c !== undefined)
      .map((c) => [c.itemId, c]),
  );
  // Probes on cards the learner already has are reviews, in the order answered.
  const reviewed = new Map<string, CardRecord>();
  for (const l of logs) {
    const card = reviewed.get(l.item.id) ?? existing.get(l.item.id);
    if (card) reviewed.set(l.item.id, scheduler.review(card, l.rating, l.at));
  }
  const seeded = knownItems(state)
    .filter((i) => !existing.has(i.id))
    .map((i) => scheduler.seedKnownCard(i, now));
  const cards = new Map([...existing, ...reviewed, ...seeded.map((c) => [c.itemId, c] as const)]);

  const v = verdicts(state);
  const known = state.groups.filter((g) => v.get(g.id) === 'known');
  const knownSkills = known.map((g) => g.id);
  const states = await db.skillStates.bulkGet(knownSkills);
  const nextStates = known.flatMap((group, i) => {
    const skillId = group.id;
    const skill = input.skills.find((s) => s.id === skillId);
    if (!skill) return [];
    const mine = logs.filter((l) => l.item.skillId === skillId);
    // A missed probe has no card: mastered would take the skill off the
    // frontier, and the item would never be taught.
    const complete = group.items.every((it) => cards.has(it.id));
    const mastered =
      complete &&
      isMastered({
        itemCount: skill.items().length,
        cards: skill.items().flatMap((it) => cards.get(it.id) ?? []),
        recentResponseMs: mine.filter((l) => l.correct).map((l) => l.responseMs),
        targets,
      });
    const accuracy = mine.length === 0 ? 1 : mine.filter((l) => l.correct).length / mine.length;
    return [knownSkillState(skillId, states[i], mastered, accuracy)];
  });

  const reviewLogs: Omit<ReviewLogRecord, 'id'>[] = logs.map((l) => ({
    itemId: l.item.id,
    skillId: l.item.skillId,
    drillType: `${PLACEMENT_LOG_PREFIX}${l.drillType}`,
    correct: l.correct,
    responseMs: Math.round(l.responseMs),
    rating: l.rating,
    hintUsed: false,
    answerGiven: l.answerGiven,
    at: l.at,
  }));

  await db.transaction('rw', [db.cards, db.reviewLogs, db.skillStates], async () => {
    await db.cards.bulkPut([...seeded, ...reviewed.values()]);
    await db.reviewLogs.bulkAdd(reviewLogs);
    await db.skillStates.bulkPut(nextStates);
  });
  return { knownSkills, seeded: seeded.length };
}
