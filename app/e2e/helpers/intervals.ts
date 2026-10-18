import { expect, type Page } from '@playwright/test';

/** Every skill whose topic comes before C3, so a fresh session starts on intervals. */
export const SKILLS_BEFORE_C3 = [
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
];

export const C3_SKILLS = [
  'C3.thirds',
  'C3.fourths-fifths',
  'C3.sevenths',
  'C3.sixths',
  'C3.seconds',
];

/** The playable 3rd shapes (C3.thirds): adjacent strings, low to high. */
const THIRDS_SHAPES = ['s6→s5', 's5→s4', 's4→s3', 's3→s2', 's2→s1'].flatMap((pair) =>
  ['m3', 'M3'].map((iv) => `${iv}@${pair}`),
);

/**
 * The thirds' name-it direction (D5), seen and not due. Carded items are not
 * new, so a fresh C3 session leads with the tap direction (D6) whether or not
 * D5 is built.
 */
export const KNOWN_THIRDS_NAMES = THIRDS_SHAPES.map((shape) => ({
  itemId: `interval-name:${shape}`,
  skillId: 'C3.thirds',
  dueInDays: 30,
}));

export interface SeedCard {
  itemId: string;
  skillId: string;
  /** Negative = overdue. */
  dueInDays: number;
  /** Lower stability, reviewed longer ago, comes first among due reviews. */
  stability?: number;
  reviewedDaysAgo?: number;
}

/** Mark `mastered` skills mastered and store `cards` as known review cards. Reloads the page. */
export async function seedIntervals(
  page: Page,
  { mastered, cards }: { mastered: readonly string[]; cards: readonly SeedCard[] },
): Promise<void> {
  await page.evaluate(
    async ({ mastered, cards }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      for (const c of cards) {
        const reviewed = now - (c.reviewedDaysAgo ?? 4) * DAY;
        tx.objectStore('cards').put({
          itemId: c.itemId,
          skillId: c.skillId,
          fsrs: {
            due: new Date(now + c.dueInDays * DAY),
            stability: c.stability ?? 3,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 3,
            learning_steps: 0,
            reps: 3,
            lapses: 0,
            state: 2,
            last_review: new Date(reviewed),
          },
          createdAt: new Date(reviewed - 3 * DAY),
          lastReviewedAt: new Date(reviewed),
        });
      }
      for (const skillId of mastered) {
        tx.objectStore('skillStates').put({
          skillId,
          status: 'mastered',
          guideLevel: 0,
          rollingAccuracy: 1,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { mastered, cards },
  );
  await page.reload();
}

/**
 * Start a session from Today and wait for D6. A banner (the install hint) can
 * appear after a reload and push the link down mid-click, so retry until the
 * session opens.
 */
export async function startIntervalSession(page: Page): Promise<void> {
  await expect(async () => {
    if (!new URL(page.url()).pathname.endsWith('/session')) {
      await page.getByTestId('start-session').click({ timeout: 2_000 });
    }
    await expect(page.getByTestId('d6-prompt')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}
