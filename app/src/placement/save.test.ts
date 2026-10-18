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
import { isPlacementLog, knownSkillState, savePlacement, type ProbeLog } from './save';

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
function play(outcome: (groupId: string, asked: number) => ProbeOutcome = DEFAULT_OUTCOMES): {
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
      at: NOW,
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
    expect(summary).toEqual({ knownSkills: [string6.id], seeded: string6.items().length });

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
      expect(summary).toEqual({ knownSkills: [string6.id], seeded: 14 });
      const missed = logs.filter((l) => l.item.skillId === string6.id)[1]!.item.id;
      expect(await db.cards.get(missed)).toBeUndefined();
      expect((await getSkillStates(db)).get(string6.id)).toMatchObject({
        status: 'practising',
        guideLevel: ENGINE_CONFIG.placement.knownGuideLevel,
      });
    }
  });

  it('reviews a card the learner already has when a probe asks it', async () => {
    const { state, logs } = play();
    // An established card on a string 5 item the learner then got wrong.
    const probed = logs.find((l) => l.item.skillId === string5.id)!.item;
    const own = scheduler.seedKnownCard(probed, new Date(NOW.getTime() - 30 * DAY), 30);
    await db.cards.put(own);
    await savePlacement(db, { state, logs, skills: SKILLS, scheduler, targets, now: NOW });
    const after = (await db.cards.get(probed.id))!;
    expect(after).toEqual(scheduler.review(own, Rating.Again, NOW));
    expect(after.fsrs.lapses).toBe(1);
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
    expect(summary).toEqual({ knownSkills: [], seeded: 0 });
    expect(await db.cards.count()).toBe(0);
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
