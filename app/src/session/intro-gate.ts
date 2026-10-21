import type { CardRecord, SessionEntry } from '../engine';
import { allCards, type FretworkDB } from '../storage';

/**
 * Set to "1" in localStorage (e2e only) to skip concept intros, so specs that
 * aren't about them start on their drill. `e2e/helpers.ts` sets it.
 */
export const SKIP_INTROS_KEY = 'fretwork.e2e.skipIntros';

/** The skill to introduce before an entry, if any. */
export type IntroGate = (entry: SessionEntry) => string | null;

/**
 * Which skills a session introduces (M10-04, research/02 rule 8). A skill
 * with no cards when the session started is new to the learner, so its
 * concept intro goes before the first worked rep of its first new item, once.
 * Answering that rep stores a card, so no later session shows it again.
 */
export function introGate(cards: readonly CardRecord[], off = false): IntroGate {
  const seen = new Set(cards.map((c) => c.skillId));
  return ({ skillId, kind, guided }) => {
    if (off || kind !== 'new' || !guided || seen.has(skillId)) return null;
    seen.add(skillId);
    return skillId;
  };
}

/** The gate for a session starting now. Review-only sessions introduce nothing. */
export async function openIntroGate(
  db: FretworkDB,
  { reviewOnly }: { reviewOnly?: boolean },
  storage: () => Pick<Storage, 'getItem'> | undefined = () => globalThis.localStorage,
): Promise<IntroGate> {
  let skip = false;
  try {
    skip = storage()?.getItem(SKIP_INTROS_KEY) === '1';
  } catch {
    // Storage that throws counts as not set.
  }
  return introGate(await allCards(db), reviewOnly || skip);
}
