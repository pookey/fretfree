import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, parseNoteItemId } from '../../engine';
import { FretworkDB, allCards } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D2_ID, type D2Prompt } from './logic';

/** D2 through the real session runner (plan → prompt → grade → FSRS → persist). */

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d2-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

/** Every note@ item already known and not due, so the session serves find items. */
async function seedNoteCards() {
  const scheduler = createScheduler({ enableFuzz: false });
  const notes = SKILLS.flatMap((s) => s.items()).filter((i) => parseNoteItemId(i.id));
  await db.cards.bulkPut(notes.map((i) => scheduler.seedKnownCard(i, clock, 30)));
}

async function start() {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: SKILLS,
    drills: DRILLS,
    now: () => clock,
    maxItems: 12,
  });
}

describe('D2 in a session', () => {
  it('serves find items, grades taps and logs them', async () => {
    await seedNoteCards();
    const r = await start();
    const first = r.currentPrompt()!;
    expect(first.drill.id).toBe(D2_ID);
    expect(first.entry.itemId).toBe('find:C@s6');
    expect(first.entry.guided).toBe(true);
    expect((first.prompt as D2Prompt).scope).toBe('string');

    const target = (first.prompt as D2Prompt).targets[0]!;
    const res = await r.answer(target, 400);
    expect(res.result.correct).toBe(true);
    expect(res.rating).toBe(Rating.Hard);
    expect(res.sounds.expected).toEqual(['C3']);
    r.next();

    // A wrong tap is Again, plays both notes and logs the confusion.
    const cur = r.currentPrompt()!.prompt as D2Prompt;
    const wrong = { string: cur.string, fret: (cur.targets[0]!.fret + 1) % 12 };
    const miss = await r.answer(wrong, 800);
    expect(miss.result.correct).toBe(false);
    expect(miss.sounds.given).toHaveLength(1);
    expect(await db.confusions.count()).toBe(1);
    r.next();

    while (!r.isOver) {
      const p = r.currentPrompt()!.prompt as D2Prompt;
      await r.answer(p.targets[0]!, 600);
      r.next();
    }
    await r.finish();
    const log = await db.reviewLogs.toArray();
    expect(log.every((l) => l.drillType === D2_ID)).toBe(true);
    expect(log[0]?.answerGiven).toBe('s6f8');
    expect((await allCards(db)).some((c) => c.itemId === 'find:C@s6')).toBe(true);
  });
});
