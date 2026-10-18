import {
  GoalRing,
  freezesLabel,
  goalLabel,
  streakLabel,
  useStreakSummary,
} from '../components/goal-ring';
import styles from './StreakBadge.module.css';

/**
 * The streak and daily-goal ring the iPad sidebar always shows (design §7
 * Today). `icon` is the collapsed sidebar: flame, count and a small ring,
 * stacked. The phone tab bar has no badge.
 */
export function StreakBadge({ variant }: { variant: 'full' | 'icon' }) {
  const summary = useStreakSummary();
  if (!summary) return null;
  const { streak, freezesHeld, goal } = summary;
  const name = [streakLabel(streak), goalLabel(goal), freezesLabel(freezesHeld)].join('. ');
  return (
    <div
      className={styles.badge}
      data-variant={variant}
      data-testid="sidebar-streak"
      role="group"
      aria-label={name}
    >
      <GoalRing progress={goal} size="small" />
      <div className={styles.streak} aria-hidden>
        <span className={styles.flame}>🔥</span>
        <strong data-testid="sidebar-streak-count">{streak}</strong>
      </div>
      {variant === 'full' && (
        <div className={styles.detail} aria-hidden>
          <span>{goal.met ? 'Goal met' : `${goal.minutes}/${goal.goalMinutes} min today`}</span>
          {freezesHeld > 0 && <span>❄️ {freezesHeld}</span>}
        </div>
      )}
    </div>
  );
}
