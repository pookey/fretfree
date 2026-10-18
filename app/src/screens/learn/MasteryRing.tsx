import { percent, type ModuleState } from './map-model';
import styles from './Learn.module.css';

const R = 18;
const C = 2 * Math.PI * R;

function Arc({ className, pct }: { className: string | undefined; pct: number }) {
  return (
    <circle
      className={className}
      cx="22"
      cy="22"
      r={R}
      transform="rotate(-90 22 22)"
      strokeDasharray={C}
      strokeDashoffset={C * (1 - pct / 100)}
    />
  );
}

/**
 * A mastery ring (design §3.7 mastery map, §7 Learn) in two layers: a thin,
 * light *learning* arc (latest answer correct) under the thick, solid
 * *stable* arc, so a first session lights the ring before anything is
 * retained (research/02 rule 15). The state is carried by shape as well as
 * colour: a tick when mastered, a padlock when locked, a dashed track when
 * the module isn't built yet. Otherwise the middle shows a captioned share:
 * learning until anything is stable, then stable. It is never shown bare, so
 * a glance doesn't read learning as done (research/02, illusion of competence).
 */
export function MasteryRing({
  learning,
  stable,
  state,
  label,
  size = 'medium',
}: {
  /** 0–1: items learning (stable ones included). */
  learning: number;
  /** 0–1: items stable. */
  stable: number;
  state: ModuleState;
  /** What the ring measures, for the spoken label ("Neck basics"). */
  label: string;
  size?: 'medium' | 'large';
}) {
  const stablePct = percent(stable);
  const learningPct = Math.max(percent(learning), stablePct);
  // "Learning · Stable", never "learned" or "mastered": one good session isn't
  // retention, and mastery also needs answers within the speed target (§3.4).
  const spoken =
    state === 'soon'
      ? `${label}: coming soon`
      : state === 'mastered'
        ? `${label}: mastered`
        : `${label}: ${learningPct}% learning, ${stablePct}% stable${state === 'locked' ? ', locked' : ''}`;
  const centre = stablePct > 0 ? 'stable' : 'learning';
  return (
    <svg
      className={styles.ring}
      viewBox="0 0 44 44"
      role="img"
      aria-label={spoken}
      data-size={size}
      data-state={state}
      data-learning={learningPct}
      data-mastery={stablePct}
      data-centre={state === 'open' ? centre : undefined}
      data-testid="mastery-ring"
    >
      <circle className={styles.ringTrack} cx="22" cy="22" r={R} />
      {learningPct > stablePct && <Arc className={styles.ringLearning} pct={learningPct} />}
      {stablePct > 0 && <Arc className={styles.ringFill} pct={stablePct} />}
      {state === 'mastered' && <path className={styles.ringGlyph} d="M15 22.5 L20 27.5 L29.5 17" />}
      {state === 'locked' && (
        <g className={styles.ringGlyph}>
          <rect x="16" y="21" width="12" height="9" rx="1.5" />
          <path d="M18.5 21 V18.5 a3.5 3.5 0 0 1 7 0 V21" />
        </g>
      )}
      {state === 'open' && (
        <>
          <text className={styles.ringText} x="22" y="19.5">
            {centre === 'stable' ? stablePct : learningPct}%
          </text>
          <text className={styles.ringCaption} x="22" y="28">
            {centre}
          </text>
        </>
      )}
    </svg>
  );
}
