import { useEffect, useState } from 'react';
import { XpExplainer, formatXp, useXp } from '../../../components/xp';
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
  // Live, so an import or a Garage purchase shows without a reload.
  const xp = useXp();

  useEffect(() => {
    let live = true;
    void loadStats().then((s) => live && setStats(s));
    return () => {
      live = false;
    };
  }, [revision]);

  return (
    <>
      <dl className={styles.stats}>
        <div>
          <dt>Answers logged</dt>
          <dd data-testid="review-count">{stats.reviews}</dd>
        </div>
        <div>
          <dt>Cards practised</dt>
          <dd data-testid="card-count">{stats.cards}</dd>
        </div>
        <div>
          <dt>XP earned</dt>
          <dd data-testid="xp-earned">{formatXp(xp?.earned ?? 0)}</dd>
        </div>
        <div>
          <dt>To spend in the Garage</dt>
          <dd data-testid="xp-to-spend">{formatXp(xp?.toSpend ?? 0)}</dd>
        </div>
      </dl>
      <XpExplainer />
    </>
  );
}
