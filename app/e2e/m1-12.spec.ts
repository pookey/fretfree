import { expect, test, type Page } from '@playwright/test';
import { answer, expectNoHorizontalOverflow, freshStart, targetNote, wrongNote } from './helpers';

// M1-12: session celebrations (design §3.7, §3.3 step 5).

const DAY = 86_400_000;

/**
 * Write rows straight into the app's IndexedDB (the app has already created
 * the schema). `slowHistory` adds a finished session yesterday with a 9s
 * median answer, so any normal session is a new personal best. `knownString6`
 * seeds graduated cards for string 6's naturals below fret 12, so learning
 * fret 12 completes the string.
 */
async function seed(page: Page, opts: { slowHistory?: boolean; knownString6?: boolean }) {
  await page.evaluate(
    async ({ slowHistory, knownString6, DAY }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'reviewLogs', 'sessionLogs'], 'readwrite');
      const now = Date.now();
      if (slowHistory) {
        const start = new Date(now - DAY);
        tx.objectStore('sessionLogs').add({
          startedAt: start,
          endedAt: new Date(start.getTime() + 60_000),
          itemsSeen: 6,
          accuracy: 1,
        });
        for (let i = 0; i < 6; i++) {
          tx.objectStore('reviewLogs').add({
            itemId: 'note@s1f0',
            skillId: 'C2.all-notes',
            drillType: 'name-the-note',
            correct: true,
            responseMs: 9000,
            rating: 2,
            hintUsed: false,
            answerGiven: 'E',
            at: new Date(start.getTime() + (i + 1) * 5000),
          });
        }
      }
      if (knownString6) {
        for (const fret of [0, 1, 3, 5, 7, 8, 10]) {
          const last = new Date(now - DAY);
          tx.objectStore('cards').put({
            itemId: `note@s6f${fret}`,
            skillId: 'F2.string6-naturals',
            fsrs: {
              due: new Date(now + 10 * DAY),
              stability: 10,
              difficulty: 5,
              elapsed_days: 0,
              scheduled_days: 10,
              learning_steps: 0,
              reps: 3,
              lapses: 0,
              state: 2,
              last_review: last,
            },
            createdAt: last,
            lastReviewedAt: last,
          });
        }
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { slowHistory: false, knownString6: false, ...opts, DAY },
  );
}

/** Answer the current prompt correctly and wait for the auto-advance. */
async function answerCorrectly(page: Page) {
  await answer(page, await targetNote(page));
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

async function endSession(page: Page) {
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByTestId('session-summary')).toBeVisible();
}

test.describe('M1-12 session celebrations', () => {
  test('a combo builds during the session and the summary celebrates competence', async ({
    page,
  }) => {
    await freshStart(page);
    await seed(page, { slowHistory: true });
    await page.getByTestId('start-session').click();

    // Four guided worked examples don't count toward the combo.
    for (let i = 0; i < 4; i++) await answerCorrectly(page);
    await expect(page.getByTestId('combo')).toBeHidden();
    for (let i = 0; i < 2; i++) await answerCorrectly(page);
    await expect(page.getByTestId('combo')).toBeHidden();
    await answerCorrectly(page);
    await expect(page.getByTestId('combo')).toHaveText('3 in a row');
    for (let i = 0; i < 5; i++) await answerCorrectly(page);
    await expect(page.getByTestId('combo')).toHaveText('8 in a row');

    await endSession(page);
    await expect(
      page.getByRole('heading', { level: 1, name: 'You now know string 6 to fret 5' }),
    ).toBeVisible();
    await expect(page.getByText('Natural notes on string 6')).toBeVisible();
    await expect(page.getByTestId('moment-perfect')).toContainText('Perfect session');
    await expect(page.getByTestId('moment-personal-best')).toContainText('New personal-best speed');
    await expect(page.getByTestId('moment-personal-best')).toContainText('down from 9.0s');
    await expect(page.getByTestId('moment-combo')).toContainText('8 correct in a row');
    await expect(page.getByTestId('summary-xp')).toHaveText(/^[1-9]\d*$/);
    await expect(page.getByTestId('summary-improved')).toHaveText('4');
    await expect(page.getByTestId('summary-accuracy')).toHaveText('100%');
    await expect(page.getByTestId('summary-items')).toHaveText('12');
    await expect(page.getByTestId('summary-spacing')).toContainText('Come back tomorrow');
    // A partial string is competence, not a milestone: no confetti.
    await expect(page.getByTestId('confetti')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });

  test('confetti fires for a milestone and never blocks the summary', async ({ page }) => {
    await freshStart(page);
    await seed(page, { knownString6: true });
    await page.getByTestId('start-session').click();
    for (let i = 0; i < 12; i++) await answerCorrectly(page);
    await endSession(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /^(You now know string 6 to fret 12|You've mastered natural notes on string 6)$/,
    );
    await expect(page.getByTestId('confetti')).toBeAttached();
    await expect(page.getByTestId('confetti')).toHaveAttribute('aria-hidden', 'true');
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });

  test('confetti is off under reduced motion; the milestone copy stays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await freshStart(page);
    await seed(page, { knownString6: true });
    await page.getByTestId('start-session').click();
    for (let i = 0; i < 12; i++) await answerCorrectly(page);
    await endSession(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/string 6/);
    await expect(page.getByTestId('confetti')).toHaveCount(0);
  });

  test('the combo resets quietly after a miss and the summary fits @smoke', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();
    for (let i = 0; i < 7; i++) await answerCorrectly(page);
    await expect(page.getByTestId('combo')).toHaveText('3 in a row');

    await answer(page, await wrongNote(await targetNote(page)));
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('combo')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();

    await endSession(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('summary-xp')).toHaveText(/^[1-9]\d*$/);
    await expect(page.getByTestId('summary-improved')).toBeVisible();
    await expect(page.getByTestId('summary-accuracy')).toHaveText('88%');
    await expect(page.getByTestId('summary-spacing')).toContainText('Come back tomorrow');
    await expect(page.getByTestId('moment-perfect')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
