import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG, createScheduler, speedTargets, type Skill } from '../engine';
import { getSkill } from '../engine/skills';
import { FretworkDB, getSkillStates, reviewCount } from '../storage';
import {
  answerProbe,
  nextProbe,
  startPlacement,
  type PlacementState,
  type ProbeOutcome,
} from './algorithm';
import { isPlacementLog, knownSkillState, probeReview, savePlacement, type ProbeLog } from './save';

const NOW = new Date('2026-10-18T09:00:00Z');
const DAY = 86_400_000;
const scheduler = createScheduler({ enableFuzz: false });
const targets = speedTargets(500);
const string6 = getSkill('F2.string6-naturals') as Skill;
const string5 = getSkill('F2.string5-naturals') as Skill;
const SKILLS = [string6, string5];

let db: FretworkDB;
let n = 0;
beforeEach(() => {
  db = new FretworkDB(`placement-${n++}`);
});
afterEach(async () => {
  await db.delete();
});

/** By default string 6 is answered fluently and string 5 wrong. */
const DEFAULT_OUTCOMES = (groupId: string): ProbeOutcome =>
  groupId === string6.id ? 'fluent' : 'wrong';

/** Play the test; `outcome` gets the group and how many of its probes came before. */
function play(
  outcome: (groupId: string, asked: number) => ProbeOutcome = DEFAULT_OUTCOMES,
  at: Date = NOW,
): {
  state: PlacementState;
  logs: ProbeLog[];
} {
  let state = startPlacement(
    SKILLS.map((s) => ({ id: s.id, items: s.items(), prerequisites: [] })),
    () => 0.5,
  );
  const logs: ProbeLog[] = [];
  for (let p = nextProbe(state, 0); p; p = nextProbe(state, 0)) {
    const o = outcome(p.group.id, logs.filter((l) => l.item.skillId === p.group.id).length);
    logs.push({
      item: p.item,
      drillType: 'name-the-note',
      correct: o !== 'wrong',
      responseMs: o === 'fluent' ? 900 : 2400,
      rating: o === 'fluent' ? Rating.Easy : o === 'slow' ? Rating.Hard : Rating.Again,
      answerGiven: o === 'wrong' ? 'wrong' : 'right',
      at,
    });
    state = answerProbe(state, p, o);
  }
  return { state, logs };
}

