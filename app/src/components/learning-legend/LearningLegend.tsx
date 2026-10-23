import { ENGINE_CONFIG } from '../../engine';
import styles from './LearningLegend.module.css';

type Level = 'learning' | 'stable' | 'mastered';

/**
 * What "learning", "stable" and "mastered" mean, one line each, beside the
 * numbers that use them (copy audit, screens §9: the terms were defined only
 * at the foot of a module's detail). The thresholds come from the engine's
 * mastery config, so the copy can't drift from the rule (design §3.4). Each
 * term carries the mastery ring's own mark (thin arc, thick arc, tick), so it
 * reads by shape as well as colour.
 */
export function legendLines(
  mastery: { stabilityDays: number; itemShare: number } = ENGINE_CONFIG.mastery,
): { level: Level; term: string; meaning: string }[] {
  return [
    { level: 'learning', term: 'Learning', meaning: 'you got the card right last time.' },
    {
      level: 'stable',
      term: 'Stable',
      meaning: `you’d still recall the card ${mastery.stabilityDays} days from now.`,
    },
    {
      level: 'mastered',
      term: 'Mastered',
      meaning: `${Math.round(mastery.itemShare * 100)}% of a skill’s cards are stable, and you answer them at your speed target.`,
    },
  ];
}

function Mark({ level }: { level: Level }) {
  return (
    <svg className={styles.mark} viewBox="0 0 24 12" aria-hidden="true" data-level={level}>
      {level === 'mastered' ? <path d="M6 6.5 L10 10 L18 2" /> : <path d="M3 6 H21" />}
    </svg>
  );
}

export function LearningLegend({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="What the numbers mean"
      className={className ? `${styles.legend} ${className}` : styles.legend}
      data-testid="learning-legend"
    >
      <dl className={styles.lines}>
        {legendLines().map(({ level, term, meaning }) => (
          <div key={level} className={styles.line}>
            <dt>
              <Mark level={level} />
              {term}
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
