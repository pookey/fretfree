import { expect, test, type Page } from '@playwright/test';
import { answer, expectNoHorizontalOverflow, freshStart, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M1-18: Today's "2-minute fretboard warm-up" (design §7 Today). It reviews
// due fretboard items, or runs the fretboard frontier when nothing is due.
// The warm-up tests start from Today on purpose: the link sets the focus.

const DUE_FRETS = [0, 3, 5];

const warmup = (page: Page) => page.getByRole('link', { name: '2-minute fretboard warm-up' });
const timeLeft = (page: Page) => page.getByRole('timer', { name: 'Time left in session' });
const progress = (page: Page) => page.getByRole('progressbar', { name: 'Session progress' });

/**
 * Seed three string-6 notes in review, due a day ago. No skill is mastered,
 * so the daily session would still open with new F1 items. Reloads the page.
 */
async function seedDueNotes(page: Page): Promise<void> {
  await page.evaluate(async (frets) => {
    const DAY = 86_400_000;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('cards', 'readwrite');
    const now = Date.now();
    for (const fret of frets) {
      tx.objectStore('cards').put({
        itemId: `note@s6f${fret}`,
        skillId: 'F2.string6-naturals',
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
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, DUE_FRETS);
  await page.reload();
}

test.describe('M1-18 Today quick drills', () => {
  test('with nothing due, the warm-up runs the fretboard frontier in 2 minutes', async ({
    page,
  }) => {
    await freshStart(page);
    const card = page.getByRole('region', { name: 'Quick drills' });
    await expect(card).toBeVisible();
    await expect(card.getByTestId('warmup-copy')).toHaveText(
      'Nothing is due, so it practises what you are learning next.',
    );
    await expectNoHorizontalOverflow(page);

    await warmup(page).click();
    await expect(page).toHaveURL(/\/session\?skill=F2\.string6-naturals&/);
    await expect(timeLeft(page)).toHaveText('2 min left');
    // A short, fixed-length session: one new block, not the daily 10 minutes.
    await expect(progress(page)).toHaveAttribute('aria-valuemax', '16');
    // Fretboard only: string 6's worked examples, not F1's note wheel.
    await expect(page.getByText(/^This is/)).toBeVisible();
    expect(await targetNote(page)).toBe('E');
    await expect(page.getByTestId('marker-target')).toHaveAttribute('data-string', '6');
    await expectNoHorizontalOverflow(page);
  });

  test('with fretboard items due, the warm-up reviews exactly those', async ({ page }) => {
    await freshStart(page);
    await seedDueNotes(page);
    await expect(page.getByTestId('warmup-copy')).toHaveText('Reviews 3 fretboard cards due now.');

    await warmup(page).click();
    await expect(timeLeft(page)).toHaveText('2 min left');
    await expect(progress(page)).toHaveAttribute('aria-valuemax', String(DUE_FRETS.length));
    const seen: number[] = [];
    for (let i = 0; i < DUE_FRETS.length; i++) {
      await expect(page.getByText('Name the highlighted note')).toBeVisible();
      seen.push(Number(await page.getByTestId('marker-target').getAttribute('data-fret')));
      await answer(page, await targetNote(page));
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
    }
    expect(seen.sort((a, b) => a - b)).toEqual(DUE_FRETS);
    await expect(page.getByTestId('session-summary')).toBeVisible();
    await expect(page.getByTestId('summary-items')).toHaveText('3');
  });

  test('a session without warm-up state keeps the daily time budget', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, 'F2.string6-naturals');
    await expect(timeLeft(page)).toHaveText('10 min left');
  });

  test('starts the warm-up from Today on a phone @smoke @phone', async ({ page }) => {
    await freshStart(page);
    await expect(warmup(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await warmup(page).click();
    await expect(timeLeft(page)).toHaveText('2 min left');
    await expect(page.getByText(/^This is/)).toBeVisible();
  });
});
