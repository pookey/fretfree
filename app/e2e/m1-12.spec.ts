import { expect, test, type Page } from '@playwright/test';
import {
  F1_SKILLS,
  answer,
  expectNoHorizontalOverflow,
  freshStart,
  masterSkills,
  targetNote,
  wrongNote,
} from './helpers';

// M1-12: session celebrations (design §3.7, §3.3 step 5).

const DAY = 86_400_000;

/**
 * Write rows straight into the app's IndexedDB (the app has already created
 * the schema). `slowHistory` adds a finished session yesterday with a 9s
 * median answer, so any normal session is a new personal best. `string6Due`
 * seeds string 5's naturals and string 6's below fret 12 as known in both
 * directions (name the note and find it; introduced days ago, recalled since,
 * not due), plus fret 12 learned in one sitting two days ago and due now. The session is that one review, and recalling it
 * completes string 6 across a gap.
 */
async function seed(page: Page, opts: { slowHistory?: boolean; string6Due?: boolean }) {
  await page.evaluate(
    async ({ slowHistory, string6Due, DAY }) => {
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
      if (string6Due) {
        const card = (
          itemId: string,
          skillId: string,
          due: number,
          stability: number,
          createdAt = now - 4 * DAY,
        ) => ({
          itemId,
          skillId,
          fsrs: {
            due: new Date(due),
            stability,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: Math.round(stability),
            learning_steps: 0,
            reps: 3,
            lapses: 0,
            state: 2,
            last_review: new Date(now - 2 * DAY),
          },
          createdAt: new Date(createdAt),
          lastReviewedAt: new Date(now - 2 * DAY),
        });
        const cards = tx.objectStore('cards');
        for (const fret of [0, 1, 3, 5, 7, 8, 10]) {
          cards.put(card(`note@s6f${fret}`, 'F2.string6-naturals', now + 10 * DAY, 10));
        }
        for (const fret of [0, 2, 3, 5, 7, 8, 10, 12]) {
          cards.put(card(`note@s5f${fret}`, 'F2.string5-naturals', now + 10 * DAY, 10));
        }
        // The find-the-note direction (D2) of both strings is known too, so no
        // new D2 items join the session.
        for (const string of [6, 5]) {
          for (const pc of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
            const skillId = `F2.string${string}-naturals`;
            cards.put(card(`find:${pc}@s${string}`, skillId, now + 10 * DAY, 10));
          }
        }
        // Learned in one sitting two days ago (so not yet known), and due now.
        cards.put(card('note@s6f12', 'F2.string6-naturals', now - 3_600_000, 2, now - 2 * DAY));
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { slowHistory: false, string6Due: false, ...opts, DAY },
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
    await masterSkills(page, F1_SKILLS);
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
    // Learned in one sitting is not yet known: honest copy and a come-back hint.
    await expect(
      page.getByRole('heading', { level: 1, name: 'You learned string 6 to fret 5 today' }),
    ).toBeVisible();
    await expect(page.getByText('Natural notes on string 6')).toBeVisible();
    await expect(page.getByTestId('summary-learned-hint')).toContainText('tomorrow');
    await expect(page.getByTestId('moment-perfect')).toContainText('Perfect session');
    await expect(page.getByTestId('moment-personal-best')).toContainText('New personal-best speed');
    await expect(page.getByTestId('moment-personal-best')).toContainText('down from 9.0s');
    await expect(page.getByTestId('moment-combo')).toContainText('8 correct in a row');
    await expect(page.getByTestId('summary-xp')).toHaveText(/^[1-9]\d*$/);
    await expect(page.getByTestId('summary-improved')).toHaveText('4');
    await expect(page.getByTestId('summary-accuracy')).toHaveText('100%');
    await expect(page.getByTestId('summary-items')).toHaveText('12');
    await expect(page.getByTestId('summary-spacing')).toContainText('Come back tomorrow');
    // Same-day learning is not a milestone: no confetti.
    await expect(page.getByTestId('confetti')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });

  test('confetti fires for a milestone and never blocks the summary', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, F1_SKILLS);
    await seed(page, { string6Due: true });
    await page.getByTestId('start-session').click();
    // The only item is the due review of fret 12; the session ends after it.
    await answer(page, await targetNote(page));
    await expect(page.getByTestId('session-summary')).toBeVisible();

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
    await masterSkills(page, F1_SKILLS);
    await seed(page, { string6Due: true });
    await page.getByTestId('start-session').click();
    // The only item is the due review of fret 12; the session ends after it.
    await answer(page, await targetNote(page));
    await expect(page.getByTestId('session-summary')).toBeVisible();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/string 6/);
    await expect(page.getByTestId('confetti')).toHaveCount(0);
  });

  test('the combo resets quietly after a miss and the summary fits @smoke', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, F1_SKILLS);
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
