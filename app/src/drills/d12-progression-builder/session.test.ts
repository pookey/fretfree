import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D12_ID, type D12Prompt } from './logic';

/** D12 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-19T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d12-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

async function master(skillIds: readonly string[], guideLevel: 0 | 1 = 0) {
  await db.skillStates.bulkPut(
    skillIds.map((skillId) => ({
      skillId,
      status: 'mastered' as const,
      guideLevel,
      rollingAccuracy: 1,
    })),
  );
}

describe('D12 in a session', () => {
  it('serves C9 guided first, graded per slot', async () => {
    await master(skill('C9.pop').prerequisites);
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 4,
      focus: { skillIds: ['C9.pop'], itemIds: [] },
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D12_ID);
    expect(cur.entry).toMatchObject({ itemId: 'prog:I-IV-V:build', guided: true });
    const p = cur.prompt as D12Prompt;
    expect(p.expected).toEqual(['C', 'F', 'G']);
    const res = await r.answer({ chords: p.expected }, 3 * 1000);
    expect(res.result).toEqual({ correct: true, expected: 'C F G', concept: 'prog:I-IV-V' });
    // A guided rep caps the rating at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({ drillType: D12_ID, responseMs: 1000, answerGiven: 'C F G' });
    expect(res.sounds.expected).toEqual(['C3', 'F3', 'G3']);
  });

  it('logs building vi–IV–I–V for I–V–vi–IV as that confusion, and pairs them', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    // Four due cards. By retrievability vi–IV–I–V comes last; the seed pair
    // pulls it in next to I–V–vi–IV (rule 6).
    const ids = ['I-V-vi-IV', 'I-IV-V', 'I-vi-IV-V', 'vi-IV-I-V'].map((p) => `prog:${p}:build`);
    await db.cards.bulkPut(
      ids.map((id, i) => scheduler.seedKnownCard({ id, skillId: 'C9.pop' }, clock, 1 + i * 0.01)),
    );
    await master(['C9.pop', ...skill('C9.pop').prerequisites], 1);
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [skill('C9.pop')],
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
      reviewOnly: true,
    });
    const order: string[] = [];
    let cur = r.currentPrompt();
    let confused = false;
    while (cur) {
      order.push(cur.entry.itemId);
      const p = cur.prompt as D12Prompt;
      if (p.progressionId === 'I-V-vi-IV' && !confused) {
        // The same chords, started from the vi.
        const chords = [...p.expected.slice(2), ...p.expected.slice(0, 2)];
        const res = await r.answer({ chords }, 4 * 900);
        expect(res.result.confusedWith).toBe('prog:vi-IV-I-V');
        confused = true;
      } else {
        await r.answer({ chords: p.expected }, 900 * p.expected.length);
      }
      r.next();
      cur = r.currentPrompt();
    }
    expect(Math.abs(order.indexOf(ids[0]!) - order.indexOf(ids[3]!))).toBe(1);
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(['prog:I-V-vi-IV', 'prog:vi-IV-I-V']);
  });
});
