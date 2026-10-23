import { useEffect, useState } from 'react';
import { allCards, getDb, reviewCount } from '../../../storage';
import type { PanelProps } from '../registry';
import styles from '../../screens.module.css';

export const id = 'stats';
export const order = 10;

async function loadStats() {
  const db = getDb();
  return { reviews: await reviewCount(db), cards: (await allCards(db)).length };
}

export function Panel({ revision }: PanelProps) {
  const [stats, setStats] = useState({ reviews: 0, cards: 0 });

  useEffect(() => {
    let live = true;
    void loadStats().then((s) => live && setStats(s));
    return () => {
      live = false;
    };
  }, [revision]);

  return (
    <dl className={styles.stats}>
      <div>
        <dt>Answers logged</dt>
        <dd data-testid="review-count">{stats.reviews}</dd>
      </div>
      <div>
        <dt>Cards practised</dt>
        <dd data-testid="card-count">{stats.cards}</dd>
      </div>
    </dl>
  );
}
