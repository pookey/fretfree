import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, newItemCap, type Skill } from '../engine';
import { DRILLS } from '../drills/registry';
import type { D1Prompt } from '../drills/d1-name-the-note/logic';
import type { D2Prompt } from '../drills/d2-find-the-note/logic';
import { FretworkDB } from '../storage';
import { SessionRunner, type CurrentPrompt } from './runner';

/**
 * M10-03: the new-item cap through the real runner. Once the cap is reached
 * and nothing is due, the session recalls its new items once more, then ends
 * and meets the daily goal; the very first session has no parallel track.
 */

let db: FretworkDB;
let n = 0;
let clock: Date;
const string6 = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
const pulse = SKILLS.find((s) => s.id === 'F4.pulse')!;

const deps = (over: Partial<Parameters<typeof SessionRunner.start>[0]> = {}) => ({
  db,
  scheduler: createScheduler({ enableFuzz: false }),
  settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, sessionMinutes: 5 as const },
  skills: [string6],
  drills: DRILLS,
  now: () => clock,
  ...over,
});

beforeEach(() => {
  db = new FretworkDB(`runner-new-cap-${n++}`);
  clock = new Date('2026-10-18T09:00:00Z');
});

afterEach(async () => {
  await db.delete();
});

function correct(cur: CurrentPrompt): unknown {
  return cur.drill.id === 'find-the-note'
    ? (cur.prompt as D2Prompt).targets[0]
    : (cur.prompt as D1Prompt).expectedPc;
}

/** Answer every prompt correctly, 5 s apart, until the session is over. */
async function playOut(r: SessionRunner): Promise<CurrentPrompt[]> {
  const served: CurrentPrompt[] = [];
  while (!r.isOver) {
    const cur = r.currentPrompt()!;
    clock = new Date(clock.getTime() + 5_000);
    await r.answer(correct(cur), 900);
    served.push(cur);
    r.next();
  }
  return served;
}

describe('the new-item cap', () => {
  it('ends with one retrieval pass over the new items, and meets the daily goal', async () => {
    const r = await SessionRunner.start(deps());
    const served = await playOut(r);
    // Time is left: the cap, not the budget, ended the session.
    expect(r.remainingMs).toBeGreaterThan(0);
    const fresh = [
      ...new Set(served.filter((c) => c.entry.kind === 'new').map((c) => c.entry.itemId)),
    ];
    // Fast, right answers raise the 5-minute cap by half (the adaptive band).
    expect(fresh.length).toBeGreaterThanOrEqual(newItemCap(5));
    expect(fresh.length).toBeLessThanOrEqual(newItemCap(5, 1));
    // The pass recalls each new item once, unguided, at the end.
    const pass = served.slice(-fresh.length);
    expect(pass.every((c) => c.entry.kind === 'stretch' && !c.entry.guided)).toBe(true);
    expect(new Set(pass.map((c) => c.entry.itemId))).toEqual(new Set(fresh));

    const summary = await r.finish();
    expect(summary.enoughNew).toBe(true);
    // Short of the 5-minute budget and the daily goal, but the plan is done.
    expect(summary.minutes).toBeLessThan(5);
    expect(summary.goalMet).toBe(true);
    expect(summary.goalReached).toBe(true);
  });

  it('ends without the pass or the goal when the frontier simply runs out', async () => {
    const skill: Skill = { ...string6, items: () => string6.items().slice(0, 2) };
    const r = await SessionRunner.start(deps({ skills: [skill] }));
    const served = await playOut(r);
    expect(served.some((c) => c.entry.kind === 'stretch')).toBe(false);
    const summary = await r.finish();
    expect(summary).toMatchObject({ enoughNew: false, goalMet: false });
  });

  it('counts earlier sessions today toward the cap, but not the next day', async () => {
    await playOut(await SessionRunner.start(deps())).then(() => undefined);
    // A second session the same day has no new items left: nothing due, so it
    // has nothing to plan and says why.
    clock = new Date(clock.getTime() + 60 * 60_000);
    const again = await SessionRunner.start(deps());
    expect(again.capSpent).toBe(true);
    const served = await playOut(again);
    expect(served.some((c) => c.entry.kind === 'new')).toBe(false);

    // Tomorrow the cap is fresh.
    clock = new Date(clock.getTime() + 86_400_000);
    const tomorrow = await SessionRunner.start(deps());
    expect(tomorrow.capSpent).toBe(false);
    const next = await playOut(tomorrow);
    expect(next.some((c) => c.entry.kind === 'new')).toBe(true);
  });

  it('treats less than a lane block left as spent, and ends with the reason', async () => {
    // Introduce 3 of the 5-minute cap of 4 (the worked examples), then quit mid-block.
    const first = await SessionRunner.start(deps());
    for (let i = 0; i < 3; i++) {
      const cur = first.currentPrompt()!;
      expect(cur.entry).toMatchObject({ kind: 'new', guided: true });
      clock = new Date(clock.getTime() + 5_000);
      await first.answer(correct(cur), 900);
      first.next();
    }
    await first.finish();

    // The same day, one new item is left: no plan can open a lane with it.
    clock = new Date(clock.getTime() + 30_000);
    const again = await SessionRunner.start(deps());
    expect(again.capSpent).toBe(true);
    const served = await playOut(again);
    expect(served.some((c) => c.entry.kind === 'new')).toBe(false);
    expect(again.remainingMs).toBeGreaterThan(0);
    const summary = await again.finish();
    expect(summary.enoughNew).toBe(true);
    expect(summary.itemsSeen).toBeGreaterThan(0);
    expect(summary.goalMet).toBe(true);
  });

  it('leaves placement-seeded cards out of the cap', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    // Placement seeded string 6's first few items this morning, with no session answer.
    const seeded = string6.items().slice(0, 6);
    await db.cards.bulkPut(seeded.map((i) => scheduler.seedKnownCard(i, clock)));
    const r = await SessionRunner.start(deps());
    expect(r.capSpent).toBe(false);
    const served = await playOut(r);
    const fresh = new Set(served.filter((c) => c.entry.kind === 'new').map((c) => c.entry.itemId));
    expect(fresh.size).toBeGreaterThanOrEqual(newItemCap(5));
  });

  it('serves a parallel track in a first session that focuses on it', async () => {
    const r = await SessionRunner.start(
      deps({ skills: [string6, pulse], focus: { skillIds: [pulse.id], itemIds: [] } }),
    );
    expect(r.currentPrompt()?.entry.skillId).toBe(pulse.id);
  });

  it('keeps the very first session to the neck, then gives Rhythm a turn', async () => {
    const first = await SessionRunner.start(deps({ skills: [string6, pulse] }));
    const served = await playOut(first);
    expect(served.every((c) => c.entry.skillId === string6.id)).toBe(true);
    await first.finish();

    clock = new Date(clock.getTime() + 86_400_000);
    const second = await SessionRunner.start(deps({ skills: [string6, pulse] }));
    const planned = new Set<string>();
    for (let i = 0; i < second.length; i++) {
      const cur = second.currentPrompt();
      if (!cur) break;
      planned.add(cur.entry.skillId);
      if (cur.entry.skillId === pulse.id) break;
      clock = new Date(clock.getTime() + 5_000);
      await second.answer(correct(cur), 900);
      second.next();
    }
    expect(planned.has(pulse.id)).toBe(true);
  });
});
