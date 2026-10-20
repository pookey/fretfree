import type { Page } from '@playwright/test';
import { skillsExcept } from './skills';

/** Every skill but string 6's naturals, so a session stays on one skill's guide level. */
const OTHER_SKILLS = skillsExcept('F2.string6-naturals');

/**
 * Seed a learner whose only work is string 6's naturals in D1, due now, with
 * that skill at `guideLevel`. Every other skill is mastered and the D2
 * direction is known and not due, so the session is D1 recall prompts only:
 * no worked examples, one guide level. Reloads the page.
 */
export async function seedString6Reviews(page: Page, guideLevel: 0 | 1 | 2 | 3): Promise<void> {
  await page.evaluate(
    async ({ guideLevel, others }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      const card = (itemId: string, due: number) => ({
        itemId,
        skillId: 'F2.string6-naturals',
        fsrs: {
          due: new Date(due),
          stability: 3,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 3,
          learning_steps: 0,
          reps: 3,
          lapses: 0,
          state: 2,
          last_review: new Date(now - 3 * DAY),
        },
        createdAt: new Date(now - 6 * DAY),
        lastReviewedAt: new Date(now - 3 * DAY),
      });
      const cards = tx.objectStore('cards');
      for (const fret of [0, 1, 3, 5, 7, 8, 10, 12]) cards.put(card(`note@s6f${fret}`, now - DAY));
      for (const pc of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        cards.put(card(`find:${pc}@s6`, now + 10 * DAY));
      }
      const states = tx.objectStore('skillStates');
      for (const skillId of others) {
        states.put({ skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
      }
      states.put({
        skillId: 'F2.string6-naturals',
        status: 'practising',
        guideLevel,
        rollingAccuracy: 0.8,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { guideLevel, others: OTHER_SKILLS },
  );
  await page.reload();
}

/** Fret inlays on the neck: the only circles outside a marker group. */
export async function inlayCount(page: Page): Promise<number> {
  return page
    .locator('svg[data-fret-from]')
    .evaluate(
      (svg) =>
        [...svg.querySelectorAll('circle')].filter((c) => !c.closest('[data-testid^="marker-"]'))
          .length,
    );
}

/** String 6's stored guide level (what the next session starts at). */
export async function storedGuideLevel(page: Page): Promise<number | undefined> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const row = await new Promise<{ guideLevel: number } | undefined>((resolve, reject) => {
      const req = db
        .transaction('skillStates')
        .objectStore('skillStates')
        .get('F2.string6-naturals');
      req.onsuccess = () => resolve(req.result as { guideLevel: number } | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row?.guideLevel;
  });
}
