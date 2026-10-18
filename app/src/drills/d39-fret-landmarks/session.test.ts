import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D39_ID, type D39Prompt } from './logic';

/**
 * D39 through the real session runner. "Practise this now" on the F3 skills
 * used to open an empty session, because no drill could test their items.
 */

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d39-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

async function start(skillId: string) {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: SKILLS,
    drills: DRILLS,
    now: () => clock,
    maxItems: 8,
    focus: { skillIds: [skillId], itemIds: [] },
  });
}

describe('D39 in a session', () => {
  it('serves the fret markers lesson, grades it and logs it', async () => {
    const r = await start('F3.markers');
    expect(r.isEmpty).toBe(false);
    const first = r.currentPrompt()!;
    expect(first.drill.id).toBe(D39_ID);
    expect(first.entry.guided).toBe(true);

    const p = first.prompt as D39Prompt;
    const right = await r.answer(p.expected, 400);
    expect(right.result.correct).toBe(true);
    expect(right.sounds.expected).toHaveLength(1);
    r.next();

    const q = r.currentPrompt()!.prompt as D39Prompt;
    const miss = await r.answer(q.expected === 12 ? 9 : 12, 900);
    expect(miss.result.correct).toBe(false);
    expect(await db.confusions.count()).toBe(1);
    r.next();

    while (!r.isOver) {
      await r.answer((r.currentPrompt()!.prompt as D39Prompt).expected, 600);
      r.next();
    }
    await r.finish();
    const log = await db.reviewLogs.toArray();
    expect(log.length).toBeGreaterThan(2);
    expect(log.every((l) => l.drillType === D39_ID)).toBe(true);
  });

  it('serves the 12th-fret repeat once it unlocks', async () => {
    await db.skillStates.put({
      skillId: 'F3.markers',
      status: 'practising',
      guideLevel: 3,
      rollingAccuracy: 1,
    });
    const r = await start('F3.repeat-12');
    expect(r.isEmpty).toBe(false);
    const p = r.currentPrompt()!.prompt as D39Prompt;
    expect(p.mode).toBe('repeat');
  });
});
