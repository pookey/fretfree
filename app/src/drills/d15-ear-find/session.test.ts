import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D2_ID, type D2Prompt } from '../d2-find-the-note/logic';
import { D15_ID, type D15Prompt } from './logic';

/**
 * D15 through the real session runner (plan → prompt → grade → FSRS →
 * persist). A test skill borrows C2's find items, so D15 serves every
 * prompt; C2's own wiring serves it after D2.
 */

const c2 = SKILLS.find((s) => s.id === 'C2.all-notes') as Skill;
const finds = c2.items().filter((i) => i.id.startsWith('find:'));
const earSkill: Skill = {
  ...c2,
  id: 'test.ear-find',
  prerequisites: [],
  drillTypes: [D15_ID],
  items: () => finds.map((i) => ({ ...i, skillId: 'test.ear-find' })),
};

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-20T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d15-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

function start(skills: Skill[] = [earSkill], maxItems = 4) {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills,
    drills: DRILLS,
    now: () => clock,
    rng: () => 0,
    maxItems,
  });
}

describe('D15 in a session', () => {
  it('serves find items, grades the tapped cell and logs it', async () => {
    const r = await start();
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D15_ID);
    const p = cur.prompt as D15Prompt;
    expect(p.scope).toBe('named');
    const res = await r.answer(p.target, 900);
    expect(res.result).toMatchObject({ correct: true, expected: p.pc });
    expect(res.sounds.given).toBeUndefined();
    r.next();

    const next = r.currentPrompt()!.prompt as D15Prompt;
    const wrong = { string: next.string, fret: next.target.fret - 1 };
    const miss = await r.answer(wrong, 1200);
    expect(miss.result.correct).toBe(false);
    expect(miss.sounds.given).toHaveLength(1);
    expect(await db.confusions.count()).toBe(1);

    const log = await db.reviewLogs.toArray();
    expect(log.every((l) => l.drillType === D15_ID)).toBe(true);
    expect(log[0]).toMatchObject({ correct: true, responseMs: 900 });
    expect(log[1]?.answerGiven).toBe(`s${wrong.string}f${wrong.fret}`);
  });

  it('is wired into C2, after D2 on the same cards', async () => {
    const d15 = DRILLS.find((d) => d.id === D15_ID)!;
    expect(d15.skills).toEqual(['C2.all-notes']);
    expect(d15.requiresMic).toBeFalsy();

    // C2's own drill list on a few find items: D2 serves first, then D15
    // (the picker varies the drill, research/02 rule 12).
    const c2Finds: Skill = { ...c2, prerequisites: [], items: () => finds.slice(0, 2) };
    const r = await start([c2Finds], 12);
    const served: string[] = [];
    while (!r.isOver) {
      const { drill, prompt } = r.currentPrompt()!;
      served.push(drill.id);
      await r.answer(
        drill.id === D15_ID ? (prompt as D15Prompt).target : (prompt as D2Prompt).targets[0],
        900,
      );
      r.next();
    }
    expect(served[0]).toBe(D2_ID);
    expect(served).toContain(D15_ID);
  });
});
