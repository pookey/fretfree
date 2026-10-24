import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import type { D23Prompt } from '../d23-staff-to-fret/logic';
import { D24_ID, type D24Prompt } from './logic';

/** D24 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-24T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d24-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

function start(skills: Skill[], maxItems = 40) {
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

describe('D24 in a session', () => {
  it('follows the reading cards with their reverse, and logs a misplaced note', async () => {
    const r = await start([{ ...skill('R2.pos5'), prerequisites: [] }]);
    // The reading cards (D23) lead; answer them right until a D24 card comes.
    const served: string[] = [];
    for (let i = 0; i < 40 && r.currentPrompt()?.drill.id !== D24_ID; i++) {
      const cur = r.currentPrompt()!;
      served.push(cur.entry.itemId);
      await r.answer((cur.prompt as D23Prompt).target, 1200);
      r.next();
    }
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D24_ID);
    const p = cur.prompt as D24Prompt;
    // Its reading card came first, so this one is recalled, not copied.
    expect(served).toContain(`staff→fret:${p.note}@pos5`);
    expect(cur.entry.itemId).toBe(`fret→staff:${p.note}@pos5`);

    // The space above the note's line: a neighbour confusion, both notes played.
    const miss = await r.answer(p.place + 1, 1500);
    expect(miss.result).toMatchObject({
      correct: false,
      concept: `staff@${p.place}`,
      confusedWith: `staff@${p.place + 1}`,
    });
    expect(miss.sounds.expected).toEqual([p.note]);
    expect(miss.sounds.given).toHaveLength(1);
    expect(await db.confusions.count()).toBe(1);

    const log = (await db.reviewLogs.toArray()).filter((l) => l.drillType === D24_ID);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      skillId: 'R2.pos5',
      correct: false,
      answerGiven: `pos${p.place + 1}`,
    });
  });

  it('registers as the drill for every R2 position, beside D23', () => {
    const d24 = DRILLS.find((d) => d.id === D24_ID)!;
    expect(d24.skills).toEqual(['R2.open', 'R2.pos5', 'R2.pos7', 'R2.pos9', 'R2.pos12']);
    for (const s of d24.skills) {
      const items = skill(s).items();
      // Each card goes to one drill: D24 the reverse cards, D23 the rest.
      expect(items.filter((i) => d24.canTest(i)).length * 2).toBe(items.length);
    }
    expect(d24.requiresMic).toBeFalsy();
    expect(d24.requiresSound).toBeFalsy();
  });
});
