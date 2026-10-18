import { useEffect, useState } from 'react';
import { SKILLS } from '../../../engine';
import { allCards, countDue, getDb, getGamification } from '../../../storage';
import styles from '../../screens.module.css';

export const id = 'stats';
export const order = 20;

interface TodayStats {
  due: number;
  newAvailable: number;
  freezesHeld: number;
}

async function loadStats(): Promise<TodayStats> {
  const db = getDb();
  const now = new Date();
  const cards = await allCards(db);
  const carded = new Set(cards.map((c) => c.itemId));
  const newAvailable = SKILLS.filter((s) => s.prerequisites.length === 0)
    .flatMap((s) => s.items())
    .filter((i) => !carded.has(i.id)).length;
  const { freezesHeld } = await getGamification(db);
  return { due: await countDue(db, now), newAvailable, freezesHeld };
}

/** Due reviews, new items queued and freezes held (design §7 Today). */
export function Card() {
  const [stats, setStats] = useState<TodayStats | null>(null);

  useEffect(() => {
    let live = true;
    void loadStats().then((s) => live && setStats(s));
    return () => {
      live = false;
    };
  }, []);

  return (
    <dl className={styles.stats}>
      <div>
        <dt>Due reviews</dt>
        <dd data-testid="due-count">{stats?.due ?? '–'}</dd>
      </div>
      <div>
        <dt>New notes waiting</dt>
        <dd data-testid="new-count">{stats?.newAvailable ?? '–'}</dd>
      </div>
      <div>
        <dt>Streak freezes</dt>
        <dd>{stats?.freezesHeld ?? '–'}</dd>
      </div>
    </dl>
  );
}
