import { percent, type ModuleState } from './map-model';
import styles from './Learn.module.css';

const R = 18;
const C = 2 * Math.PI * R;

/**
 * A mastery ring (design §3.7 mastery map, §7 Learn). The state is carried by
 * shape as well as colour: a tick when mastered, a padlock when locked, a
 * dashed track when the module isn't built yet, the stable share otherwise.
 */
export function MasteryRing({
  fraction,
  state,
  label,
  size = 'medium',
}: {
  fraction: number;
  state: ModuleState;
  /** What the ring measures, for the spoken label ("Neck basics"). */
  label: string;
  size?: 'medium' | 'large';
}) {
  const pct = percent(fraction);
  // "Stable", not "mastered": mastery also needs answers within the speed
  // target (design §3.4), so a full ring alone doesn't claim it.
  const spoken =
    state === 'soon'
      ? `${label}: coming soon`
      : state === 'mastered'
        ? `${label}: mastered`
        : `${label}: ${pct}% stable${state === 'locked' ? ', locked' : ''}`;
  return (
    <svg
      className={styles.ring}
      viewBox="0 0 44 44"
      role="img"
      aria-label={spoken}
      data-size={size}
      data-state={state}
      data-mastery={pct}
      data-testid="mastery-ring"
    >
      <circle className={styles.ringTrack} cx="22" cy="22" r={R} />
      {pct > 0 && (
        <circle
          className={styles.ringFill}
          cx="22"
          cy="22"
          r={R}
          transform="rotate(-90 22 22)"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
        />
      )}
      {state === 'mastered' && <path className={styles.ringGlyph} d="M15 22.5 L20 27.5 L29.5 17" />}
      {state === 'locked' && (
        <g className={styles.ringGlyph}>
          <rect x="16" y="21" width="12" height="9" rx="1.5" />
          <path d="M18.5 21 V18.5 a3.5 3.5 0 0 1 7 0 V21" />
        </g>
      )}
      {state === 'open' && (
        <text className={styles.ringText} x="22" y="22">
          {pct}%
        </text>
      )}
    </svg>
  );
}
