import { expect, type Page } from '@playwright/test';
import { focusSession } from './focus';

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
  'C2.string1-naturals',
  'C2.string4-naturals',
  'C2.string3-naturals',
  'C2.string2-naturals',
  'C2.low-accidentals',
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
export const THIRDS_SHAPES = ['s6→s5', 's5→s4', 's4→s3', 's3→s2', 's2→s1'].flatMap((pair) =>
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

export interface SeedPractising {
  skillId: string;
  /** 0 = no guides; higher levels show more help, such as the context panel. */
  guideLevel: number;
}

/**
 * Mark `mastered` skills mastered, `practising` skills in practice at their
 * guide level, and store `cards` as known review cards. Reloads the page.
 */
export async function seedIntervals(
  page: Page,
  {
    mastered,
    cards,
    practising = [],
  }: {
    mastered: readonly string[];
    cards: readonly SeedCard[];
    practising?: readonly SeedPractising[];
  },
): Promise<void> {
  await page.evaluate(
    async ({ mastered, cards, practising }) => {
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
      for (const { skillId, guideLevel } of practising) {
        tx.objectStore('skillStates').put({
          skillId,
          status: 'practising',
          guideLevel,
          rollingAccuracy: 0.8,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { mastered, cards, practising },
  );
  await page.reload();
}

/**
 * Start a session focused on C3 (or some of its skills) and wait for D6. The
 * focus keeps other topics' new and due items out, so the spec doesn't depend
 * on which skills come before C3; gating still applies, so seed first.
 */
export async function startIntervalSession(
  page: Page,
  skills: readonly string[] = C3_SKILLS,
): Promise<void> {
  await focusSession(page, skills);
  await expect(page.getByTestId('d6-prompt')).toBeVisible();
}
