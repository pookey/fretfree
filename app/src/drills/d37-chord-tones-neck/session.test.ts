import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D37_ID, type D37Prompt } from './logic';

/** D37 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d37-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

async function master(ids: readonly string[]) {
  await db.skillStates.bulkPut(
    ids.map((skillId) => ({
      skillId,
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 1,
    })),
  );
}

describe('D37 in a session', () => {
  it('serves C major first and grades the round on completion time per target', async () => {
    const s = skill('C5.neck-triads');
    await master(s.prerequisites);
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      // Baseline 500ms: Easy ≤ 1.5s, Good ≤ 2.5s, Hard beyond (per answer).
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [s],
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 4,
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D37_ID);
    expect(cur.entry.itemId).toBe('chord-tones:C');
    const p = cur.prompt as D37Prompt;
    // A new skill starts at the narrow scope: one CAGED box.
    expect(p.scope).toBe('shape');
    const res = await r.answer(p.targets, 1200 * p.targets.length);
    expect(res.result.correct).toBe(true);
    // Guided first rep: capped at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log?.responseMs).toBe(1200);
    expect(log?.drillType).toBe(D37_ID);
    expect(res.sounds.expected).toEqual(['C3', 'E3', 'G3']);
  });

  it('logs E♭ in C major as a confusion with C minor', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    await db.cards.put(
      scheduler.seedKnownCard({ id: 'chord-tones:C', skillId: 'C5.neck-triads' }, clock, 1),
    );
    await master([...skill('C5.neck-triads').prerequisites, 'C5.neck-triads']);
    const due = new Date(clock.getTime() + 86_400_000 * 3);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [skill('C5.neck-triads')],
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
    });
    const cur = r.currentPrompt()!;
    expect(cur.entry).toMatchObject({ itemId: 'chord-tones:C', guided: false });
    const p = cur.prompt as D37Prompt;
    // s4f1 is E♭, inside any box at the nut and on the whole neck.
    const res = await r.answer([{ string: 4, fret: 1 }], 2000);
    expect(res.result).toMatchObject({ correct: false, confusedWith: 'triad:min' });
    expect(res.rating).toBe(Rating.Again);
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(['triad:maj', 'triad:min']);
    expect(p.activeRange.from).toBe(0);
  });
});
