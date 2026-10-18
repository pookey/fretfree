import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../engine';
import { DRILLS, getDrill } from '../drills/registry';
import type { AnyDrillType } from '../drills/types';
import type { D1Prompt } from '../drills/d1-name-the-note/logic';
import type { D2Prompt } from '../drills/d2-find-the-note/logic';
import { FretworkDB, putSkillState } from '../storage';
import { getTuning } from '../theory/tunings';
import { factOf } from './drill-picker';
import { SessionRunner, type CurrentPrompt } from './runner';

/**
 * M1-17: multi-drill sessions and in-session learning steps (design §3.3),
 * through the real runner and storage.
 */

let db: FretworkDB;
let n = 0;
let clock: Date;
const MINUTE = 60_000;
const string6 = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
const string5 = SKILLS.find((s) => s.id === 'F2.string5-naturals')!;
const D1 = getDrill('name-the-note')!;

const deps = (over: Partial<Parameters<typeof SessionRunner.start>[0]> = {}) => ({
  db,
  scheduler: createScheduler({ enableFuzz: false }),
  settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, sessionMinutes: 15 as const },
  skills: [string6],
  drills: DRILLS,
  now: () => clock,
  ...over,
});

beforeEach(() => {
  db = new FretworkDB(`multi-drill-${n++}`);
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

/** Answer the current prompt correctly after `stepMs`, then advance. */
async function play(r: SessionRunner, responseMs: number, stepMs = 5_000) {
  const cur = r.currentPrompt()!;
  clock = new Date(clock.getTime() + stepMs);
  await r.answer(correct(cur), responseMs);
  return cur;
}

describe('multi-drill sessions', () => {
  it('serves each fact through both drills: a D1 block, then its D2 partner block', async () => {
    const r = await SessionRunner.start(deps({ maxItems: 32 }));
    const served: CurrentPrompt[] = [];
    while (!r.isOver) {
      served.push(await play(r, 900));
      r.next();
    }
    expect(served).toHaveLength(32);
    const tuning = getTuning('standard');
    const facts = (from: number, to: number) =>
      new Set(
        served
          .slice(from, to)
          .map((c) => factOf({ id: c.entry.itemId, skillId: c.entry.skillId }, tuning)?.fact),
      );
    expect(served.slice(0, 16).every((c) => c.drill.id === 'name-the-note')).toBe(true);
    expect(served.slice(16).every((c) => c.drill.id === 'find-the-note')).toBe(true);
    // The find block practises the same four facts in the other direction.
    expect(facts(0, 16)).toEqual(new Set(['s6:4', 's6:5', 's6:7', 's6:9']));
    expect(facts(16, 32)).toEqual(facts(0, 16));
    expect(served[16]?.entry).toMatchObject({ itemId: 'find:E@s6', guided: true, rep: 0 });
    const log = await db.reviewLogs.toArray();
    expect(new Set(log.map((l) => l.drillType))).toEqual(
      new Set(['name-the-note', 'find-the-note']),
    );
  });

  it('varies the drill when more than one can serve an item, within and across sessions', async () => {
    // A stand-in for a second drill on the same items (e.g. a future mic drill).
    const echo: AnyDrillType = { ...D1, id: 'echo' };
    const skill: Skill = {
      ...string6,
      drillTypes: ['name-the-note', 'echo'],
      items: () => [{ id: 'note@s6f5', skillId: string6.id }],
    };
    const r = await SessionRunner.start(deps({ skills: [skill], drills: [D1, echo], maxItems: 4 }));
    const drills: string[] = [];
    while (!r.isOver) {
      drills.push((await play(r, 900)).drill.id);
      r.next();
    }
    expect(drills).toEqual(['name-the-note', 'echo', 'name-the-note', 'echo']);
    await r.finish();

    // Next week the item is due; the last drill was `echo`, so D1 serves it.
    clock = new Date(clock.getTime() + 30 * 86_400_000);
    const r2 = await SessionRunner.start(
      deps({ skills: [skill], drills: [D1, echo], maxItems: 1 }),
    );
    expect(r2.currentPrompt()).toMatchObject({ entry: { kind: 'review' } });
    expect(r2.currentPrompt()?.drill.id).toBe('name-the-note');
  });
});

describe('new blocks', () => {
  it('open with a worked example, then fade from guided to independent', async () => {
    await putSkillState(db, {
      skillId: string6.id,
      status: 'practising',
      guideLevel: 0,
      rollingAccuracy: 0.9,
    });
    const r = await SessionRunner.start(deps({ drills: [D1], maxItems: 16 }));
    const seen: CurrentPrompt[] = [];
    while (!r.isOver) {
      seen.push(await play(r, 900));
      r.next();
    }
    const byRep = (rep: number) => seen.filter((c) => c.entry.rep === rep);
    expect(byRep(0).every((c) => c.entry.guided && c.guideLevel === 3)).toBe(true);
    expect(byRep(1).map((c) => c.guideLevel)).toEqual([2, 2, 2, 2]);
    expect(byRep(2).map((c) => c.guideLevel)).toEqual([1, 1, 1, 1]);
    expect(byRep(3).map((c) => c.guideLevel)).toEqual([0, 0, 0, 0]);
    expect(seen.slice(4).some((c) => c.entry.guided)).toBe(false);
    expect(new Set(seen.map((c) => c.entry.itemId)).size).toBe(4);
  });

  it('fade toward the in-session guide level as it fades (M1-15)', async () => {
    const r = await SessionRunner.start(deps({ drills: [D1], maxItems: 16 }));
    const levels: number[] = [];
    while (!r.isOver) {
      levels.push((await play(r, 900)).guideLevel);
      r.next();
    }
    // Worked examples don't count. Every 5 fluent recalls fade the skill a level
    // (3 → 2 after the 9th prompt, 2 → 1 after the 14th), and the reps follow it.
    expect(levels).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1]);
  });
});

