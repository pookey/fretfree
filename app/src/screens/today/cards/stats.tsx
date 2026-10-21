import { useEffect, useState } from 'react';
import { SKILLS, deriveStatus, isFrontier, type SkillStatus } from '../../../engine';
import { DRILLS } from '../../../drills/registry';
import { allCards, countDue, getDb, getGamification, getSkillStates } from '../../../storage';
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
  // Open skills, by their gates hard and soft, as the session runner derives
  // them: in registry order, so prerequisites resolve first.
  const statuses = new Map<string, SkillStatus>();
  for (const [id, st] of await getSkillStates(db)) statuses.set(id, st.status);
  for (const s of SKILLS) statuses.set(s.id, deriveStatus(s, statuses, statuses.get(s.id)));
  // Count only items a registered drill can test: some skills list items ahead of their drill.
  const newAvailable = SKILLS.filter((s) => isFrontier(statuses.get(s.id) ?? 'locked'))
    .flatMap((s) =>
      s.items().filter((i) => DRILLS.some((d) => s.drillTypes.includes(d.id) && d.canTest(i))),
    )
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
