import { Link } from 'react-router';
import { Confetti } from '../../components/confetti/Confetti';
import { ENGINE_CONFIG } from '../../engine';
import type { Celebration } from './celebrations';
import {
  LEARNED_HINT,
  SPACING_COPY,
  accuracyNote,
  competenceText,
  headline,
  personalBestText,
} from './copy';
import styles from './SessionSummary.module.css';

export interface SessionSummaryProps {
  celebration: Celebration;
  /** Where "Done" goes. */
  doneTo?: string;
}

/**
 * The lesson-complete screen (design §3.7 session celebrations, §3.3 step 5):
 * what the learner can now do, the session's moments, its numbers and why to
 * come back tomorrow.
 */
export function SessionSummary({ celebration: c, doneTo = '/' }: SessionSummaryProps) {
  const title = headline(c);
  const [first, ...more] = c.competence;
  const learnedToday = c.competence.some((line) => line.kind === 'learned');
  const note = accuracyNote(c);
  const showCombo = c.bestCombo >= ENGINE_CONFIG.gamification.celebrations.comboShowAt;

  return (
    <div className={styles.screen} data-testid="session-summary">
      <Confetti active={c.confetti} />
      <article className={styles.card} aria-labelledby="summary-title">
        <header className={styles.head}>
          {title !== 'Session complete' && <p className={styles.eyebrow}>Session complete</p>}
          <h1 id="summary-title" data-testid="summary-headline">
            {title}
          </h1>
          {first && first.kind !== 'mastered' && (
            <p className={styles.context}>{first.skillTitle}</p>
          )}
          {learnedToday && (
            <p className={styles.context} data-testid="summary-learned-hint">
              {LEARNED_HINT}
            </p>
          )}
        </header>

        {(more.length > 0 || c.milestones.length > 0) && (
          <ul className={styles.gains} aria-label="What you can now do">
            {more.map((line) => (
              <li
                key={`${line.skillId}:${line.kind === 'mastered' ? 'm' : `${line.kind}:${line.string}`}`}
              >
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
                {competenceText(line)}
              </li>
            ))}
            {c.milestones.map((m) => (
              <li key={m}>
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
                {m}
              </li>
            ))}
          </ul>
        )}

        {(c.perfect || c.personalBest || showCombo) && (
          <ul className={styles.moments} aria-label="Moments">
            {c.perfect && (
              <li className={styles.moment} data-testid="moment-perfect">
                <span className={styles.icon} data-shape="star" aria-hidden="true">
                  ★
                </span>
                <span>
                  <strong>Perfect session</strong>
                  <span className={styles.detail}>Every answer right</span>
                </span>
              </li>
            )}
            {c.personalBest && (
              <li className={styles.moment} data-testid="moment-personal-best">
                <span className={styles.icon} data-shape="bolt" aria-hidden="true">
                  ⚡︎
                </span>
                <span>
                  <strong>New personal-best speed</strong>
                  <span className={styles.detail}>{personalBestText(c.personalBest)}</span>
                </span>
              </li>
            )}
            {showCombo && (
              <li className={styles.moment} data-testid="moment-combo">
                <span className={styles.icon} data-shape="chain" aria-hidden="true">
                  ∞
                </span>
                <span>
                  <strong>Best run</strong>
                  <span className={styles.detail}>{c.bestCombo} correct in a row</span>
                </span>
              </li>
            )}
          </ul>
        )}

        <dl className={styles.stats}>
          <div>
            <dt>XP earned</dt>
            <dd data-testid="summary-xp">{c.xp}</dd>
          </div>
          <div>
            <dt>Items improved</dt>
            <dd data-testid="summary-improved">{c.itemsImproved}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd data-testid="summary-accuracy">{Math.round(c.accuracy * 100)}%</dd>
          </div>
          <div>
            <dt>Answered</dt>
            <dd data-testid="summary-items">{c.answered}</dd>
          </div>
        </dl>
        {note && <p className={styles.note}>{note}</p>}

        <p className={styles.spacing} data-testid="summary-spacing">
          {SPACING_COPY}
        </p>
        <Link to={doneTo} className={styles.done}>
          Done
        </Link>
      </article>
    </div>
  );
}
