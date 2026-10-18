import { State } from 'ts-fsrs';
import {
  DEFAULT_SETTINGS,
  type CardRecord,
  type ConfusionRecord,
  type ReviewLogRecord,
  type SessionLogRecord,
  type Settings,
  type SkillStateRecord,
} from '../engine/model';
import type { FretworkDB } from './db';
import { DEFAULT_GAMIFICATION, type GamificationRecord } from './gamification-model';

export async function getSettings(db: FretworkDB): Promise<Settings> {
  const row = await db.settings.get('singleton');
  if (!row) return { ...DEFAULT_SETTINGS };
  const { key: _key, ...rest } = row;
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(db: FretworkDB, patch: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await getSettings(db)), ...patch };
    await db.settings.put({ ...next, key: 'singleton' });
    return next;
  });
}

export async function getGamification(db: FretworkDB): Promise<GamificationRecord> {
  const row = await db.gamification.get('singleton');
  if (!row) return { ...DEFAULT_GAMIFICATION };
  const { key: _key, ...rest } = row;
  return { ...DEFAULT_GAMIFICATION, ...rest };
}

export async function allCards(db: FretworkDB): Promise<CardRecord[]> {
  return db.cards.toArray();
}

/** Cards whose next review is due by `now` (new, never-reviewed cards excluded). */
export async function dueCards(db: FretworkDB, now: Date): Promise<CardRecord[]> {
  const cards = await db.cards.where('fsrs.due').belowOrEqual(now).toArray();
  return cards.filter((c) => c.fsrs.state !== State.New);
}

export async function countDue(db: FretworkDB, now: Date): Promise<number> {
  return (await dueCards(db, now)).length;
}

export interface AnswerWrite {
  card: CardRecord;
  log: Omit<ReviewLogRecord, 'id'>;
  /** Pitch classes / concepts the learner mixed up, if the answer was wrong. */
  confusion?: { expected: string; given: string };
}

/** Persist one graded answer atomically: the updated card, the review log and any confusion. */
export async function recordAnswer(db: FretworkDB, write: AnswerWrite): Promise<void> {
  await db.transaction('rw', [db.cards, db.reviewLogs, db.confusions], async () => {
    await db.cards.put(write.card);
    await db.reviewLogs.add(write.log);
    if (write.confusion && write.confusion.expected !== write.confusion.given) {
      const [a, b] = [write.confusion.expected, write.confusion.given].sort() as [string, string];
      const existing = await db.confusions.get([a, b]);
      await db.confusions.put({ a, b, count: (existing?.count ?? 0) + 1 });
    }
  });
}

export async function allConfusions(db: FretworkDB): Promise<ConfusionRecord[]> {
  return db.confusions.toArray();
}

export async function getSkillStates(db: FretworkDB): Promise<Map<string, SkillStateRecord>> {
  const rows = await db.skillStates.toArray();
  return new Map(rows.map((r) => [r.skillId, r]));
}

export async function putSkillState(db: FretworkDB, state: SkillStateRecord): Promise<void> {
  await db.skillStates.put(state);
}

export async function recentReviews(
  db: FretworkDB,
  skillId: string,
  limit: number,
): Promise<ReviewLogRecord[]> {
  const logs = await db.reviewLogs.where('skillId').equals(skillId).sortBy('at');
  return logs.slice(-limit);
}

export async function startSessionLog(db: FretworkDB, startedAt: Date): Promise<number> {
  return (await db.sessionLogs.add({
    startedAt,
    endedAt: null,
    itemsSeen: 0,
    accuracy: 0,
  })) as number;
}

export async function finishSessionLog(
  db: FretworkDB,
  id: number,
  patch: Pick<SessionLogRecord, 'endedAt' | 'itemsSeen' | 'accuracy'>,
): Promise<void> {
  await db.sessionLogs.update(id, patch);
}

export async function reviewCount(db: FretworkDB): Promise<number> {
  return db.reviewLogs.count();
}
