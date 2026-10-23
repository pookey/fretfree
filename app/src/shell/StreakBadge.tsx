import {
  GoalRing,
  freezesLabel,
  goalLabel,
  streakLabel,
  useStreakSummary,
} from '../components/goal-ring';
import { formatXp, formatXpCompact, useXp, xpEarnedText } from '../components/xp';
import styles from './StreakBadge.module.css';

/**
 * The streak, daily-goal ring and XP earned the iPad sidebar always shows
 * (design §7 Today, §3.8). `icon` is the collapsed sidebar: flame, count, a
 * small ring and a compact XP total, stacked. The phone tab bar has no badge.
 */
export function StreakBadge({ variant }: { variant: 'full' | 'icon' }) {
  const summary = useStreakSummary();
  const xp = useXp();
  if (!summary) return null;
  const { streak, freezesHeld, goal } = summary;
  const name = [
    streakLabel(streak),
    goalLabel(goal),
    freezesLabel(freezesHeld),
    xp && xpEarnedText(xp.earned),
  ]
    .filter(Boolean)
    .join('. ');
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
      {xp && (
        <div className={styles.xp} aria-hidden data-testid="sidebar-xp">
          <strong>{variant === 'full' ? formatXp(xp.earned) : formatXpCompact(xp.earned)}</strong>{' '}
          {variant === 'full' ? 'XP earned' : 'XP'}
        </div>
      )}
    </div>
  );
}
