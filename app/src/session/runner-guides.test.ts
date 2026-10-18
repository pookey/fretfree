import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  ENGINE_CONFIG,
  SKILLS,
  blockGuideLevel,
  createScheduler,
} from '../engine';
import { DRILLS } from '../drills/registry';
import type { D1Prompt } from '../drills/d1-name-the-note/logic';
import { FretworkDB, getSkillStates } from '../storage';
import { SessionRunner } from './runner';

/** Guide fading within and across sessions (M1-15, design §3.5). */

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');
const deps = () => ({
  db,
  scheduler: createScheduler({ enableFuzz: false }),
  settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
  // One skill keeps every answer on the same guide level.
  skills: SKILLS.filter((s) => s.id === 'F2.string6-naturals'),
  drills: DRILLS.filter((d) => d.id === 'name-the-note'),
  now: () => clock,
  maxItems: 30,
});

beforeEach(() => {
  db = new FretworkDB(`runner-guides-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

const { fadeAfterFluent, restoreAfterErrors } = ENGINE_CONFIG.guides;
const FLUENT_MS = 600;

async function answer(r: SessionRunner, correct: boolean, ms = FLUENT_MS) {
  const cur = r.currentPrompt()!;
  const expected = (cur.prompt as D1Prompt).expectedPc;
  await r.answer(correct ? expected : expected === 'C' ? 'D' : 'C', ms);
  r.next();
}

async function skipWorkedExamples(r: SessionRunner) {
  while (r.currentPrompt()!.entry.guided) await answer(r, true);
}

describe('SessionRunner guide fading', () => {
  it('fades after consecutive fluent answers and restores after errors, mid-session', async () => {
    const r = await SessionRunner.start(deps());
    await skipWorkedExamples(r);
    expect(r.currentPrompt()!.guideLevel).toBe(3);

    for (let i = 0; i < fadeAfterFluent; i++) await answer(r, true);
    expect(r.currentPrompt()!.guideLevel).toBe(2);

    for (let i = 0; i < restoreAfterErrors; i++) await answer(r, false);
    expect(r.currentPrompt()!.guideLevel).toBe(3);
  });

  it('slow correct answers do not fade guides', async () => {
    const r = await SessionRunner.start(deps());
    await skipWorkedExamples(r);
    for (let i = 0; i < fadeAfterFluent; i++) await answer(r, true, 9000);
    expect(r.currentPrompt()!.guideLevel).toBe(3);
  });

  it('carries the faded level into the next session and reports the skill as improved', async () => {
    const r1 = await SessionRunner.start(deps());
    await skipWorkedExamples(r1);
    for (let i = 0; i < fadeAfterFluent; i++) await answer(r1, true);
    const summary = await r1.finish();
    expect(summary.improvedSkills).toContain('F2.string6-naturals');
    expect((await getSkillStates(db)).get('F2.string6-naturals')?.guideLevel).toBe(2);

    const r2 = await SessionRunner.start(deps());
    await skipWorkedExamples(r2);
    // Session 2 opens on new items: their reps fade from full guides to the
    // carried level, which the last (independent) rep shows (M1-17).
    const reps = ENGINE_CONFIG.session.newBlockReps;
    const first = r2.currentPrompt()!;
    expect(first.guideLevel).toBe(blockGuideLevel(first.entry.rep!, reps, 2));
    // Fresh streak per session: one fluent answer short of a fade keeps level 2.
    for (let i = 0; i < fadeAfterFluent - 1; i++) await answer(r2, true);
    // Slow correct answers neither fade nor restore; walk on to the independent rep.
    while (r2.currentPrompt()!.entry.rep !== reps) await answer(r2, true, 9000);
    expect(r2.currentPrompt()!.guideLevel).toBe(2);
  });
});
