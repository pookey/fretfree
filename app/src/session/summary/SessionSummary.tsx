import { Link } from 'react-router';
import { Confetti } from '../../components/confetti/Confetti';
import { ENGINE_CONFIG } from '../../engine';
import type { Celebration } from './celebrations';
import {
  ENOUGH_NEW_COPY,
  LEARNED_HINT,
  SPACING_COPY,
  accuracyNote,
  competenceText,
  headline,
  personalBestText,
  progressText,
} from './copy';
import styles from './SessionSummary.module.css';

export interface SessionSummaryProps {
  celebration: Celebration;
  /** Where "Done" goes. */
  doneTo?: string;
  /** The session ended at its new-item cap, so it says why. */
  enoughNew?: boolean;
}

/**
 * The lesson-complete screen (design §3.7 session celebrations, §3.3 step 5):
 * what the learner can now do, the session's moments, its numbers, where its
 * items stand on Learn's learning / stable scale and why to come back.
 */
export function SessionSummary({
  celebration: c,
  doneTo = '/',
  enoughNew = false,
}: SessionSummaryProps) {
  const title = headline(c);
  const [first, ...more] = c.competence;
  const learnedToday = c.competence.some((line) => line.kind === 'learned');
  const note = accuracyNote(c);
  const progress = progressText(c.progress);
  const showCombo = c.bestCombo >= ENGINE_CONFIG.gamification.celebrations.comboShowAt;

  return (
    <main className={styles.screen} data-testid="session-summary">
      <Confetti active={c.confetti} />
      <article className={styles.card} aria-labelledby="summary-title">
        {/* What happened. At short heights it sits beside what's next (M1-33). */}
        <div className={styles.recap}>
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

          {/* Today's score, Learn's two levels and XP are different numbers (M1-35). */}
          <dl className={styles.stats}>
            <div>
              <dt>Today&rsquo;s accuracy</dt>
              <dd data-testid="summary-accuracy">{Math.round(c.accuracy * 100)}%</dd>
              <dd className={styles.statDetail}>
                <span data-testid="summary-items">{c.answered}</span> answered
              </dd>
            </div>
            <div>
              <dt>Learning</dt>
              <dd data-testid="summary-learning">{c.progress.learning}</dd>
            </div>
            <div>
              <dt>Became stable</dt>
              <dd data-testid="summary-stable">{c.progress.becameStable}</dd>
              {/* A subset of the learning tile, not more items on top (M1-38). */}
              {c.progress.learning > 0 && (
                <dd className={styles.statDetail} data-testid="summary-stable-of">
                  of the {c.progress.learning} learning
                </dd>
              )}
              <dd className={styles.statDetail}>
                {/* Already-stable items reviewed today, so a 0 here isn't read as none. */}
                {c.progress.stable > c.progress.becameStable && (
                  <>
                    <span data-testid="summary-stable-total">{c.progress.stable}</span> stable
                    ·{' '}
                  </>
                )}
                <span data-testid="summary-improved">{c.itemsImproved}</span> stronger
              </dd>
            </div>
            <div>
              <dt>XP earned</dt>
              <dd data-testid="summary-xp">{c.xp}</dd>
            </div>
          </dl>
          {note && <p className={styles.note}>{note}</p>}

          {progress && (
            <p className={styles.progress} data-testid="summary-progress">
              {progress}
            </p>
          )}
        </div>

        {/* What's next, with Done always in view: beside the recap at short
            heights, held at the bottom when a tall recap overflows. */}
        <footer className={styles.next}>
          {enoughNew && (
            <p className={styles.enough} data-testid="summary-enough-new">
              {ENOUGH_NEW_COPY}
            </p>
          )}
          <p className={styles.spacing} data-testid="summary-spacing">
            {SPACING_COPY}
          </p>
          <Link to={doneTo} className={styles.done}>
            Done
          </Link>
        </footer>
      </article>
    </main>
  );
}
