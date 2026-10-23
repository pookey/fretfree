import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { GarageBuild } from '../../engine/garage';
import { getDb } from '../../storage';
import { getGarage } from '../../storage/garage-repo';

/**
 * The equipped build, kept live: an equip, a purchase or a rename redraws
 * every reader. `null` until the first read. Only lazy modules (the sidebar
 * avatar, the Progress guitar card) import this, keeping it out of first load.
 */
export function useGarageBuild(revision = 0): GarageBuild | null {
  const [build, setBuild] = useState<GarageBuild | null>(null);
  useEffect(() => {
    const sub = liveQuery(() => getGarage(getDb())).subscribe({
      next: setBuild,
      error: (e: unknown) => console.error('Loading your guitar failed', e),
    });
    return () => sub.unsubscribe();
  }, [revision]);
  return build;
}
