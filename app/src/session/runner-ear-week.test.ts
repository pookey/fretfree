import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Settings } from '../engine';
import { DRILLS } from '../drills/registry';
import type { D1Prompt } from '../drills/d1-name-the-note/logic';
import type { D2Prompt } from '../drills/d2-find-the-note/logic';
import type { D3Prompt } from '../drills/d3-note-wheel/logic';
import type { D14Prompt } from '../drills/d14-ear-identify/logic';
import type { D15Prompt } from '../drills/d15-ear-find/logic';
import type { D20Answer, D20Prompt } from '../drills/d20-rhythm/logic';
import type { D39Prompt } from '../drills/d39-fret-landmarks/logic';
import { FretworkDB } from '../storage';
import { itemNeedsSound } from './drill-picker';
import { SessionRunner, type CurrentPrompt } from './runner';

/**
 * M4-16: a "start with sound" learner's first week through the real runner,
 * every answer right, one session a day. Day one leads with ear → fretboard
 * (M4-10); after it, ear-find keeps a lane of its own in the Ear track, so
 * its new cards keep coming beside D14's and the rhythm track's (rule 16:
 * the learner chose to start by ear). With sound off, nothing that needs
 * sound is served, so no unheard guess is graded (research/02 §3.7).
 */

// The day-one tracks: the neck basics, rhythm and ear. Later modules open
// only once these are mastered, which a week doesn't reach.
const SKILLS_WEEK = SKILLS.filter((s) => ['F1', 'F2', 'F3', 'F4', 'I6'].includes(s.topic));
const DAYS = 7;

let db: FretworkDB;
let n = 0;
let clock: Date;

beforeEach(() => {
  db = new FretworkDB(`runner-ear-week-${n++}`);
  clock = new Date('2026-10-19T09:00:00Z');
});

afterEach(async () => {
  await db.delete();
});

/** The right answer to each drill a week of these tracks serves. */
function correct(cur: CurrentPrompt): unknown {
  switch (cur.drill.id) {
    case 'name-the-note':
      return (cur.prompt as D1Prompt).expectedPc;
    case 'find-the-note':
      return (cur.prompt as D2Prompt).targets[0];
    case 'note-wheel':
      return (cur.prompt as D3Prompt).expectedPc;
    case 'fret-landmarks':
      return (cur.prompt as D39Prompt).expected;
    case 'ear-identify':
      return (cur.prompt as D14Prompt).answer;
    case 'hear-it-find-it':
      return (cur.prompt as D15Prompt).target;
    case 'tap-strum-rhythm': {
      // Every hit dead on time.
      const targetsMs = (cur.prompt as D20Prompt).pulses.map((p) => 1_000 + p * 250);
      const answer: D20Answer = {
        input: 'tap',
        targetsMs,
        onsetsMs: targetsMs,
        window: 'standard',
      };
      return answer;
    }
    default:
      throw new Error(`No answer for ${cur.drill.id}`);
  }
}

interface Day {
  /** The items introduced, in order. */
  fresh: string[];
  served: CurrentPrompt[];
}

/** One session a day, every prompt answered right, 5 s apart. */
async function week(settings: Settings): Promise<Day[]> {
  const days: Day[] = [];
  for (let d = 0; d < DAYS; d++) {
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...settings, latencyBaselineMs: 500 },
      skills: SKILLS_WEEK,
      drills: DRILLS,
      now: () => clock,
    });
    const day: Day = { fresh: [], served: [] };
    while (!r.isOver) {
      const cur = r.currentPrompt()!;
      if (cur.entry.kind === 'new' && !day.fresh.includes(cur.entry.itemId)) {
        day.fresh.push(cur.entry.itemId);
      }
      clock = new Date(clock.getTime() + 5_000);
      const res = await r.answer(correct(cur), 900);
      expect(res.result.correct, cur.entry.itemId).toBe(true);
      day.served.push(cur);
      r.next();
    }
    await r.finish();
    days.push(day);
    clock = new Date(clock.getTime() + 24 * 3_600_000);
  }
  return days;
}

const earFind = (ids: readonly string[]) => ids.filter((id) => id.startsWith('ear-find:'));

describe('a "start with sound" learner\'s first week', () => {
  it('keeps new ear-find cards coming after day one, beside the other tracks', async () => {
    const days = await week({ ...DEFAULT_SETTINGS, startWithSound: true });
    const [first, ...rest] = days;
    // Day one leads with ear → fretboard.
    expect(first!.fresh.length).toBeGreaterThan(0);
    expect(earFind(first!.fresh)).toEqual(first!.fresh);
    for (const [i, day] of rest.entries()) {
      // Every later day brings new ear-find cards, but never only those.
      expect(earFind(day.fresh).length, `day ${i + 2}`).toBeGreaterThan(0);
      expect(earFind(day.fresh).length, `day ${i + 2}`).toBeLessThan(day.fresh.length);
    }
    // The Ear track's other sets (D14) and the rhythm track still get their turns.
    const later = rest.flatMap((d) => d.fresh);
    expect(later.some((id) => id.startsWith('ear-interval:'))).toBe(true);
    expect(later.some((id) => /^(tap|strum)-rhythm:/.test(id))).toBe(true);
    // And the neck keeps moving.
    expect(later.some((id) => id.startsWith('letter:'))).toBe(true);
  });

  it('serves nothing that needs sound while sound is off', async () => {
    const days = await week({ ...DEFAULT_SETTINGS, startWithSound: true, soundOn: false });
    const served = days.flatMap((d) => d.served);
    expect(served.length).toBeGreaterThan(0);
    for (const cur of served) {
      const item = { id: cur.entry.itemId, skillId: cur.entry.skillId };
      expect(itemNeedsSound(item), item.id).toBe(false);
      expect(cur.drill.requiresSound, item.id).toBeFalsy();
    }
    // The path falls back to the neck from the first prompt.
    expect(days[0]!.served[0]!.entry.skillId).toMatch(/^F1\./);
  });
});
