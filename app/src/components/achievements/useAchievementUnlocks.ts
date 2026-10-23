import { liveQuery } from 'dexie';
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../app-store';
import { ACHIEVEMENTS } from '../../engine/gamification/achievements';
import type { AchievementDefinition } from '../../engine/gamification/types';
import { getDb, type FretworkDB } from '../../storage';
import { loadAchievementContext, syncAchievements } from '../../storage/achievements-sync';

const systemNow = () => new Date();

/**
 * Watch the data achievements depend on (skill states, the streak, recent
 * reviews) and unlock badges as soon as they are earned, wherever the change
 * came from: a session finishing, the streak settling, or an import. Returns
 * the badges unlocked while mounted, oldest first, for the toast.
 */
export function useAchievementUnlocks({
  db = getDb(),
  definitions = ACHIEVEMENTS,
  now = systemNow,
}: {
  db?: FretworkDB;
  definitions?: readonly AchievementDefinition[];
  now?: () => Date;
} = {}): { unlocked: AchievementDefinition[]; dismiss(): void } {
  const [unlocked, setUnlocked] = useState<AchievementDefinition[]>([]);
  // Speed demon's tap time, from the loaded settings rather than a live read
  // of the settings table (see `loadAchievementContext`).
  const latencyBaselineMs = useAppStore((s) => s.settings.latencyBaselineMs);

  useEffect(() => {
    let live = true;
    // Serialise syncs so a burst of changes is checked in order.
    let chain = Promise.resolve();
    const load = () => loadAchievementContext(db, undefined, latencyBaselineMs);
    const sub = liveQuery(load).subscribe({
      next: (ctx) => {
        chain = chain
          .then(() => syncAchievements(db, definitions, now(), ctx))
          .then((fresh) => {
            if (live && fresh.length > 0) setUnlocked((u) => [...u, ...fresh]);
          })
          .catch((e: unknown) => console.error('Achievement check failed', e));
      },
      error: (e: unknown) => console.error('Achievement watch failed', e),
    });
    return () => {
      live = false;
      sub.unsubscribe();
    };
  }, [db, definitions, now, latencyBaselineMs]);

  const dismiss = useCallback(() => setUnlocked([]), []);
  return { unlocked, dismiss };
}
