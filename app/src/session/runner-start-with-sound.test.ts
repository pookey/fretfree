import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../engine';
import { DRILLS } from '../drills/registry';
import { FretworkDB } from '../storage';
import { SessionRunner } from './runner';

// "Start with sound" (design §4): a first session opens with ear → fretboard.

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');
const start = (startWithSound: boolean) =>
  SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, startWithSound },
    skills: SKILLS,
    drills: DRILLS,
    now: () => clock,
    maxItems: 12,
  });

beforeEach(() => {
  db = new FretworkDB(`start-with-sound-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

const skillOf = (r: SessionRunner) => r.currentPrompt()?.entry.skillId;

describe('SessionRunner with "start with sound"', () => {
  it('starts a fresh learner on the neck by default', async () => {
    const r = await start(false);
    expect(skillOf(r)).not.toMatch(/^I6\./);
  });

  it('starts a fresh learner on ear → fretboard', async () => {
    const r = await start(true);
    const first = r.currentPrompt()!;
    expect(first.entry.skillId).toBe('I6.ear-find');
    expect(first.entry.itemId).toMatch(/^ear-find:/);
    expect(first.drill.id).toBe('hear-it-find-it');
  });
});