describe('savePlacement', () => {
  it('seeds every item of a known skill at the seeded stability, and none of an unknown one', async () => {
    const { state, logs } = play();
    const summary = await savePlacement(db, {
      state,
      logs,
      skills: SKILLS,
      scheduler,
      targets,
      now: NOW,
    });
    expect(summary).toEqual({
      probedSkills: [string6.id, string5.id],
      knownSkills: [string6.id],
      masteredSkills: [string6.id],
      seeded: string6.items().length,
    });

    const cards = await db.cards.toArray();
    expect(cards.map((c) => c.itemId).sort()).toEqual(
      string6
        .items()
        .map((i) => i.id)
        .sort(),
    );
    for (const c of cards) {
      expect(c.fsrs.stability).toBe(ENGINE_CONFIG.fsrs.seededStabilityDays);
      expect(c.fsrs.due.getTime()).toBe(NOW.getTime() + 10 * DAY);
    }
  });

  it('logs every answered probe as a review', async () => {
    const { state, logs } = play();
    await savePlacement(db, { state, logs, skills: SKILLS, scheduler, targets, now: NOW });
    expect(await reviewCount(db)).toBe(logs.length);
    const wrong = await db.reviewLogs.where('skillId').equals(string5.id).toArray();
    expect(wrong.every((l) => !l.correct && l.rating === Rating.Again && !l.hintUsed)).toBe(true);
    // Marked as placement, so sessions can tell them from their own answers.
    const all = await db.reviewLogs.toArray();
    expect(all.every((l) => l.drillType === 'placement:name-the-note' && isPlacementLog(l))).toBe(
      true,
    );
    expect(isPlacementLog({ drillType: 'name-the-note' })).toBe(false);
  });

  it('marks a known skill mastered with faded guides, and leaves unknown skills alone', async () => {
    const { state, logs } = play();
    await savePlacement(db, { state, logs, skills: SKILLS, scheduler, targets, now: NOW });
    const states = await getSkillStates(db);
    expect(states.get(string6.id)).toEqual({
      skillId: string6.id,
      status: 'mastered',
      guideLevel: ENGINE_CONFIG.placement.knownGuideLevel,
      rollingAccuracy: 1,
    });
    expect(states.has(string5.id)).toBe(false);
  });

  it('keeps a missed probe unseeded and the skill practising, so the item is still taught', async () => {
    // 15 items: 4 probes, 3 to pass. One miss still passes, and 14 seeded cards
    // would clear the 90% mastery bar, but the missed fact must stay on the frontier.
    for (const miss of ['wrong', 'slow'] as const) {
      await db.cards.clear();
      await db.skillStates.clear();
      const { state, logs } = play((g, asked) =>
        g === string6.id ? (asked === 1 ? miss : 'fluent') : 'wrong',
      );
      const summary = await savePlacement(db, {
        state,
        logs,
        skills: SKILLS,
        scheduler,
        targets,
        now: NOW,
      });
      expect(summary).toEqual({
        probedSkills: [string6.id, string5.id],
        knownSkills: [string6.id],
        masteredSkills: [],
        seeded: 14,
      });
      const missed = logs.filter((l) => l.item.skillId === string6.id)[1]!.item.id;
      expect(await db.cards.get(missed)).toBeUndefined();
      expect((await getSkillStates(db)).get(string6.id)).toMatchObject({
        status: 'practising',
        guideLevel: ENGINE_CONFIG.placement.knownGuideLevel,
      });
    }
  });

  it('leaves a card the learner already has alone when its probe is missed', async () => {
    const { state, logs } = play();
    // An established card on a string 5 item the learner then got wrong.
    const probed = logs.find((l) => l.item.skillId === string5.id)!.item;
    const own = scheduler.seedKnownCard(probed, new Date(NOW.getTime() - 30 * DAY), 30);
    await db.cards.put(own);
    await savePlacement(db, { state, logs, skills: SKILLS, scheduler, targets, now: NOW });
    expect(await db.cards.get(probed.id)).toEqual(own);
    // The answer is still logged (research/02 rule 17).
    expect(await db.reviewLogs.where('itemId').equals(probed.id).count()).toBe(1);
  });

  it('reviews a card the learner already has when a fluent probe asks it', async () => {
    const { state, logs } = play();
    const probed = logs.find((l) => l.item.skillId === string6.id)!.item;
    const own = scheduler.seedKnownCard(probed, new Date(NOW.getTime() - 30 * DAY), 20);
    await db.cards.put(own);
    await savePlacement(db, { state, logs, skills: SKILLS, scheduler, targets, now: NOW });
    const after = (await db.cards.get(probed.id))!;
    expect(after).toEqual(scheduler.review(own, Rating.Easy, NOW));
    expect(after.fsrs.stability).toBeGreaterThan(own.fsrs.stability);
  });

  it('keeps cards the learner already has', async () => {
    const { state, logs } = play();
    // An item the test didn't ask, so the card has no new evidence.
    const asked = new Set(logs.map((l) => l.item.id));
    const item = string6.items().find((i) => !asked.has(i.id))!;
    const own = scheduler.review(scheduler.newCard(item, NOW), Rating.Good, NOW);
    await db.cards.put(own);
    const summary = await savePlacement(db, {
      state,
      logs,
      skills: SKILLS,
      scheduler,
      targets,
      now: NOW,
    });
    expect(summary.seeded).toBe(string6.items().length - 1);
    expect(await db.cards.get(item.id)).toEqual(own);
    // That card isn't stable yet, but 14 of 15 seeded cards still clear the 90% bar.
    expect((await getSkillStates(db)).get(string6.id)?.status).toBe('mastered');
  });

  it('saves nothing but the logs when nothing is known', async () => {
    let state = startPlacement(
      [{ id: string5.id, items: string5.items(), prerequisites: [] }],
      () => 0.5,
    );
    state = answerProbe(state, nextProbe(state, 0)!, 'wrong');
    const summary = await savePlacement(db, {
      state,
      logs: [],
      skills: SKILLS,
      scheduler,
      targets,
      now: NOW,
    });
    expect(summary).toMatchObject({ knownSkills: [], masteredSkills: [], seeded: 0 });
    expect(await db.cards.count()).toBe(0);
  });
});

