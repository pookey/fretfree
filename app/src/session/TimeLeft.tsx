import { useEffect, useReducer } from 'react';
import styles from './TimeLeft.module.css';

/** "8 min left", rounding up so the budget reads in whole minutes (design §3.3). */
export function timeLeftLabel(ms: number): string {
  if (ms <= 0) return 'Last one';
  if (ms < 60_000) return 'Under 1 min';
  return `${Math.ceil(ms / 60_000)} min left`;
}

export interface TimeLeftProps {
  /** When the session's time budget runs out. */
  endsAt: Date;
  now?: () => number;
}

/** The time left in the session's budget, in the session header. */
export function TimeLeft({ endsAt, now = Date.now }: TimeLeftProps) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const ms = endsAt.getTime() - now();
  return (
    <span
      className={styles.timeLeft}
      role="timer"
      aria-label="Time left in session"
      data-testid="time-left"
      data-over={ms <= 0 ? 'true' : undefined}
    >
      {timeLeftLabel(ms)}
    </span>
  );
}
