import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG, type ReviewLogRecord } from '../engine';
import { FretworkDB, getSettings, saveSettings } from '../storage';
import { refitIfDue } from './refit-bridge';

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T09:00:00Z');
// A short fit: the optimiser itself is tested in engine/refit.test.ts.
const cfg = { ...ENGINE_CONFIG.refit, iterations: 2 };
const immediate = () => Promise.resolve();

let db: FretworkDB;
let n = 0;

beforeEach(() => {
  db = new FretworkDB(`refit-bridge-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

/** `count` reviews over 50 items, one round per day; every 4th review forgotten. */
function logs(count: number): ReviewLogRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    itemId: `i${i % 50}`,
    skillId: 's',
    drillType: 'd1',
    correct: i % 4 !== 0,
    responseMs: 1000,
    rating: i % 4 === 0 ? Rating.Again : Rating.Good,
    hintUsed: false,
    answerGiven: '',
    at: new Date(T0.getTime() + Math.floor(i / 50) * DAY + (i % 50) * 1000),
  }));
}

describe('refitIfDue', () => {
  it('leaves the defaults alone below the threshold', async () => {
    await db.reviewLogs.bulkAdd(logs(ENGINE_CONFIG.refit.minReviews - 1));
    expect(await refitIfDue(db, T0, { cfg, yieldTo: immediate })).toBeNull();
    expect((await getSettings(db)).fsrsParams).toBeNull();
  });

  it('refits at the threshold and persists the weights in settings', async () => {
    await saveSettings(db, { sessionMinutes: 15 });
    await db.reviewLogs.bulkAdd(logs(ENGINE_CONFIG.refit.minReviews));
    let yields = 0;
    const saved = await refitIfDue(db, T0, {
      cfg,
      yieldTo: () => {
        yields++;
        return Promise.resolve();
      },
    });
    expect(yields).toBe(cfg.iterations);
    const stored = await getSettings(db);
    expect(saved).toEqual(stored);
    expect(stored.sessionMinutes).toBe(15);
    expect(stored.fsrsParams?.w).toHaveLength(21);
    expect(stored.fsrsParams?.reviewCount).toBe(ENGINE_CONFIG.refit.minReviews);
    expect(stored.fsrsParams?.fittedAt).toEqual(T0);
    // Not due again until another batch of reviews.
    expect(await refitIfDue(db, T0, { cfg, yieldTo: immediate })).toBeNull();
  });

  it('stores nothing when too few reviews are on a later day', async () => {
    const sameDay = logs(ENGINE_CONFIG.refit.minReviews).map((l, i) => ({
      ...l,
      at: new Date(T0.getTime() + i * 1000),
    }));
    await db.reviewLogs.bulkAdd(sameDay);
    expect(await refitIfDue(db, T0, { cfg })).toBeNull();
    expect((await getSettings(db)).fsrsParams).toBeNull();
  });
});
