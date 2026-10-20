import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D2_ID, type D2Prompt } from '../d2-find-the-note/logic';
import { D15_ID, type D15Prompt } from './logic';

/**
 * D15 through the real session runner (plan → prompt → grade → FSRS →
 * persist): I6's ear-find cards by ear, and C2's find cards after D2.
 */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;
const ear = skill('I6.ear-find');
const c2 = skill('C2.all-notes');

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-20T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d15-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

function start(skills: Skill[], maxItems = 4) {
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
  it('serves ear-find cards by ear, grades the tap and logs it by interval', async () => {
    const r = await start([{ ...ear, prerequisites: [] }]);
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D15_ID);
    expect(cur.entry.itemId).toBe('ear-find:A@s6');
    const p = cur.prompt as D15Prompt;
    expect(p).toMatchObject({ byEar: true, scope: 'string', target: { string: 6, fret: 5 } });
    const res = await r.answer(p.target, 1900);
    expect(res.result).toMatchObject({ correct: true, expected: 'A', concept: 'ear:P4' });
    r.next();

    const next = r.currentPrompt()!.prompt as D15Prompt;
    const wrong = { string: next.string, fret: next.target.fret - 1 };
    const miss = await r.answer(wrong, 1200);
    expect(miss.result).toMatchObject({ correct: false, confusedWith: 'ear:M3' });
    expect(miss.sounds.given).toHaveLength(1);
    expect(await db.confusions.count()).toBe(1);

    const log = await db.reviewLogs.toArray();
    expect(log.every((l) => l.drillType === D15_ID && l.skillId === 'I6.ear-find')).toBe(true);
    // By ear, the listening allowance comes off before grading and logging.
    expect(log[0]).toMatchObject({ correct: true, responseMs: 900 });
    expect(log[1]?.answerGiven).toBe(`s${wrong.string}f${wrong.fret}`);
  });

  it('serves C2 find cards named, after D2, graded like D2', async () => {
    const d15 = DRILLS.find((d) => d.id === D15_ID)!;
    expect(d15.skills).toEqual(['C2.all-notes', 'I6.ear-find']);
    expect(d15.requiresMic).toBeFalsy();

    // C2's own drill list on a few find items: D2 serves first, then D15
    // (the picker varies the drill, research/02 rule 12).
    const finds = c2.items().filter((i) => i.id.startsWith('find:'));
    const c2Finds: Skill = { ...c2, prerequisites: [], items: () => finds.slice(0, 2) };
    const r = await start([c2Finds], 12);
    const served: string[] = [];
    while (!r.isOver) {
      const { drill, prompt } = r.currentPrompt()!;
      served.push(drill.id);
      if (drill.id === D15_ID) expect((prompt as D15Prompt).byEar).toBe(false);
      await r.answer(
        drill.id === D15_ID ? (prompt as D15Prompt).target : (prompt as D2Prompt).targets[0],
        1500,
      );
      r.next();
    }
    expect(served[0]).toBe(D2_ID);
    expect(served).toContain(D15_ID);
    const logs = await db.reviewLogs.where('drillType').equals(D15_ID).toArray();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.responseMs === 1500)).toBe(true);
  });
});
