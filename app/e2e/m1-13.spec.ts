import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

interface Seed {
  mastered?: string[];
  streakLongest?: number;
}

/**
 * Write mastery and streak state straight into IndexedDB, as if sessions had
 * earned it, then reload so the app checks achievements against it.
 */
async function seed(page: Page, { mastered = [], streakLongest = 0 }: Seed): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await page.evaluate(
    async ({ mastered, streakLongest }) => {
      // Wait for the app to have created its schema.
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('fretwork');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      let db = await open();
      while (!db.objectStoreNames.contains('skillStates')) {
        db.close();
        await new Promise((r) => setTimeout(r, 100));
        db = await open();
      }
      const tx = db.transaction(['skillStates', 'gamification'], 'readwrite');
      for (const skillId of mastered) {
        tx.objectStore('skillStates').put({
          skillId,
          status: 'mastered',
          guideLevel: 0,
          rollingAccuracy: 0.95,
        });
      }
      tx.objectStore('gamification').put({
        key: 'singleton',
        dailyGoalMinutes: 10,
        xpTotal: 0,
        streakCurrent: streakLongest,
        streakLongest,
        lastGoalMetDate: null,
        freezesHeld: 0,
        weekendAmulet: false,
        streakRepairDeadline: null,
        streakBeforeBreak: 0,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { mastered, streakLongest },
  );
  await page.reload();
}

async function openProgress(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Progress' })
    .click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
}

test.describe('M1-13 achievements', () => {
  test('mastery and streak milestones unlock once, toast, and fill the Progress panel', async ({
    page,
  }) => {
    await freshStart(page);
    await openProgress(page);
    const panel = page.getByRole('region', { name: 'Achievements' });
    await expect(panel.getByTestId('achievement-tally')).toHaveText('0 of 14 unlocked');
    await expect(panel.getByRole('listitem')).toHaveCount(14);
    await expect(page.getByTestId('achievement-toast')).toHaveCount(0);

    await page.goto('/');
    await seed(page, { mastered: ['F2.string6-naturals'], streakLongest: 7 });

    const toast = page.getByRole('status').filter({ hasText: 'achievements unlocked' });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('2 achievements unlocked');
    await expect(toast).toContainText('String 6 master');
    await expect(toast).toContainText('7-day streak');
    await expectNoHorizontalOverflow(page);
    await toast.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('achievement-toast')).toHaveCount(0);

    await openProgress(page);
    await expect(panel.getByTestId('achievement-tally')).toHaveText('2 of 14 unlocked');
    await expect(panel.getByTestId('achievement-string-6-master')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
    await expect(panel.getByTestId('achievement-string-6-master')).toContainText('Unlocked');
    await expect(panel.getByTestId('achievement-streak-7')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
    // Practising is not mastery, and a 7-day streak is not a 30-day one.
    await expect(panel.getByTestId('achievement-whole-neck')).toHaveAttribute(
      'data-unlocked',
      'false',
    );
    await expect(panel.getByTestId('achievement-streak-30')).toContainText('Not yet');
    await expectNoHorizontalOverflow(page);

    // Unlocks persist and are announced only once.
    await page.reload();
    await expect(panel.getByTestId('achievement-tally')).toHaveText('2 of 14 unlocked');
    await expect(page.getByTestId('achievement-toast')).toHaveCount(0);
  });

  test('a phone shows the unlock toast and the badge @smoke @layout @phone', async ({ page }) => {
    await freshStart(page);
    await seed(page, { mastered: ['F2.string5-naturals'] });

    const toast = page.getByTestId('achievement-toast');
    await expect(toast).toContainText('Achievement unlocked');
    await expect(toast).toContainText('String 5 master');
    const box = await toast.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await expectNoHorizontalOverflow(page);
    await toast.getByRole('button', { name: 'Dismiss' }).click();
    await expect(toast).toHaveCount(0);

    await openProgress(page);
    await expect(page.getByTestId('achievement-string-5-master')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
    await expectNoHorizontalOverflow(page);
  });
});
