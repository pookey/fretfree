import { CATALOGUE } from '../../engine/garage/catalogue';
import type { CatalogueItem, Category } from '../../engine/garage/types';

/** How a line names each category's part: "the *Gold leaf* finish". */
const NOUN: Record<Category, string> = {
  body: 'body',
  finish: 'finish',
  pickguard: 'pickguard',
  hardware: 'hardware',
  board: 'fretboard',
  inlay: 'inlays',
};

/** A Garage part a badge unlocks, as its line names it. */
export interface GarageUnlock {
  id: string;
  name: string;
  noun: string;
}

/**
 * The Garage parts each badge unlocks (design §3.8 mastery finishes), keyed
 * by achievement ID, in catalogue order. Badges that unlock nothing are absent.
 */
export function garageUnlocksByBadge(
  catalogue: readonly CatalogueItem[],
): ReadonlyMap<string, readonly GarageUnlock[]> {
  const out = new Map<string, GarageUnlock[]>();
  for (const item of catalogue) {
    if (item.unlockedBy === undefined) continue;
    const list = out.get(item.unlockedBy) ?? [];
    list.push({ id: item.id, name: item.name, noun: NOUN[item.category] });
    out.set(item.unlockedBy, list);
  }
  return out;
}

const BY_BADGE = garageUnlocksByBadge(CATALOGUE);

/** The Garage parts this badge unlocks; empty for most badges. */
export function garageUnlocks(badgeId: string): readonly GarageUnlock[] {
  return BY_BADGE.get(badgeId) ?? [];
}