describe('in-session learning steps', () => {
  /** Slow answers are Hard, so new cards end their block in a 6-minute learning step. */
  async function slowBlock(r: SessionRunner, count = 16) {
    for (let i = 0; i < count; i++) {
      await play(r, 9_000);
      if (i < count - 1) r.next();
    }
  }

  it('brings a card back once its learning step comes due', async () => {
    const r = await SessionRunner.start(deps({ drills: [D1], maxItems: 16 }));
    await slowBlock(r);
    clock = new Date(clock.getTime() + 7 * MINUTE);
    r.next();
    expect(r.isOver).toBe(false);
    expect(r.length).toBe(20);
    const steps: string[] = [];
    while (!r.isOver) {
      const cur = await play(r, 900);
      expect(cur.entry).toMatchObject({ kind: 'review', guided: false });
      expect(cur.entry.rep).toBeUndefined();
      steps.push(cur.entry.itemId);
      r.next();
    }
    // Each learning card once, in due order, and the next step (10 min) is past the budget.
    expect(steps).toEqual(['note@s6f0', 'note@s6f1', 'note@s6f3', 'note@s6f5']);
    const summary = await r.finish();
    expect(summary.itemsSeen).toBe(20);
  });

  it('does not bring a step back early', async () => {
    const r = await SessionRunner.start(deps({ drills: [D1], maxItems: 16 }));
    await slowBlock(r);
    clock = new Date(clock.getTime() + MINUTE);
    r.next();
    expect(r.isOver).toBe(true);
  });

  it('waits for the new block in progress to end', async () => {
    const r = await SessionRunner.start(
      deps({ skills: [string6, string5], drills: [D1], maxItems: 32 }),
    );
    await slowBlock(r);
    r.next();
    await play(r, 900);
    r.next();
    clock = new Date(clock.getTime() + 7 * MINUTE);
    await play(r, 900);
    r.next();
    expect(r.length).toBe(36);
    const kinds: string[] = [];
    while (!r.isOver) {
      kinds.push((await play(r, 900)).entry.kind);
      r.next();
    }
    // The rest of the second block (14 of 16), then the four steps.
    expect(kinds).toEqual([...Array(14).fill('new'), ...Array(4).fill('review')]);
  });

  it('drops a step whose due time is past the time budget', async () => {
    const r = await SessionRunner.start(
      deps({
        drills: [D1],
        maxItems: 16,
        settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, sessionMinutes: 5 },
      }),
    );
    await slowBlock(r);
    clock = new Date(clock.getTime() + 3 * MINUTE);
    r.next();
    // 6-minute steps from minute ~1.3 land after the 5-minute budget.
    expect(r.isOver).toBe(true);
  });
});

describe('the time budget', () => {
  it('reports the time left and ends when it runs out', async () => {
    const r = await SessionRunner.start(deps({ drills: [D1] }));
    expect(r.remainingMs).toBe(15 * MINUTE);
    expect(r.endsAt).toEqual(new Date(clock.getTime() + 15 * MINUTE));
    await play(r, 900, 2 * MINUTE);
    r.next();
    expect(r.remainingMs).toBe(13 * MINUTE);
    clock = new Date(clock.getTime() + 20 * MINUTE);
    expect(r.remainingMs).toBe(0);
    expect(r.isOver).toBe(true);
    r.next();
    expect(r.currentPrompt()).toBeNull();
  });

  it('plans again when the queue runs dry with time left', async () => {
    const settings = { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, sessionMinutes: 5 as const };
    const r = await SessionRunner.start(
      deps({ skills: [string6, string5], drills: [D1], settings }),
    );
    // 5 minutes plan 43 prompts: ten new items × 4 reps.
    expect(r.length).toBe(40);
    const items = new Set<string>();
    for (let i = 0; i < 40; i++) {
      items.add((await play(r, 300, 1_000)).entry.itemId);
      r.next();
    }
    expect(items.size).toBe(10);
    // Answered fast, the plan is spent in 40 s: the rest of the frontier follows.
    expect(r.isOver).toBe(false);
    expect(r.length).toBe(64);
    expect(r.currentPrompt()).toMatchObject({ entry: { kind: 'new', guided: true } });
    expect(items.has(r.currentPrompt()!.entry.itemId)).toBe(false);
  });

  it('ends a dry queue when nothing is left to plan', async () => {
    const skill: Skill = { ...string6, items: () => string6.items().slice(0, 2) };
    const r = await SessionRunner.start(deps({ skills: [skill], drills: [D1] }));
    expect(r.length).toBe(8);
    while (!r.isOver) {
      await play(r, 300, 1_000);
      r.next();
    }
    // Nothing is due, nothing is new, and today's items are never stretch items.
    expect(r.position).toBe(8);
    expect(r.remainingMs).toBeGreaterThan(0);
  });
});
