import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { liveQuery } from 'dexie';
import { useAppStore } from '../../../app-store';
import {
  GoalRing,
  firstDayLine,
  freezesExplainer,
  freezesLabel,
  useStreakSummary,
} from '../../../components/goal-ring';
import { DRILLS } from '../../../drills/registry';
import { SKILLS, type Settings, type Skill } from '../../../engine';
import { getDb, getSkillStates } from '../../../storage';
import { firstLessonSkill } from '../first-lesson';
import screens from '../../screens.module.css';
import styles from './hero.module.css';

export const id = 'hero';
export const order = 10;

/** Goal copy that never nudges past the goal: spacing beats cramming (design §3.7). */
function goalCopy(minutes: number, goalMinutes: number, met: boolean): string {
  if (met) return 'Daily goal met. Come back tomorrow to keep it.';
  return `${goalMinutes - minutes} min to go for today's ${goalMinutes}-minute goal`;
}

/** Set once the freeze explainer has been shown on this device. */
const FREEZE_EXPLAINED_KEY = 'fretwork.today.freezeExplained';

function freezeExplained(): boolean {
  try {
    return globalThis.localStorage?.getItem(FREEZE_EXPLAINED_KEY) === '1';
  } catch {
    return false;
  }
}

function markFreezeExplained(): void {
  try {
    globalThis.localStorage?.setItem(FREEZE_EXPLAINED_KEY, '1');
  } catch {
    // Storage that throws: the explainer shows again next time, which is harmless.
  }
}

/**
 * The skill a first session opens with, while the learner has no cards;
 * `null` otherwise, and `undefined` until the first read.
 */
function useFirstLesson(settings: Settings): Skill | null | undefined {
  const [skill, setSkill] = useState<Skill | null | undefined>(undefined);
  useEffect(() => {
    const db = getDb();
    const sub = liveQuery(async () => {
      if ((await db.cards.count()) > 0) return null;
      const statuses = new Map(
        [...(await getSkillStates(db)).values()].map((s) => [s.skillId, s.status]),
      );
      return firstLessonSkill(SKILLS, DRILLS, settings, statuses, new Date());
    }).subscribe({ next: setSkill, error: () => setSkill(null) });
    return () => sub.unsubscribe();
  }, [settings]);
  return skill;
}

/**
 * The Today hero (design §7 Today, §3.7): the streak flame and counter, the
 * daily-goal ring, freezes held and the one big start button. A learner
 * with no cards yet reads what the first session holds (M10-15). Freezes
 * show only once one is held, explained the first time (research/02 rule 15:
 * forgiving streaks, without a "none held" from day one).
 */
export function Card() {
  const settings = useAppStore((s) => s.settings);
  const minutes = settings.sessionMinutes;
  const summary = useStreakSummary();
  const firstLesson = useFirstLesson(settings);
  // Read once per visit, so the explainer stays up while Today is open.
  const [explainedBefore] = useState(freezeExplained);
  const held = summary?.freezesHeld ?? 0;
  useEffect(() => {
    if (held > 0 && !explainedBefore) markFreezeExplained();
  }, [held, explainedBefore]);

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
        {firstLesson && (
          <p className={styles.goal} data-testid="first-day">
            {firstDayLine(minutes, firstLesson.title)}
          </p>
        )}
        {summary && firstLesson !== undefined && (
          <>
            {/* On day one the first-day line says it all: no second "N min" line. */}
            {!(firstLesson && summary.goal.minutes === 0) && (
              <p className={styles.goal} data-testid="goal-copy">
                {goalCopy(summary.goal.minutes, summary.goal.goalMinutes, summary.goal.met)}
              </p>
            )}
            {held > 0 && (
              <p className={styles.freezes} data-testid="freezes">
                <span aria-hidden>{'❄️'.repeat(held)}</span>
                <span>{freezesLabel(held)}</span>
              </p>
            )}
            {held > 0 && !explainedBefore && (
              <p className={styles.freezes} data-testid="freezes-explainer">
                {freezesExplainer()}
              </p>
            )}
          </>
        )}
      </div>
      <Link to="/session" className={screens.startButton} data-testid="start-session">
        Start session ({minutes} min)
      </Link>
    </section>
  );
}