describe('retaking the test', () => {
  const STATUS_RANK = { locked: 0, unlocked: 1, practising: 2, mastered: 3 } as const;
  const LATER = new Date(NOW.getTime() + 3 * DAY);

  /** A learner a few days in: an earlier placement, then sessions of mixed reviews. */
  async function learnerWithHistory() {
    const first = play();
    await savePlacement(db, { ...first, skills: SKILLS, scheduler, targets, now: NOW });
    const day1 = new Date(NOW.getTime() + DAY);
    const ratings = [Rating.Good, Rating.Again, Rating.Hard, Rating.Easy] as const;
    const fresh = string5.items().map((item, i) => {
      const learnt = scheduler.review(scheduler.newCard(item, NOW), Rating.Good, NOW);
      return scheduler.review(learnt, ratings[i % ratings.length]!, day1);
    });
    await db.cards.bulkPut(fresh);
    await db.skillStates.bulkPut([
      { skillId: string6.id, status: 'mastered', guideLevel: 0, rollingAccuracy: 0.97 },
      { skillId: string5.id, status: 'practising', guideLevel: 2, rollingAccuracy: 0.8 },
    ]);
    return {
      cards: new Map((await db.cards.toArray()).map((c) => [c.itemId, c])),
      states: await getSkillStates(db),
    };
  }

  const patterns: Record<string, (g: string, asked: number) => ProbeOutcome> = {
    'misses everything': () => 'wrong',
    'is slow on everything': () => 'slow',
    'is fluent on everything': () => 'fluent',
    'mixes fluent, slow and wrong answers': (g, asked) =>
      (['fluent', 'wrong', 'slow'] as const)[(asked + g.length) % 3]!,
  };

  for (const [name, outcome] of Object.entries(patterns)) {
    it(`never lowers a skill's status, guide level or any card when the learner ${name}`, async () => {
      const before = await learnerWithHistory();
      const retake = play(outcome, LATER);
      await savePlacement(db, { ...retake, skills: SKILLS, scheduler, targets, now: LATER });

      for (const [id, was] of before.cards) {
        const now = (await db.cards.get(id))!;
        expect(now.fsrs.stability).toBeGreaterThanOrEqual(was.fsrs.stability);
        expect(now.fsrs.due.getTime()).toBeGreaterThanOrEqual(was.fsrs.due.getTime());
        expect(now.fsrs.lapses).toBe(was.fsrs.lapses);
        expect(now.fsrs.reps).toBeGreaterThanOrEqual(was.fsrs.reps);
      }
      const after = await getSkillStates(db);
      for (const [id, was] of before.states) {
        const now = after.get(id)!;
        expect(STATUS_RANK[now.status]).toBeGreaterThanOrEqual(STATUS_RANK[was.status]);
        expect(now.guideLevel).toBeLessThanOrEqual(was.guideLevel);
      }
    });
  }

  it('still seeds what an earlier test or session never reached', async () => {
    // Skipped in onboarding: no cards at all, then a fluent retake.
    const { state, logs } = play(() => 'fluent', LATER);
    const summary = await savePlacement(db, {
      state,
      logs,
      skills: SKILLS,
      scheduler,
      targets,
      now: LATER,
    });
    expect(summary.knownSkills).toEqual([string6.id, string5.id]);
    expect(await db.cards.count()).toBe(string6.items().length + string5.items().length);
  });
});

describe('probeReview', () => {
  const item = string6.items()[0]!;
  const own = scheduler.seedKnownCard(item, new Date(NOW.getTime() - 5 * DAY), 20);

  it('ignores a slow or missed probe', () => {
    expect(probeReview(own, Rating.Hard, NOW, scheduler)).toBe(own);
    expect(probeReview(own, Rating.Again, NOW, scheduler)).toBe(own);
  });

  it('applies a fluent probe that moves the card forward', () => {
    expect(probeReview(own, Rating.Good, NOW, scheduler)).toEqual(
      scheduler.review(own, Rating.Good, NOW),
    );
  });

  it('ignores even a fluent probe if the review would bring the card back sooner', () => {
    const lower = (patch: Partial<typeof own.fsrs>) => ({
      ...scheduler,
      review: () => ({ ...own, fsrs: { ...own.fsrs, ...patch } }),
    });
    const sooner = new Date(own.fsrs.due.getTime() - DAY);
    expect(probeReview(own, Rating.Easy, NOW, lower({ due: sooner }))).toBe(own);
    expect(probeReview(own, Rating.Easy, NOW, lower({ stability: 1 }))).toBe(own);
    expect(probeReview(own, Rating.Easy, NOW, lower({ lapses: own.fsrs.lapses + 1 }))).toBe(own);
  });
});

describe('knownSkillState', () => {
  it('is mastered when the rule is met, practising otherwise', () => {
    expect(knownSkillState('s', undefined, true, 0.8, 1)).toEqual({
      skillId: 's',
      status: 'mastered',
      guideLevel: 1,
      rollingAccuracy: 0.8,
    });
    expect(knownSkillState('s', undefined, false, 0.8, 1).status).toBe('practising');
  });

  it('never lowers the learner’s own state', () => {
    const own = {
      skillId: 's',
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 0.95,
    };
    expect(knownSkillState('s', own, false, 0.5, 1)).toEqual(own);
  });
});
