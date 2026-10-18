import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { QUEST_TEMPLATES, type QuestTemplate } from '../../../engine/gamification/quests';
import type { QuestCompletedEvent } from '../../../engine/gamification/types';
import { getDb, type FretworkDB } from '../../../storage';
import { loadQuestInputs, syncQuests, type QuestSync } from '../../../storage/quests-sync';
import screens from '../../screens.module.css';
import styles from './quests.module.css';

export const id = 'quests';
export const order = 15;

const systemNow = () => new Date();

export interface QuestsOptions {
  db?: FretworkDB;
  templates?: readonly QuestTemplate[];
  now?: () => Date;
}

/**
 * Today's quests, kept current: watch the day's answers, due cards and
 * progress, and award each quest (bonus XP plus a logged event) as soon as it
 * is reached. `fresh` holds the quests completed while mounted, for the
 * announcement.
 */
export function useDailyQuests({
  db = getDb(),
  templates = QUEST_TEMPLATES,
  now = systemNow,
}: QuestsOptions = {}): { sync: QuestSync | null; fresh: QuestCompletedEvent[] } {
  const [sync, setSync] = useState<QuestSync | null>(null);
  const [fresh, setFresh] = useState<QuestCompletedEvent[]>([]);

  useEffect(() => {
    let live = true;
    // Serialise syncs so a burst of changes is checked in order.
    let chain = Promise.resolve();
    const sub = liveQuery(() => loadQuestInputs(db, now())).subscribe({
      next: (inputs) => {
        chain = chain
          .then(() => syncQuests(db, templates, now(), inputs))
          .then((s) => {
            if (!live) return;
            setSync(s);
            if (s.fresh.length > 0) setFresh((f) => [...f, ...s.fresh]);
          })
          .catch((e: unknown) => console.error('Quest check failed', e));
      },
      error: (e: unknown) => console.error('Quest watch failed', e),
    });
    return () => {
      live = false;
      sub.unsubscribe();
    };
  }, [db, templates, now]);

  return { sync, fresh };
}

/** Daily quests (design §7 Today, §3.7): three small rotating goals with bonus XP. */
export function Card(props: QuestsOptions) {
  const { sync, fresh } = useDailyQuests(props);
  const statuses = sync?.statuses ?? [];
  const done = statuses.filter((s) => s.done).length;
  const titles = new Map(statuses.map((s) => [s.quest.id, s.quest.title]));

  return (
    <section className={styles.quests} aria-labelledby="quests-heading">
      <header className={styles.header}>
        <h2 id="quests-heading" className={screens.sectionTitle}>
          Daily quests
        </h2>
        {sync && (
          <p className={styles.tally} data-testid="quests-tally">
            {done} of {statuses.length} done
          </p>
        )}
      </header>
      <ul className={styles.list} aria-busy={!sync}>
        {statuses.map(({ quest, progress, done }) => (
          <li
            key={quest.id}
            className={styles.quest}
            data-testid="quest"
            data-quest={quest.id}
            data-done={done}
          >
            <span className={styles.icon} aria-hidden>
              {done ? '✓' : ''}
            </span>
            <div className={styles.body}>
              <h3 className={styles.title}>{quest.title}</h3>
              <p className={styles.description}>{quest.description}</p>
              <div className={styles.meter}>
                <div
                  className={styles.track}
                  role="progressbar"
                  aria-label={quest.title}
                  aria-valuemin={0}
                  aria-valuemax={quest.target}
                  aria-valuenow={progress}
                  aria-valuetext={done ? 'Done' : `${progress} of ${quest.target}`}
                >
                  <div
                    className={styles.fill}
                    style={{ width: `${(progress / quest.target) * 100}%` }}
                  />
                </div>
                <span className={styles.count} data-testid="quest-progress">
                  {done ? 'Done' : `${progress}/${quest.target}`}
                </span>
                <span className={styles.reward}>+{quest.bonusXp} XP</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.announce} role="status" data-testid="quest-announce">
        {fresh
          .map((e) => `Quest complete: ${titles.get(e.questId) ?? e.questId}. +${e.xp} XP.`)
          .join(' ')}
      </p>
    </section>
  );
}
