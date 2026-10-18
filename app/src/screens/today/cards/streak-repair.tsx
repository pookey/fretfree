import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { STREAK_RULES } from '../../../engine/gamification/streak';
import { addDays, startOfLocalDay, toLocalDate } from '../../../engine/gamification/local-date';
import type { DailyProgressRecord, GamificationRecord } from '../../../engine/gamification/types';
import { getDailyProgress, getDb, getGamification, type FretworkDB } from '../../../storage';
import screens from '../../screens.module.css';
import styles from './streak-repair.module.css';

export const id = 'streak-repair';
// Under the hero and the install tip (which keeps its place under the hero), above quests.
export const order = 13;

const systemNow = () => new Date();

/** What the card shows while a repair window is open (design §3.7). */
export interface RepairView {
  /** The streak the break ended, which a repair adds back. */
  brokenStreak: number;
  /** Minutes today that make a double session. */
  targetMinutes: number;
  /** Whole minutes practised today. */
  minutes: number;
  /** 0…1, clamped. */
  fraction: number;
  /** The last date a double session still repairs (the deadline is the start of the next). */
  lastDay: string;
  deadline: Date;
}

/**
 * The open repair window, or `null` when there is none: no deadline, nothing
 * to restore, or a deadline already past (the engine closes that window at
 * the next settle; until then the UI treats it as closed). Reads the stored
 * state only.
 */
export function repairView(
  g: GamificationRecord,
  today: DailyProgressRecord,
  now: Date,
): RepairView | null {
  const deadline = g.streakRepairDeadline;
  if (deadline === null || g.streakBeforeBreak <= 0) return null;
  if (deadline.getTime() <= now.getTime()) return null;
  const targetMinutes = STREAK_RULES.repairGoalMultiple * g.dailyGoalMinutes;
  return {
    brokenStreak: g.streakBeforeBreak,
    targetMinutes,
    minutes: Math.max(0, Math.floor(today.minutes)),
    fraction: Math.min(1, Math.max(0, today.minutes / targetMinutes)),
    lastDay: addDays(toLocalDate(deadline), -1),
    deadline,
  };
}

/** "by the end of today" on the window's last day, otherwise e.g. "by the end of Wednesday". */
export function byWhen(lastDay: string, now: Date): string {
  if (lastDay <= toLocalDate(now)) return 'by the end of today';
  const weekday = startOfLocalDay(lastDay).toLocaleDateString(undefined, { weekday: 'long' });
  return `by the end of ${weekday}`;
}

interface Loaded {
  g: GamificationRecord;
  day: DailyProgressRecord;
}

/**
 * The stored gamification state and today's progress, kept live, plus a
 * re-render at the deadline and whenever the app returns to the foreground,
 * so the card leaves on time without a reload.
 */
function useRepairView(db: FretworkDB, now: () => Date): RepairView | null {
  const [today, setToday] = useState(() => toLocalDate(now()));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setToday(toLocalDate(now()));
      setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [now]);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [g, day] = await Promise.all([getGamification(db), getDailyProgress(db, today)]);
      return { g, day };
    }).subscribe({
      next: setLoaded,
      error: () => setLoaded(null),
    });
    return () => sub.unsubscribe();
  }, [db, today]);

  const view = loaded ? repairView(loaded.g, loaded.day, now()) : null;
  const deadline = view?.deadline.getTime();

  useEffect(() => {
    if (deadline === undefined) return;
    const timer = setTimeout(() => setTick((t) => t + 1), deadline - now().getTime());
    return () => clearTimeout(timer);
  }, [deadline, now]);

  return view;
}

export interface StreakRepairProps {
  db?: FretworkDB;
  now?: () => Date;
}

/**
 * Streak repair (design §3.7): after a break, a double session within the
 * next two days restores the streak. This card makes that visible while the
 * window is open, with today's progress toward the doubled goal. Forgiving
 * and loss-free: it offers the way back and never scolds.
 */
export function Card({ db = getDb(), now = systemNow }: StreakRepairProps) {
  const view = useRepairView(db, now);
  if (!view) return null;
  const done = view.minutes >= view.targetMinutes;
  const days = `${view.brokenStreak}-day`;

  return (
    <section
      className={styles.card}
      aria-labelledby="streak-repair-heading"
      data-testid="streak-repair"
    >
      <span className={styles.icon} aria-hidden>
        ❤️‍🩹
      </span>
      <div className={styles.body}>
        <h2 id="streak-repair-heading" className={screens.sectionTitle}>
          Bring back your {days} streak
        </h2>
        <p data-testid="streak-repair-copy">
          Your {days} streak broke. Practise {STREAK_RULES.repairGoalMultiple}× your goal (
          {view.targetMinutes} min in one day) {byWhen(view.lastDay, now())} to restore it.
        </p>
        <div className={styles.meter}>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Double session today"
            aria-valuemin={0}
            aria-valuemax={view.targetMinutes}
            aria-valuenow={Math.min(view.minutes, view.targetMinutes)}
            aria-valuetext={`${view.minutes} of ${view.targetMinutes} minutes`}
          >
            <div className={styles.fill} style={{ width: `${view.fraction * 100}%` }} />
          </div>
          <span className={styles.count} data-testid="streak-repair-progress">
            {view.minutes} / {view.targetMinutes} min today
          </span>
        </div>
        <p className={styles.note}>
          {done
            ? 'Double session done. Your streak comes back as soon as this session is saved.'
            : 'Every minute you practise today counts, across as many sessions as you like.'}
        </p>
      </div>
    </section>
  );
}
