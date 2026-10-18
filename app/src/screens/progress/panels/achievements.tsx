import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { AchievementList } from '../../../components/achievements/AchievementList';
import { ACHIEVEMENTS } from '../../../engine/gamification/achievements';
import { getDb, getUnlockedAchievements } from '../../../storage';
import type { PanelProps } from '../registry';

export const id = 'achievements';
export const order = 15;
export const title = 'Achievements';

/** Every badge and when it was earned (design §3.7). Updates live as badges unlock. */
export function Panel({ revision }: PanelProps) {
  const [unlocked, setUnlocked] = useState<ReadonlyMap<string, Date>>(new Map());

  useEffect(() => {
    const db = getDb();
    const sub = liveQuery(() => getUnlockedAchievements(db)).subscribe({
      next: setUnlocked,
      error: (e: unknown) => console.error('Loading achievements failed', e),
    });
    return () => sub.unsubscribe();
  }, [revision]);

  return <AchievementList definitions={ACHIEVEMENTS} unlocked={unlocked} />;
}
