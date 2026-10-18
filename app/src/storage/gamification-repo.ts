import type {
  GamificationEvent,
  GamificationEventType,
  LoggedGamificationEvent,
} from '../engine/gamification/types';
import type { LocalDate } from '../engine/gamification/local-date';
import type { FretworkDB } from './db';
import type { DailyProgressRecord, GamificationRecord } from './gamification-model';
import { getGamification } from './repository';

/**
 * Persistence for design §3.7: the `gamification` singleton, `dailyProgress`
 * per local date, unlocked `achievements` and the `gamificationEvents` log.
 * Every event goes through `logEvent`, so streaks can later be checked
 * against retention (research/02 rule 17).
 */

export function emptyDailyProgress(date: LocalDate): DailyProgressRecord {
  return { date, xp: 0, minutes: 0, goalMet: false, freezeUsed: false, questsCompleted: [] };
}

export async function saveGamification(
  db: FretworkDB,
  patch: Partial<GamificationRecord>,
): Promise<GamificationRecord> {
  return db.transaction('rw', db.gamification, async () => {
    const next = { ...(await getGamification(db)), ...patch };
    await db.gamification.put({ ...next, key: 'singleton' });
    return next;
  });
}

/** That date's progress, or an empty record if nothing was practised. */
export async function getDailyProgress(
  db: FretworkDB,
  date: LocalDate,
): Promise<DailyProgressRecord> {
  return (await db.dailyProgress.get(date)) ?? emptyDailyProgress(date);
}

export async function saveDailyProgress(db: FretworkDB, day: DailyProgressRecord): Promise<void> {
  await db.dailyProgress.put(day);
}

/** Stored days in `[from, to]` inclusive, oldest first. Days with no row are omitted. */
export async function dailyProgressBetween(
  db: FretworkDB,
  from: LocalDate,
  to: LocalDate,
): Promise<DailyProgressRecord[]> {
  return db.dailyProgress.where('date').between(from, to, true, true).toArray();
}

// --- Events --------------------------------------------------------------

/** Append one event to the local log. Returns its row id. */
export async function logEvent(
  db: FretworkDB,
  event: GamificationEvent,
  at: Date,
): Promise<number> {
  const { type, ...data } = event;
  return (await db.gamificationEvents.add({ type, at, data })) as number;
}

export interface EventQuery {
  type?: GamificationEventType;
  /** Inclusive lower bound. */
  since?: Date;
}

/** Logged events, oldest first. */
export async function getEvents(
  db: FretworkDB,
  query: EventQuery = {},
): Promise<LoggedGamificationEvent[]> {
  const rows = query.type
    ? await db.gamificationEvents.where('type').equals(query.type).sortBy('at')
    : await db.gamificationEvents.orderBy('at').toArray();
  const since = query.since;
  return rows
    .filter((r) => !since || r.at >= since)
    .map((r) => ({ ...r.data, type: r.type, id: r.id!, at: r.at }) as LoggedGamificationEvent);
}

// --- Achievements --------------------------------------------------------

/** Unlocked achievement ids and when they were unlocked. */
export async function getUnlockedAchievements(db: FretworkDB): Promise<Map<string, Date>> {
  const rows = await db.achievements.toArray();
  return new Map(rows.map((r) => [r.id, r.unlockedAt]));
}

/**
 * Persist newly unlocked achievements and log an `achievement-unlocked` event
 * for each. Ids already unlocked are skipped, so this is idempotent. Returns
 * the ids that were actually new.
 */
export async function unlockAchievements(
  db: FretworkDB,
  ids: readonly string[],
  at: Date,
): Promise<string[]> {
  return db.transaction('rw', [db.achievements, db.gamificationEvents], async () => {
    const fresh: string[] = [];
    for (const id of new Set(ids)) {
      if (await db.achievements.get(id)) continue;
      await db.achievements.put({ id, unlockedAt: at });
      await logEvent(db, { type: 'achievement-unlocked', achievementId: id }, at);
      fresh.push(id);
    }
    return fresh;
  });
}

// --- Atomic commit -------------------------------------------------------

export interface GamificationWrite {
  /** The full new state, e.g. from `applyDay`. */
  state?: GamificationRecord;
  /** Daily progress rows to store, e.g. today's and any frozen days. */
  days?: readonly DailyProgressRecord[];
  events: readonly GamificationEvent[];
  at: Date;
}

/**
 * Persist the output of the pure gamification functions in one transaction:
 * state, daily progress and every event (each via `logEvent`).
 */
export async function commitGamification(db: FretworkDB, write: GamificationWrite): Promise<void> {
  await db.transaction(
    'rw',
    [db.gamification, db.dailyProgress, db.gamificationEvents],
    async () => {
      if (write.state) await db.gamification.put({ ...write.state, key: 'singleton' });
      if (write.days?.length) await db.dailyProgress.bulkPut([...write.days]);
      for (const event of write.events) await logEvent(db, event, write.at);
    },
  );
}
