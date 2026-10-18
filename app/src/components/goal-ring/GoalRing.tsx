import type { CSSProperties } from 'react';
import {
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  goalLabel,
  ringOffset,
  type GoalProgress,
} from './progress';
import './streak-tokens.css';
import styles from './GoalRing.module.css';

export interface GoalRingProps {
  progress: GoalProgress;
  /** `large` for the Today hero (minutes in the middle), `small` for the sidebar. */
  size?: 'large' | 'small';
}

/**
 * The daily-goal ring (design §3.7). The arc draws in on mount and eases to
 * new values; both are off under reduced motion. A met goal also shows a tick,
 * so the state never depends on colour alone.
 */
export function GoalRing({ progress, size = 'large' }: GoalRingProps) {
  const { fraction, met, minutes, goalMinutes } = progress;
  return (
    <svg
      className={styles.ring}
      data-size={size}
      data-met={met}
      data-progress={fraction.toFixed(2)}
      data-testid="goal-ring"
      viewBox="0 0 100 100"
      role="img"
      aria-label={goalLabel(progress)}
    >
      <circle className={styles.track} cx="50" cy="50" r={RING_RADIUS} />
      {fraction > 0 && (
        <circle
          className={styles.fill}
          cx="50"
          cy="50"
          r={RING_RADIUS}
          transform="rotate(-90 50 50)"
          strokeDasharray={RING_CIRCUMFERENCE}
          style={
            {
              strokeDashoffset: ringOffset(fraction),
              '--ring-c': RING_CIRCUMFERENCE,
            } as CSSProperties
          }
        />
      )}
      {met ? (
        <path className={styles.tick} d="M33 51 L45 63 L68 38" />
      ) : (
        size === 'large' && (
          <>
            <text className={styles.value} x="50" y="52">
              {minutes}/{goalMinutes}
            </text>
            <text className={styles.unit} x="50" y="70">
              min
            </text>
          </>
        )
      )}
    </svg>
  );
}
