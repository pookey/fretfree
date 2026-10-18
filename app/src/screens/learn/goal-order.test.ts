import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Goal, type Skill } from '../../engine';
import { DRILLS } from '../../drills/registry';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';

/**
 * The goal the Learn map orders by also orders what new material a session
 * serves first (design §3.3 step 2): the runner feeds `orderFrontier` into
 * the session builder's `frontier` input.
 */

// Note-naming skills only (D1), plus a Harmony (C8) stand-in that D1 can test.
const NOTE_SKILLS = SKILLS.filter((s) => s.topic === 'F2' || s.topic === 'C2');
const harmony: Skill = {
  id: 'C8.test-harmony',
  topic: 'C8',
  order: 800,
  title: 'Harmony stand-in',
  prerequisites: [],
  drillTypes: ['name-the-note'],
  items: () => [3, 5, 7, 8].map((fret) => ({ id: `note@s4f${fret}`, skillId: 'C8.test-harmony' })),
};

let db: FretworkDB;
let n = 0;

beforeEach(() => {
  db = new FretworkDB(`goal-order-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

async function firstNewSkill(goal: Goal): Promise<string> {
  const r = await SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, goal },
    skills: [...NOTE_SKILLS, harmony],
    drills: DRILLS,
    now: () => new Date('2026-10-18T09:00:00Z'),
    maxItems: 12,
  });
  return r.currentPrompt()!.entry.skillId;
}

describe('goal ordering reaches sessions', () => {
  it('serves new items in the goal profile’s order', async () => {
    expect(await firstNewSkill('general')).toBe('F2.string6-naturals');
    expect(await firstNewSkill('songs')).toBe('C8.test-harmony');
  });
});
