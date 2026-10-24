import { Rating } from 'ts-fsrs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { STAFF_INTERVAL_ID, siLabel, type SIPrompt } from './logic';

/** The staff-interval drill through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-24T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`si-session-${n++}`);
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

describe('the staff-interval drill in a session', () => {
  it('serves R5 cards, worked example first, and logs a size confusion', async () => {
    const r = await start([{ ...skill('R5.steps-skips'), prerequisites: [] }]);
    const first = r.currentPrompt()!;
    expect(first.drill.id).toBe(STAFF_INTERVAL_ID);
    expect(first.entry).toMatchObject({
      itemId: 'staff-interval:+2@treble8vb',
      kind: 'new',
      guided: true,
    });
    const p = first.prompt as SIPrompt;
    expect(p).toMatchObject({ direction: 'read', size: 2, up: true });
    const res = await r.answer('2nd', 900);
    expect(res.result).toMatchObject({ correct: true, concept: 'staff-interval:2' });
    expect(res.sounds.expected).toEqual([p.fromNote, p.toNote]);
    r.next();

    // Reading a 3rd as one size up is logged against it.
    const next = r.currentPrompt()!.prompt as SIPrompt;
    const wrong =
      next.direction === 'read'
        ? siLabel(next.size + 1)
        : next.from + (next.up ? 1 : -1) * next.size;
    const miss = await r.answer(wrong, 1500);
    expect(miss.result).toMatchObject({
      correct: false,
      confusedWith: `staff-interval:${next.size + 1}`,
    });
    expect(await db.confusions.count()).toBe(1);

    const log = await db.reviewLogs.toArray();
    expect(
      log.every((l) => l.drillType === STAFF_INTERVAL_ID && l.skillId === 'R5.steps-skips'),
    ).toBe(true);
    // Graded (and logged) against the 1.5 s target: 900 ms counts as 1400 ms.
    expect(log[0]).toMatchObject({ correct: true, responseMs: 1400, answerGiven: '2nd' });
  });

  it('grades a reading card Hard past baseline + 1.5 s, where other drills allow 2 s', async () => {
    const r = await start([{ ...skill('R5.steps-skips'), prerequisites: [] }], 12);
    // Answer quickly until a reading card comes that isn't a worked example
    // (a worked example caps the rating at Hard by itself).
    let cur = r.currentPrompt()!;
    for (let i = 0; i < 30 && (cur.entry.guided || cur.entry.itemId.endsWith(':place')); i++) {
      const p = cur.prompt as SIPrompt;
      await r.answer(p.direction === 'read' ? siLabel(p.size) : p.to, 600);
      r.next();
      cur = r.currentPrompt()!;
    }
    expect(cur.entry.guided).toBe(false);
    const prompt = cur.prompt as SIPrompt;
    expect(prompt.direction).toBe('read');
    const res = await r.answer(siLabel(prompt.size), 2200);
    // 2200 ms is inside 500 + 2000 but past 500 + 1500.
    expect(res.rating).toBe(Rating.Hard);
  });

  it('is the drill for every R5 skill', () => {
    const drill = DRILLS.find((d) => d.id === STAFF_INTERVAL_ID)!;
    expect(drill.skills).toEqual(['R5.steps-skips', 'R5.fourths-fifths', 'R5.wide']);
    for (const s of drill.skills) {
      for (const item of skill(s).items()) expect(drill.canTest(item), item.id).toBe(true);
    }
    expect(drill.requiresMic).toBeFalsy();
    expect(drill.requiresSound).toBeFalsy();
  });
});
