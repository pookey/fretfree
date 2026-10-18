import type { Page } from '@playwright/test';

/** Every skill, so a seeded session serves only the cards it is given. */
const ALL_SKILLS = [
  'F1.alphabet',
  'F1.b-c-e-f',
  'F1.half-steps',
  'F1.whole-steps',
  'F2.string6-naturals',
  'F2.string5-naturals',
  'F3.markers',
  'F3.repeat-12',
  'C1.octaves',
  'C1.octaves-gb-shift',
  'C1.double-octaves',
  'C1.every-octave',
  'C2.all-notes',
  'C3.thirds',
  'C3.fourths-fifths',
  'C3.sevenths',
  'C3.sixths',
  'C3.seconds',
  'C4.sharp-keys',
  'C4.flat-keys',
  'C4.sharp-key-degrees',
  'C4.flat-key-degrees',
  'C5.triads',
  'C5.sevenths',
  'C5.sus-add',
];

/**
 * Seed a learner whose only work is the given C1 items, due now and known
 * (so no worked example). Every skill is mastered, which keeps new items and
 * stretch items out; the items' own skill is at `guideLevel`. Reloads the page.
 */
export async function seedDueItems(
  page: Page,
  items: readonly { itemId: string; skillId: string }[],
  guideLevel: 0 | 1 | 2 | 3,
): Promise<void> {
  await page.evaluate(
    async ({ items, guideLevel, skills }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      for (const { itemId, skillId } of items) {
        tx.objectStore('cards').put({
          itemId,
          skillId,
          fsrs: {
            due: new Date(now - DAY),
            stability: 3,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 3,
            learning_steps: 0,
            reps: 3,
            lapses: 0,
            state: 2,
            last_review: new Date(now - 4 * DAY),
          },
          createdAt: new Date(now - 6 * DAY),
          lastReviewedAt: new Date(now - 4 * DAY),
        });
      }
      const seeded = new Set(items.map((i) => i.skillId));
      for (const skillId of skills) {
        tx.objectStore('skillStates').put({
          skillId,
          status: 'mastered',
          guideLevel: seeded.has(skillId) ? guideLevel : 0,
          rollingAccuracy: 1,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { items, guideLevel, skills: ALL_SKILLS },
  );
  await page.reload();
}
