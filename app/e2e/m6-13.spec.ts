import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { answerWhichShape, whichShapeDrill } from './helpers/which-shape';
import { visualiseDrill } from './helpers/visualise';

// M6-13: D21 "Visualise it" is optional mental practice (research/02 rule
// 14). A "Mental practice" setting, on by default, lets the learner switch it
// off; then D21 never takes a turn, and D9 and D10 serve C6's whole-shape
// cards between them.

/** Rule 7 and C6's own order: what the whole-shape skills stand on. */
const PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads', 'C6.triad-cores'];
const SHAPES = ['C', 'A', 'G', 'E', 'D'] as const;

const mentalPractice = (page: Page) => page.getByRole('checkbox', { name: 'Mental practice' });

/**
 * File the major whole-shape cards as due reviews, each last served by D10,
 * so the picker's next turn on each is D21's (C6 lists D9, D10, D21).
 * Reloads.
 */
async function seedShapeReviews(page: Page): Promise<void> {
  await page.evaluate(
    async ({ shapes, prereqs }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates', 'reviewLogs'], 'readwrite');
      const now = Date.now();
      for (const shape of shapes) {
        const itemId = `caged:${shape}-shape@major`;
        tx.objectStore('cards').put({
          itemId,
          skillId: 'C6.major-shapes',
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
          createdAt: new Date(now - 8 * DAY),
          lastReviewedAt: new Date(now - 4 * DAY),
        });
        tx.objectStore('reviewLogs').add({
          itemId,
          skillId: 'C6.major-shapes',
          drillType: 'which-shape',
          correct: true,
          responseMs: 2000,
          rating: 3,
          hintUsed: false,
          answerGiven: '',
          at: new Date(now - 4 * DAY),
        });
      }
      const states = tx.objectStore('skillStates');
      for (const skillId of prereqs) {
        states.put({ skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
      }
      states.put({
        skillId: 'C6.major-shapes',
        status: 'practising',
        guideLevel: 1,
        rollingAccuracy: 0.85,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { shapes: SHAPES, prereqs: PREREQS },
  );
  await page.reload();
}

test.describe('M6-13 mental practice is optional', () => {
  test('is on by default, and switches off and stays off @smoke', async ({ page }) => {
    await freshStart(page, '/settings');
    const box = mentalPractice(page);
    await expect(box).toBeChecked();
    await expect(box).toHaveAccessibleDescription(/picture a chord shape on a blank neck/);
    await box.click();
    await expect(box).not.toBeChecked();
    await page.reload();
    await expect(mentalPractice(page)).not.toBeChecked();
  });

  test('switched off, a C6 whole-shape session never serves D21', async ({ page }) => {
    await freshStart(page);
    await seedShapeReviews(page);

    // On (the default), the cards' next turn is D21's.
    await focusSession(page, 'C6.major-shapes');
    await expect(visualiseDrill(page)).toBeVisible();

    await page.goto('/settings');
    await mentalPractice(page).click();
    await expect(mentalPractice(page)).not.toBeChecked();

    // Off, D9 and D10 serve every prompt, the whole session through.
    await focusSession(page, 'C6.major-shapes');
    const d9 = page.getByTestId('d9-drill');
    const summary = page.getByTestId('session-summary');
    const end = page.getByRole('button', { name: 'End session' });
    let served = 0;
    for (let i = 0; i < 12; i++) {
      await expect(d9.or(whichShapeDrill(page)).or(visualiseDrill(page)).or(summary)).toBeVisible();
      await expect(visualiseDrill(page)).toHaveCount(0);
      if (await summary.isVisible()) break;
      served++;
      if (await answerWhichShape(page)) continue;
      // D9: end the round with nothing built; the card comes back for D10.
      await d9.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByTestId('feedback-wrong')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('feedback-wrong')).toBeHidden();
    }
    // Every seeded card was served at least once, none by D21.
    expect(served).toBeGreaterThanOrEqual(SHAPES.length);
    if (await end.isVisible()) await end.click();
    await expect(visualiseDrill(page)).toHaveCount(0);
  });
});
