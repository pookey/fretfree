import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { midiToFretNote } from '../../theory';
import { DRILLS } from '../registry';
import { D16_ID, type D16Prompt } from './logic';

/**
 * D16 through the real session runner (plan → prompt → grade → FSRS →
 * persist). No shipped skill serves D16 until the mic gate lands (M5-06), so
 * a test skill borrows F2's string-6 items.
 */

const f2 = SKILLS.find((s) => s.id === 'F2.string6-naturals') as Skill;
const finds = f2.items().filter((i) => i.id.startsWith('find:'));
const playSkill: Skill = {
  ...f2,
  id: 'test.play-string6',
  prerequisites: [],
  drillTypes: [D16_ID],
  items: () => finds.map((i) => ({ ...i, skillId: 'test.play-string6' })),
};

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-19T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d16-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

function start() {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: [playSkill],
    drills: DRILLS,
    now: () => clock,
    rng: () => 0,
    maxItems: 4,
  });
}

describe('D16 in a session', () => {
  it('serves find items, grades the note heard and logs it', async () => {
    const r = await start();
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D16_ID);
    const p = cur.prompt as D16Prompt;
    expect(p.mode).toBe('pitch-class');
    const midi = p.midis[0]!;
    const res = await r.answer({ midi, name: midiToFretNote(midi).name, cents: 3 }, 2650);
    expect(res.result.correct).toBe(true);
    expect(res.sounds).toEqual({ expected: [] });
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({ drillType: D16_ID, correct: true, responseMs: 1500 });
    expect(log?.answerGiven).toBe(midiToFretNote(midi).name);
  });

  it('logs a wrong note as a confusion', async () => {
    const r = await start();
    const p = r.currentPrompt()!.prompt as D16Prompt;
    const wrong = p.midis[0]! + 2;
    const res = await r.answer({ midi: wrong, name: midiToFretNote(wrong).name, cents: 0 }, 3000);
    expect(res.result).toMatchObject({ correct: false, expected: p.pc });
    expect(res.result.confusedWith).toBe(midiToFretNote(wrong).pc);
    expect(res.sounds.given).toEqual([midiToFretNote(wrong).name]);
  });
});
