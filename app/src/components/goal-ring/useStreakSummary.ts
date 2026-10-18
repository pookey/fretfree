import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { toLocalDate } from '../../engine/gamification/local-date';
import { getDb, type FretworkDB } from '../../storage';
import { loadStreakSummary, type StreakSummary } from './streak-summary';

/** Today's local date, re-read when the app comes back to the foreground (e.g. the next morning). */
function useToday(): string {
  const [today, setToday] = useState(() => toLocalDate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toLocalDate(new Date()));
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}

/**
 * The streak, freezes and today's goal progress, kept live: a session that
 * writes `gamification` or `dailyProgress` updates the hero and the sidebar
 * without a reload. `null` until the first read.
 */
export function useStreakSummary(db: FretworkDB = getDb()): StreakSummary | null {
  const today = useToday();
  const [summary, setSummary] = useState<StreakSummary | null>(null);
  useEffect(() => {
    const sub = liveQuery(() => loadStreakSummary(db, today)).subscribe({
      next: setSummary,
      error: () => setSummary(null),
    });
    return () => sub.unsubscribe();
  }, [db, today]);
  return summary;
}
