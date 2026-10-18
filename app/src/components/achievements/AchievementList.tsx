import type { AchievementDefinition } from '../../engine/gamification/types';
import { BadgeIcon } from './BadgeIcon';
import styles from './Achievements.module.css';

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/**
 * Every badge, earned or not. Locked badges show what earns them, so the list
 * reads as a map of competence to build, not a tally of activity.
 */
export function AchievementList({
  definitions,
  unlocked,
}: {
  definitions: readonly AchievementDefinition[];
  unlocked: ReadonlyMap<string, Date>;
}) {
  const earned = definitions.filter((d) => unlocked.has(d.id)).length;
  return (
    <>
      <p className={styles.tally} data-testid="achievement-tally">
        {earned} of {definitions.length} unlocked
      </p>
      <ul className={styles.grid} aria-label="Achievements">
        {definitions.map((d) => {
          const at = unlocked.get(d.id);
          return (
            <li
              key={d.id}
              className={styles.badge}
              data-testid={`achievement-${d.id}`}
              data-unlocked={at !== undefined}
            >
              <BadgeIcon category={d.category} unlocked={at !== undefined} />
              <div>
                <h3>{d.title}</h3>
                <p>{d.description}</p>
                <p className={styles.status}>
                  {at ? (
                    <>
                      <span aria-hidden>✓ </span>Unlocked{' '}
                      <time dateTime={at.toISOString()}>
                        {at.toLocaleDateString(undefined, DATE_FORMAT)}
                      </time>
                    </>
                  ) : (
                    'Not yet'
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
