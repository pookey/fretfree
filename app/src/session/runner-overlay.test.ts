import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../engine';
import { DRILLS } from '../drills/registry';
import type { D1Prompt } from '../drills/d1-name-the-note/logic';
import { FretworkDB, allCards, getGamification, getSkillStates, reviewCount } from '../storage';
import { SessionRunner, type RunnerDeps } from './runner';

// M1-36: the development build's "unlock every skill" overlay. It widens the
// frontier, and answers on the skills only it unlocked are never stored.

let db: FretworkDB;
let n = 0;
let clock: Date;
const UNLOCK_ALL = { unlockAll: true };
// C2 opens once the F2 naturals are being practised, so a fresh learner has it locked.
const LOCKED = 'C2.all-notes';
const OPEN = 'F2.string6-naturals';
const deps = (over: Partial<RunnerDeps> = {}): RunnerDeps => ({
  db,
  scheduler: createScheduler({ enableFuzz: false }),
  settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
  skills: SKILLS,
  drills: DRILLS.filter((d) => d.id === 'name-the-note'),
  now: () => clock,
  maxItems: 8,
  ...over,
});
const focus = (...skillIds: string[]) => ({ skillIds, itemIds: [] });

async function answerAll(r: SessionRunner): Promise<string[]> {
  const skills: string[] = [];
  while (!r.isOver) {
    const cur = r.currentPrompt()!;
    skills.push(cur.entry.skillId);
    const res = await r.answer((cur.prompt as D1Prompt).expectedPc, 900);
    if (cur.entry.skillId === LOCKED) expect(res.xp).toBe(0);
    clock = new Date(clock.getTime() + 5_000);
    r.next();
  }
  return skills;
}

beforeEach(() => {
  db = new FretworkDB(`runner-overlay-${n++}`);
  clock = new Date('2026-10-18T09:00:00Z');
});

afterEach(async () => {
  await db.delete();
});

describe('the unlock-all overlay', () => {
  it('lets a focused session serve a locked skill', async () => {
    expect((await SessionRunner.start(deps({ focus: focus(LOCKED) }))).isEmpty).toBe(true);
    const r = await SessionRunner.start(deps({ focus: focus(LOCKED), overlay: UNLOCK_ALL }));
    expect(r.isEmpty).toBe(false);
    expect(r.currentPrompt()!.entry.skillId).toBe(LOCKED);
  });

  it('stores no card, review log, skill state or XP for the skills it unlocked', async () => {
    const r = await SessionRunner.start(deps({ focus: focus(LOCKED), overlay: UNLOCK_ALL }));
    const served = await answerAll(r);
    expect(served.length).toBeGreaterThan(0);
    expect(new Set(served)).toEqual(new Set([LOCKED]));
    const summary = await r.finish();
    expect(summary.itemsSeen).toBe(served.length);
    expect(summary.xp).toBe(0);
    expect(await allCards(db)).toEqual([]);
    expect(await reviewCount(db)).toBe(0);
    expect((await getSkillStates(db)).size).toBe(0);
    expect((await getGamification(db)).xpTotal).toBe(0);

    // Off again, the skill is as locked as it was.
    expect((await SessionRunner.start(deps({ focus: focus(LOCKED) }))).isEmpty).toBe(true);
  });

  it('still stores answers on skills that were really on the frontier', async () => {
    const r = await SessionRunner.start(
      deps({ focus: focus(OPEN, LOCKED), overlay: UNLOCK_ALL, maxItems: 30 }),
    );
    const served = await answerAll(r);
    expect(served).toContain(OPEN);
    await r.finish();
    const cards = await allCards(db);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.skillId === OPEN)).toBe(true);
    expect(await reviewCount(db)).toBe(served.filter((s) => s === OPEN).length);
    expect([...(await getSkillStates(db)).keys()]).toEqual([OPEN]);
  });
});
