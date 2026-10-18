import { Link } from 'react-router';
import { useAppStore } from '../../../app-store';
import { GoalRing, freezesLabel, useStreakSummary } from '../../../components/goal-ring';
import screens from '../../screens.module.css';
import styles from './hero.module.css';

export const id = 'hero';
export const order = 10;

/** Goal copy that never nudges past the goal: spacing beats cramming (design §3.7). */
function goalCopy(minutes: number, goalMinutes: number, met: boolean): string {
  if (met) return 'Daily goal met. Come back tomorrow to keep it.';
  return `${goalMinutes - minutes} min to go for today's ${goalMinutes}-minute goal`;
}

/**
 * The Today hero (design §7 Today, §3.7): the streak flame and counter, the
 * daily-goal ring, freezes held and the one big start button.
 */
export function Card() {
  const minutes = useAppStore((s) => s.settings.sessionMinutes);
  const summary = useStreakSummary();

  return (
    <section className={`${screens.hero} ${styles.hero}`} aria-label="Streak and daily goal">
      {summary ? (
        <GoalRing progress={summary.goal} size="large" />
      ) : (
        <div className={styles.ringPlaceholder} aria-hidden />
      )}
      <div className={styles.streakBlock}>
        <p className={styles.streak} data-testid="streak">
          <span className={styles.flame} aria-hidden>
            🔥
          </span>
          <strong data-testid="streak-count">{summary?.streak ?? 0}</strong>
          <span>day streak</span>
        </p>
        {summary && (
          <>
            <p className={styles.goal} data-testid="goal-copy">
              {goalCopy(summary.goal.minutes, summary.goal.goalMinutes, summary.goal.met)}
            </p>
            <p className={styles.freezes} data-testid="freezes">
              {summary.freezesHeld > 0 && (
                <span aria-hidden>{'❄️'.repeat(summary.freezesHeld)}</span>
              )}
              <span>{freezesLabel(summary.freezesHeld)}</span>
            </p>
          </>
        )}
      </div>
      <Link to="/session" className={screens.startButton} data-testid="start-session">
        Start session ({minutes} min)
      </Link>
    </section>
  );
}
