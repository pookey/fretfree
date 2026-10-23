import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { balance } from '../../engine/garage/wallet';
import { getDb, type FretworkDB } from '../../storage';
import { getWalletState } from '../../storage/garage-repo';

export interface XpFigures {
  /** Lifetime XP (`Gamification.xpTotal`). Never spent. */
  earned: number;
  /** The Garage balance: XP earned less the price of bought parts, at least 0. */
  toSpend: number;
}

/** XP earned and the Garage balance, read from the database. */
export async function loadXp(db: FretworkDB): Promise<XpFigures> {
  const { xpTotal, purchases } = await getWalletState(db);
  return { earned: xpTotal, toSpend: balance(xpTotal, purchases) };
}

/**
 * XP earned and the Garage balance, kept live: a session that adds XP or a
 * purchase updates every reader without a reload. `null` until the first read.
 */
export function useXp(db: FretworkDB = getDb()): XpFigures | null {
  const [xp, setXp] = useState<XpFigures | null>(null);
  useEffect(() => {
    const sub = liveQuery(() => loadXp(db)).subscribe({
      next: setXp,
      error: () => setXp(null),
    });
    return () => sub.unsubscribe();
  }, [db]);
  return xp;
}
