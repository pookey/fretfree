import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../app-store';
import { createScheduler } from '../../../engine';
import type { ReplayDeps } from '../../../engine/history';
import type { CardRecord, ReviewLogRecord } from '../../../engine/model';
import { isPlacementLog } from '../../../placement/save';
import { allCards, getDb, getGamification, type DailyProgressRecord } from '../../../storage';

export interface HistoryData {
  cards: CardRecord[];
  logs: ReviewLogRecord[];
  days: DailyProgressRecord[];
  dailyGoalMinutes: number;
  now: Date;
}

async function loadHistoryData(): Promise<HistoryData> {
  const db = getDb();
  const [cards, logs, days, gamification] = await Promise.all([
    allCards(db),
    db.reviewLogs.toArray(),
    db.dailyProgress.toArray(),
    getGamification(db),
  ]);
  return { cards, logs, days, dailyGoalMinutes: gamification.dailyGoalMinutes, now: new Date() };
}

/** Everything the over-time panels read, kept live; null until the first load. */
export function useHistoryData(revision: number): HistoryData | null {
  const [data, setData] = useState<HistoryData | null>(null);
  useEffect(() => {
    const sub = liveQuery(loadHistoryData).subscribe({
      next: setData,
      error: (e: unknown) => console.error('Loading progress history failed', e),
    });
    return () => sub.unsubscribe();
  }, [revision]);
  return data;
}

/** The replay's scheduler: the learner's FSRS weights, no fuzz (it moves due dates only). */
export function useReplayDeps(): ReplayDeps {
  const weights = useAppStore((s) => s.settings.fsrsParams?.w);
  return useMemo(
    () => ({
      scheduler: createScheduler({ weights, enableFuzz: false }),
      isPlacement: isPlacementLog,
    }),
    [weights],
  );
}
