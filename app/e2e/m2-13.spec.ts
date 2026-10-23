import { expect, test, type Page } from '@playwright/test';
import { answer, freshStart, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M2-13: per-user FSRS parameter refit (research/02 rule 1). After about
// 1,000 logged reviews, finishing a session refits the FSRS weights from the
// local review log and stores them in settings for the scheduler.

const SKILL = 'F2.string6-naturals';

/** Seed `count` reviews: 50 items, one round a day, every 4th forgotten. */
async function seedReviews(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n) => {
    const DAY = 86_400_000;
    const start = Date.now() - 40 * DAY;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('reviewLogs', 'readwrite');
      for (let i = 0; i < n; i++) {
        const forgot = i % 4 === 0;
        tx.objectStore('reviewLogs').add({
          itemId: `seed-${i % 50}`,
          skillId: 'seed',
          drillType: 'seed',
          correct: !forgot,
          responseMs: 1500,
          rating: forgot ? 1 : 3,
          hintUsed: false,
          answerGiven: '',
          at: new Date(start + Math.floor(i / 50) * DAY + (i % 50) * 1000),
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, count);
}

/** The stored FSRS refit, or null. */
async function storedFit(page: Page): Promise<{ w: number[]; reviewCount: number } | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const row = await new Promise<{ fsrsParams?: unknown } | undefined>((resolve, reject) => {
      const req = db.transaction('settings').objectStore('settings').get('singleton');
      req.onsuccess = () => resolve(req.result as { fsrsParams?: unknown } | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return (row?.fsrsParams ?? null) as { w: number[]; reviewCount: number } | null;
  });
}

/**
 * Answer one prompt correctly, then end the session at the summary. End is
 * tapped only once the answer is stored and the next prompt is up: on a
 * phone on its side the feedback bar covers the header (M1-28), so a tap
 * pressed while the answer is still being written can be released on the
 * bar and never reach End (M1-47).
 */
async function playOneAndFinish(page: Page): Promise<void> {
  await focusSession(page, SKILL);
  await answer(page, await targetNote(page));
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-bar')).not.toHaveAttribute('data-state');
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByTestId('session-summary')).toBeVisible();
}

test.describe('M2-13 FSRS refit', () => {
  test('finishing a session after ~1,000 reviews stores refit weights @smoke', async ({ page }) => {
    await freshStart(page);
    await seedReviews(page, 1000);
    await playOneAndFinish(page);

    await expect.poll(() => storedFit(page), { timeout: 20_000 }).not.toBeNull();
    const fit = await storedFit(page);
    expect(fit?.w).toHaveLength(21);
    expect(fit?.reviewCount).toBe(1001);

    // The app keeps working on the refit weights.
    await page.getByRole('link', { name: 'Done' }).click();
    await playOneAndFinish(page);
  });

  test('below the threshold nothing is refit', async ({ page }) => {
    await freshStart(page);
    await seedReviews(page, 900);
    await playOneAndFinish(page);
    // Give a refit (were one wrongly started) time to land.
    await page.waitForTimeout(1500);
    expect(await storedFit(page)).toBeNull();
  });
});
