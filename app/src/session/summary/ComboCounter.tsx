import { ENGINE_CONFIG } from '../../engine';
import styles from './ComboCounter.module.css';

export interface ComboCounterProps {
  combo: number;
  showAt?: number;
}

/**
 * Consecutive correct answers (design §3.7 session celebrations). It appears
 * from a short run and quietly disappears after a miss: no penalty copy.
 */
export function ComboCounter({
  combo,
  showAt = ENGINE_CONFIG.gamification.celebrations.comboShowAt,
}: ComboCounterProps) {
  const visible = combo >= showAt;
  return (
    <div className={styles.slot} role="status" aria-live="polite">
      {visible && (
        // Keyed by the count so each step replays the pop (none under reduced motion).
        <span key={combo} className={styles.combo} data-testid="combo">
          <span className={styles.count}>{combo}</span> in a row
        </span>
      )}
    </div>
  );
}
