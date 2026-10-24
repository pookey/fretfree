import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D23_ID, type D23Prompt } from './logic';

/** D23 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-24T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d23-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

function start(skills: Skill[], maxItems = 8) {
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

describe('D23 in a session', () => {
  it('serves open position first, worked example first, and logs a misread', async () => {
    const r = await start([{ ...skill('R2.open'), prerequisites: [] }]);
    const first = r.currentPrompt()!;
    expect(first.drill.id).toBe(D23_ID);
    expect(first.entry).toMatchObject({ itemId: 'staff→fret:D3@open', kind: 'new', guided: true });
    const p = first.prompt as D23Prompt;
    expect(p.target).toEqual({ string: 4, fret: 0 });
    expect(p.region).toEqual({ from: 0, to: 3 });
    const res = await r.answer(p.target, 1200);
    expect(res.result).toMatchObject({ correct: true, concept: 'staff@-1' });
    r.next();

    // A tap a fret up the same string reads the note a step higher.
    const next = r.currentPrompt()!.prompt as D23Prompt;
    const up = { string: next.target.string, fret: next.target.fret + 2 };
    const miss = await r.answer(up, 1500);
    expect(miss.result.correct).toBe(false);
    expect(miss.sounds.given).toHaveLength(1);

    const log = await db.reviewLogs.toArray();
    expect(log.every((l) => l.drillType === D23_ID && l.skillId === 'R2.open')).toBe(true);
    expect(log[0]).toMatchObject({ correct: true, responseMs: 1200, hintUsed: true });
    expect(log[1]?.answerGiven).toBe(`s${up.string}f${up.fret}`);
  });

  it('registers as the drill for every R2 position', () => {
    const d23 = DRILLS.find((d) => d.id === D23_ID)!;
    expect(d23.skills).toEqual(['R2.open', 'R2.pos5', 'R2.pos7', 'R2.pos9', 'R2.pos12']);
    expect(d23.requiresMic).toBeFalsy();
    expect(d23.requiresSound).toBeFalsy();
  });
});
