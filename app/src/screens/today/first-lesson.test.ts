import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Goal, type Settings } from '../../engine';
import { GOAL_PROFILES } from '../../engine/frontier';
import { DRILLS } from '../../drills/registry';
import { FretworkDB, getSkillStates, putSkillState } from '../../storage';
import { SessionRunner } from '../../session/runner';
import type { StatusOverlay } from '../../engine/overlay';
import { firstLessonSkill } from './first-lesson';

let db: FretworkDB;
let n = 0;
const NOW = new Date('2026-10-23T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`first-lesson-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

async function statuses() {
  return new Map([...(await getSkillStates(db)).values()].map((s) => [s.skillId, s.status]));
}

/** What the runner actually serves first, and what Today predicts. */
async function both(settings: Settings, overlay?: StatusOverlay) {
  const runner = await SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...settings, latencyBaselineMs: 500 },
    skills: SKILLS,
    drills: DRILLS,
    now: () => NOW,
    ...(overlay ? { overlay } : {}),
  });
  return {
    served: runner.currentPrompt()?.entry.skillId,
    predicted: firstLessonSkill(SKILLS, DRILLS, settings, await statuses(), NOW, overlay)?.id,
  };
}

describe('firstLessonSkill', () => {
  it('names the musical alphabet for a fresh learner, as the runner serves it', async () => {
    const { served, predicted } = await both(DEFAULT_SETTINGS);
    expect(predicted).toBe('F1.alphabet');
    expect(served).toBe(predicted);
  });

  it.each(Object.keys(GOAL_PROFILES) as Goal[])(
    'agrees with the runner for goal %s',
    async (goal) => {
      const { served, predicted } = await both({ ...DEFAULT_SETTINGS, goal });
      expect(predicted).toBeDefined();
      expect(served).toBe(predicted);
    },
  );

  it('names ear → fretboard when the learner starts with sound', async () => {
    const { served, predicted } = await both({ ...DEFAULT_SETTINGS, startWithSound: true });
    expect(predicted).toBe('I6.ear-find');
    expect(served).toBe(predicted);
  });

  it('follows placement: skills already mastered are skipped', async () => {
    for (const skillId of ['F1.alphabet', 'F1.b-c-e-f', 'F1.half-steps', 'F1.whole-steps']) {
      await putSkillState(db, { skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
    }
    const { served, predicted } = await both(DEFAULT_SETTINGS);
    expect(predicted).not.toMatch(/^F1\./);
    expect(served).toBe(predicted);
  });

  it.each(Object.keys(GOAL_PROFILES) as Goal[])(
    'agrees with the runner under the "unlock every skill" overlay, goal %s',
    async (goal) => {
      const { served, predicted } = await both({ ...DEFAULT_SETTINGS, goal }, { unlockAll: true });
      expect(predicted).toBeDefined();
      expect(served).toBe(predicted);
    },
  );

  it('skips skills no drill can serve, and is null when nothing is', () => {
    expect(firstLessonSkill(SKILLS, [], DEFAULT_SETTINGS, new Map(), NOW)).toBeNull();
    const noWheel = DRILLS.filter((d) => d.id !== 'note-wheel');
    expect(firstLessonSkill(SKILLS, noWheel, DEFAULT_SETTINGS, new Map(), NOW)?.topic).not.toBe(
      'F1',
    );
  });
});
