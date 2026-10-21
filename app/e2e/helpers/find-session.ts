import { expect, type Page } from '@playwright/test';
import { F1_SKILLS, F3_SKILLS, freshStart, masterSkills, noteName } from '../helpers';
import { C4_SKILLS, I3_SKILLS } from './keys';

// Reaching D2 "Find the note" from a fresh start (the same setup as m1-04).

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Mark every F2 note@ item as known and not due, so the session goes
 * straight to the find:<pc>@s<n> items D2 tests.
 */
export async function seedKnownNotes(page: Page): Promise<void> {
  const ids: string[] = [];
  for (const string of [6, 5]) {
    for (let fret = 0; fret <= 12; fret++) {
      if (NATURALS.includes(noteName(string, fret))) ids.push(`note@s${string}f${fret}`);
    }
  }
  await page.evaluate(async (itemIds) => {
    const now = new Date();
    const due = new Date(now.getTime() + 30 * 86_400_000);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('cards', 'readwrite');
      for (const itemId of itemIds) {
        const string = itemId.match(/@s(\d)/)![1];
        tx.objectStore('cards').put({
          itemId,
          skillId: `F2.string${string}-naturals`,
          fsrs: {
            due,
            stability: 30,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 30,
            learning_steps: 0,
            reps: 1,
            lapses: 0,
            state: 2,
            last_review: now,
          },
          createdAt: now,
          lastReviewedAt: now,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, ids);
}

export async function startFindSession(page: Page): Promise<void> {
  await freshStart(page);
  // The F1 note-wheel (D3) and F3 landmark (D39) skills lead a fresh session; skip them.
  // Keys open with F1 and would take the goal lane's share of new items (M10-03).
  await masterSkills(page, [...F1_SKILLS, ...F3_SKILLS, ...C4_SKILLS, ...I3_SKILLS]);
  await seedKnownNotes(page);
  await page.reload();
  // New counts the open skills' unseen items (M10-02): 7 naturals to find on
  // each of strings 6 and 5, the 3 F4 pulse rhythms, and what mastering F1
  // opens: 8 sharp keys to spell, 5 I6 ear items and 13 TAB string-1 cards.
  await expect(page.getByTestId('new-count')).toHaveText('43');
  await page.getByTestId('start-session').click();
  await expect(page.getByTestId('d2-prompt')).toBeVisible();
}
