import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M2-19: Progress shows octave and interval work (design §7 Progress,
// research/02 rule 15). Each started topic gets learning and stable counts,
// and the card tile counts items, not just notes.

interface Review {
  itemId: string;
  skillId: string;
  correct: boolean;
}

const REVIEWS: readonly Review[] = [
  { itemId: 'octave:s6f3→s4', skillId: 'C1.octaves', correct: true },
  { itemId: 'octave:s5f2→s3', skillId: 'C1.octaves', correct: true },
  { itemId: 'interval-name:M3@s6→s5', skillId: 'C3.thirds', correct: true },
  // A miss is stored but isn't learning: the count stays honest.
  { itemId: 'interval:P5@s6→s5', skillId: 'C3.thirds', correct: false },
];

/** Store a reviewed card and its review log for each item, as a session would. */
async function seedReviews(page: Page, reviews: readonly Review[]): Promise<void> {
  await page.evaluate(async (reviews) => {
    const DAY = 86_400_000;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['cards', 'reviewLogs'], 'readwrite');
    const now = Date.now();
    for (const { itemId, skillId, correct } of reviews) {
      // Stability 3 days: reviewed, but short of the stable threshold.
      tx.objectStore('cards').put({
        itemId,
        skillId,
        fsrs: {
          due: new Date(now + DAY),
          stability: 3,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 1,
          learning_steps: 0,
          reps: 1,
          lapses: correct ? 0 : 1,
          state: correct ? 2 : 3,
          last_review: new Date(now - 60_000),
        },
        createdAt: new Date(now - 60_000),
        lastReviewedAt: new Date(now - 60_000),
      });
      tx.objectStore('reviewLogs').add({
        itemId,
        skillId,
        drillType: itemId.startsWith('octave') ? 'octave-finder' : 'interval-name',
        correct,
        responseMs: 1500,
        rating: correct ? 3 : 1,
        hintUsed: false,
        answerGiven: '',
        at: new Date(now - 60_000),
        uid: crypto.randomUUID(),
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, reviews);
}

async function openProgressWithReviews(page: Page): Promise<void> {
  await freshStart(page);
  await seedReviews(page, REVIEWS);
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await expect(page.getByTestId('topics-panel')).toHaveAttribute('data-loaded', 'true');
}

test.describe('M2-19 topic progress', () => {
  test('lists Whole neck and Intervals, titled as on Learn, with learning and stable counts @smoke', async ({
    page,
  }) => {
    await openProgressWithReviews(page);
    const panel = page.locator('[data-progress-panel="topics"]');
    await expect(panel.getByRole('heading', { name: 'Modules', level: 2 })).toBeVisible();

    // Octaves is a topic of Learn's Whole neck module (M10-09).
    const neck = panel.getByTestId('progress-module-notes-2');
    await expect(neck.getByRole('heading', { name: 'Whole neck' })).toBeVisible();
    await expect(neck.getByTestId('topic-counts')).toHaveText(/^2 learning · 0 stable of \d+$/);
    await expect(neck.getByRole('img')).toHaveAccessibleName(
      /^Whole neck: [1-9]\d*% learning, 0% stable$/,
    );
    await expect(neck.getByTestId('topic-C1')).toHaveText(
      /^Octaves: 2 learning · 0 stable of \d+$/,
    );

    const intervals = panel.getByTestId('progress-module-intervals');
    await expect(intervals.getByRole('heading', { name: 'Intervals' })).toBeVisible();
    await expect(intervals.getByTestId('topic-counts')).toHaveText(
      /^1 learning · 0 stable of \d+$/,
    );

    // Only started modules are listed, and no count claims the cards are learned.
    await expect(panel.getByTestId(/^progress-module-/)).toHaveCount(2);
    await expect(
      panel
        .getByRole('list')
        .first()
        .getByText(/learned|mastered/i),
    ).toHaveCount(0);
    await expect(panel.getByTestId('learning-legend')).toBeVisible();

    await expect(page.getByText('Cards practised', { exact: true })).toBeVisible();
    await expect(page.getByTestId('card-count')).toHaveText(String(REVIEWS.length));
    await expectNoHorizontalOverflow(page);
  });

  test('a fresh learner sees a prompt, not empty topics', async ({ page }) => {
    await freshStart(page, '/progress');
    const panel = page.getByTestId('topics-panel');
    await expect(panel).toHaveAttribute('data-loaded', 'true');
    await expect(panel.getByText(/Practise a session/)).toBeVisible();
    await expect(panel.getByRole('listitem')).toHaveCount(0);
  });
});
