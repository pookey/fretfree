import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { noteAtStaffPosition } from '../../theory';
import { DRILLS } from '../registry';
import { D22_ID, type D22Prompt } from './logic';

/** D22 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-24T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d22-session-${n++}`);
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

describe('D22 in a session', () => {
  it('serves staff cards, worked example first, and logs a neighbour confusion', async () => {
    const r = await start([{ ...skill('R1.staff'), prerequisites: [] }]);
    const first = r.currentPrompt()!;
    expect(first.drill.id).toBe(D22_ID);
    expect(first.entry).toMatchObject({ itemId: 'staff:G3@treble8vb', kind: 'new', guided: true });
    const p = first.prompt as D22Prompt;
    expect(p).toMatchObject({ direction: 'read', letter: 'G', position: 2 });
    const res = await r.answer('G', 1200);
    expect(res.result).toMatchObject({ correct: true, concept: 'staff@2' });
    expect(res.sounds).toEqual({ expected: ['G3'] });
    r.next();

    // Reading the line as the space above it is logged against that space.
    const next = r.currentPrompt()!.prompt as D22Prompt;
    const above = noteAtStaffPosition(next.position + 1);
    const answer = next.direction === 'read' ? above.charAt(0) : next.position + 1;
    const miss = await r.answer(answer, 1500);
    expect(miss.result).toMatchObject({
      correct: false,
      confusedWith: `staff@${next.position + 1}`,
    });
    expect(miss.sounds.given).toHaveLength(1);
    expect(await db.confusions.count()).toBe(1);

    const log = await db.reviewLogs.toArray();
    expect(log.every((l) => l.drillType === D22_ID && l.skillId === 'R1.staff')).toBe(true);
    expect(log[0]).toMatchObject({ correct: true, responseMs: 1200, answerGiven: 'G' });
  });

  it('is the drill for every R1 skill', () => {
    const d22 = DRILLS.find((d) => d.id === D22_ID)!;
    expect(d22.skills).toEqual(['R1.staff', 'R1.ledger-below', 'R1.ledger-above']);
    for (const s of d22.skills) {
      for (const item of skill(s).items()) expect(d22.canTest(item), item.id).toBe(true);
    }
    expect(d22.requiresMic).toBeFalsy();
    expect(d22.requiresSound).toBeFalsy();
  });
});
