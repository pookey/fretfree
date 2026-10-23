import { expect, test, type Page } from '@playwright/test';
import { answer, freshStart, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M10-15: on day one the Today hero says what the first session holds, and
// streak freezes stay out of sight until one is held, explained the first
// time (design §3.7, §7 Today; research/02 rule 15).

const hero = (page: Page) => page.getByRole('region', { name: 'Streak and daily goal' });

/** Merge `freezesHeld` into the stored gamification row, then reload so the app reads it. */
async function holdFreezes(page: Page, freezesHeld: number): Promise<void> {
  await expect(page.getByTestId('goal-ring').first()).toBeVisible();
  await page.evaluate(async (freezesHeld) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('gamification', 'readwrite');
    const store = tx.objectStore('gamification');
    const get = store.get('singleton');
    get.onsuccess = () =>
      store.put({ ...get.result, streakCurrent: 7, freezesHeld, key: 'singleton' });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, freezesHeld);
  await page.reload();
}

test.describe('M10-15 Today on day one', () => {
  test('a fresh profile reads what the first session holds, with no freezes line @smoke', async ({
    page,
  }) => {
    await freshStart(page);
    await expect(hero(page).getByTestId('first-day')).toHaveText(
      'Your first session takes about 10 minutes and starts with the musical alphabet.',
    );
    await expect(hero(page).getByTestId('goal-copy')).toHaveCount(0);
    await expect(hero(page).getByTestId('freezes')).toHaveCount(0);
    await expect(hero(page).getByText(/streak freeze/i)).toHaveCount(0);
    await expect(hero(page).getByTestId('start-session')).toHaveText('Start session (10 min)');
  });

  test('the line follows the session length and goes once the first answer is in', async ({
    page,
  }) => {
    await freshStart(page);
    await page.getByRole('link', { name: 'Settings' }).first().click();
    const practice = page.getByRole('main').getByRole('group', { name: 'Practice' });
    await practice.getByRole('combobox', { name: 'Session length' }).selectOption('5');
    await page.goto('/');
    await expect(hero(page).getByTestId('first-day')).toHaveText(
      /^Your first session takes about 5 minutes and starts with /,
    );

    // One answer stores the first card: day one is over.
    await focusSession(page, 'F2.string6-naturals');
    await answer(page, await targetNote(page));
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await page.goto('/');
    await expect(hero(page).getByTestId('goal-copy')).toBeVisible();
    await expect(hero(page).getByTestId('first-day')).toHaveCount(0);
  });

  test('the first freeze held is explained once, then only counted', async ({ page }) => {
    await freshStart(page);
    await holdFreezes(page, 1);
    await expect(hero(page).getByTestId('freezes')).toContainText('1 streak freeze held');
    await expect(hero(page).getByTestId('freezes-explainer')).toHaveText(
      'A freeze covers a missed day automatically; you earn one for every 7 days in a row and can hold 2.',
    );

    await page.reload();
    await expect(hero(page).getByTestId('freezes')).toContainText('1 streak freeze held');
    await expect(hero(page).getByTestId('freezes-explainer')).toHaveCount(0);
  });
});
