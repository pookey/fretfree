import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { midiToFretNote } from '../../theory';
import { DRILLS } from '../registry';
import type { D2Prompt } from '../d2-find-the-note/logic';
import { D16_ID, type D16Prompt } from './logic';

/**
 * D16 through the real session runner (plan → prompt → grade → FSRS →
 * persist). A test skill borrows F2's string-6 find items, so D16 serves
 * every prompt.
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

function start(skills: Skill[] = [playSkill], micEnabled = true, maxItems = 8) {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, micEnabled },
    skills,
    drills: DRILLS,
    now: () => clock,
    rng: () => 0,
    maxItems,
  });
}

/** F2's own drills on its string-6 find items, as the shipped skill wires them. */
const f2Finds: Skill = { ...f2, items: () => finds.slice(0, 4) };

/** The drills a whole session serves, answering every prompt right. */
async function drillsServed(micEnabled: boolean): Promise<string[]> {
  const r = await start([f2Finds], micEnabled, 16);
  const ids: string[] = [];
  while (!r.isOver) {
    const { drill, prompt } = r.currentPrompt()!;
    ids.push(drill.id);
    if (drill.id === D16_ID) {
      const midi = (prompt as D16Prompt).midis[0]!;
      await r.answer({ midi, name: midiToFretNote(midi).name, cents: 0 }, 2000);
    } else {
      await r.answer((prompt as D2Prompt).targets[0], 900);
    }
    r.next();
  }
  return ids;
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

  it('is wired into the note and octave skills, and needs the mic', () => {
    const d16 = DRILLS.find((d) => d.id === D16_ID)!;
    expect(d16.requiresMic).toBe(true);
    expect(d16.skills).toEqual([
      'F2.string6-naturals',
      'F2.string5-naturals',
      'C1.octaves',
      'C1.octaves-gb-shift',
      'C1.double-octaves',
      'C2.string1-naturals',
      'C2.string4-naturals',
      'C2.string3-naturals',
      'C2.string2-naturals',
      'C2.low-accidentals',
      'C2.all-notes',
    ]);
  });

  it('is never served without mic mode, and is served with it', async () => {
    const without = await drillsServed(false);
    expect(without).toContain('find-the-note');
    expect(without).not.toContain(D16_ID);
    await db.delete();
    db = new FretworkDB(`d16-session-${n++}`);
    expect(await drillsServed(true)).toContain(D16_ID);
  });
});
