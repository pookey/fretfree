import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB, allCards } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D4_ID, type D4EveryPrompt, type D4SinglePrompt } from './logic';

/** D4 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d4-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

/** Master the skills' prerequisites so they are on the frontier. */
async function unlock(skills: readonly Skill[]) {
  const prereqs = skills.flatMap((s) => s.prerequisites);
  await db.skillStates.bulkPut(
    prereqs.map((skillId) => ({
      skillId,
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 1,
    })),
  );
}

async function start(skills: readonly Skill[], maxItems = 6) {
  await unlock(skills);
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    // Baseline 500ms: Easy ≤ 1.5s, Good ≤ 2.5s, Hard beyond (per answer).
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills,
    drills: DRILLS,
    now: () => clock,
    rng: () => 0,
    maxItems,
  });
}

describe('D4 in a session', () => {
  it('grades a whole-neck round on completion time per target', async () => {
    const r = await start([skill('C1.every-octave')]);
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D4_ID);
    expect(cur.entry.itemId).toBe('octaves:C');
    const p = cur.prompt as D4EveryPrompt;
    expect(p.mode).toBe('every');
    expect(p.targets.length).toBeGreaterThan(4);

    // 1.2s per target over the whole neck grades Easy, not Hard; guided caps it at Hard.
    const res = await r.answer(p.targets, 1200 * p.targets.length);
    expect(res.result.correct).toBe(true);
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log?.responseMs).toBe(1200);
    expect(log?.answerGiven.split(' ')).toHaveLength(p.targets.length);
    expect(res.sounds.expected).toEqual(['C3', 'C4', 'C5']);
  });

  it('rates an unguided round Easy when each target is quick', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    await db.cards.put(
      scheduler.seedKnownCard({ id: 'octaves:G', skillId: 'C1.every-octave' }, clock, 1),
    );
    const due = new Date(clock.getTime() + 86_400_000 * 3);
    await unlock([skill('C1.every-octave')]);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [skill('C1.every-octave')],
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
      maxItems: 1,
    });
    const cur = r.currentPrompt()!;
    expect(cur.entry).toMatchObject({ itemId: 'octaves:G', guided: false });
    const p = cur.prompt as D4EveryPrompt;
    const res = await r.answer(p.targets, 1200 * p.targets.length);
    expect(res.rating).toBe(Rating.Easy);
  });

  it('logs the unshifted fret on a G–B item as a shape confusion', async () => {
    const r = await start([skill('C1.octaves-gb-shift')]);
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D4_ID);
    const p = cur.prompt as D4SinglePrompt;
    expect(p.gbShift).toBe(true);
    const res = await r.answer([{ string: p.string, fret: p.otherFret }], 900);
    expect(res.result.correct).toBe(false);
    expect(res.rating).toBe(Rating.Again);
    expect(await db.confusions.toArray()).toEqual([
      expect.objectContaining({ count: 1, a: expect.any(String), b: expect.any(String) }),
    ]);
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual([p.otherShape, p.shape].sort());
    r.next();

    // Single items are timed as given.
    const next = r.currentPrompt()!.prompt as D4SinglePrompt;
    await r.answer(next.targets, 900);
    const logs = await db.reviewLogs.toArray();
    expect(logs.map((l) => l.responseMs)).toEqual([900, 900]);
    expect((await allCards(db)).length).toBe(2);
  });
});
