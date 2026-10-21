import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D33_ID, type D33Prompt } from './logic';

/** D33 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-21T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d33-session-${n++}`);
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

describe('D33 in a session', () => {
  it('serves tab cards, worked example first, and grades the tap on speed', async () => {
    const r = await start([{ ...skill('TAB.string1'), prerequisites: [] }]);
    const first = r.currentPrompt()!;
    expect(first.drill.id).toBe(D33_ID);
    expect(first.entry).toMatchObject({ itemId: 'tab@s1f0', kind: 'new', guided: true });
    const p = first.prompt as D33Prompt;
    expect(p.target).toEqual({ string: 1, fret: 0 });
    const res = await r.answer(p.target, 1200);
    expect(res.result).toMatchObject({ correct: true, concept: 'tab:line1' });
    r.next();

    // The upside-down misreading is logged as a confusion of the two E lines.
    const next = r.currentPrompt()!.prompt as D33Prompt;
    const miss = await r.answer({ string: 6, fret: next.target.fret }, 1500);
    expect(miss.result).toMatchObject({ correct: false, confusedWith: 'tab:line6' });
    expect(miss.sounds.given).toHaveLength(1);
    expect(await db.confusions.count()).toBe(1);

    const log = await db.reviewLogs.toArray();
    expect(log.every((l) => l.drillType === D33_ID && l.skillId === 'TAB.string1')).toBe(true);
    expect(log[0]).toMatchObject({ correct: true, responseMs: 1200, hintUsed: true });
    expect(log[1]?.answerGiven).toBe(`s6f${next.target.fret}`);
  });

  it('registers as the drill for every TAB skill', () => {
    const d33 = DRILLS.find((d) => d.id === D33_ID)!;
    expect(d33.skills).toEqual([
      'TAB.string1',
      'TAB.string6',
      'TAB.string2',
      'TAB.string5',
      'TAB.string3',
      'TAB.string4',
    ]);
    expect(d33.requiresMic).toBeFalsy();
    expect(d33.requiresSound).toBeFalsy();
  });
});
