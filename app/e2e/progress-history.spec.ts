import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

/**
 * Five days of D1 answers on string 5, written straight into IndexedDB as
 * sessions would leave them: each day adds a note and answers get faster.
 * Then reload so Progress reads them.
 */
async function seedFiveDays(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const DAY = 86_400_000;
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    let db = await open();
    while (!db.objectStoreNames.contains('cards')) {
      db.close();
      await new Promise((r) => setTimeout(r, 100));
      db = await open();
    }
    const now = Date.now();
    const local = (ms: number) => {
      const d = new Date(ms);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const frets = [0, 2, 3, 5, 7];
    const tx = db.transaction(['cards', 'reviewLogs', 'dailyProgress'], 'readwrite');
    frets.forEach((fret, start) => {
      const itemId = `note@s5f${fret}`;
      // Fret 0 since day 1 (4 days ago), fret 7 only today.
      const daysAgo = 4 - start;
      for (let d = daysAgo; d >= 0; d--) {
        tx.objectStore('reviewLogs').add({
          itemId,
          skillId: 'F2.string5-naturals',
          drillType: 'name-the-note',
          correct: true,
          responseMs: 1200 + d * 500,
          rating: 3,
          hintUsed: false,
          answerGiven: '?',
          at: new Date(now - d * DAY - 60_000),
        });
      }
      const stability = daysAgo >= 2 ? 8 : 2;
      tx.objectStore('cards').put({
        itemId,
        skillId: 'F2.string5-naturals',
        fsrs: {
          due: new Date(now + (daysAgo >= 2 ? 8 : 1) * DAY),
          stability,
          difficulty: 5,
          elapsed_days: 1,
          scheduled_days: stability,
          learning_steps: 0,
          reps: daysAgo + 1,
          lapses: 0,
          state: 2,
          last_review: new Date(now - 60_000),
        },
        createdAt: new Date(now - daysAgo * DAY - 60_000),
        lastReviewedAt: new Date(now - 60_000),
      });
    });
    for (let d = 4; d >= 0; d--) {
      tx.objectStore('dailyProgress').put({
        date: local(now - d * DAY),
        xp: 30,
        minutes: d === 2 ? 4 : 11,
        goalMet: d !== 2,
        freezeUsed: false,
        questsCompleted: [],
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
}

async function openProgress(page: Page): Promise<void> {
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
}

const region = (page: Page, name: string) => page.getByRole('region', { name });

test.describe('Progress over time', () => {
  test('charts what you know, speed, the week ahead and the calendar', async ({ page }) => {
    await freshStart(page);
    await seedFiveDays(page);
    await openProgress(page);

    const overTime = region(page, 'Over time');
    await expect(overTime.getByTestId('known-headline')).toHaveText(
      /^5 learning, 3 of them stable · up 4 since day 1$/,
    );
    const known = overTime.getByRole('img', { name: /Items you know, by day/ });
    await expect(known).toBeVisible();
    // Hovering a day shows its counts; the same numbers are in a table.
    const chart = overTime.getByTestId('known-chart');
    await chart.locator('svg rect').hover({ position: { x: 2, y: 40 } });
    await expect(chart.getByTestId('known-chart-tooltip')).toContainText('Learning: 1');
    await chart.getByText('Show the numbers').click();
    await expect(chart.getByRole('row')).toHaveCount(6);

    await expect(overTime.getByTestId('speed-headline')).toContainText(
      '1.2 s on your latest day · 63% faster than your first day',
    );
    await expect(overTime.getByText(/^Target \d\.\d s$/)).toBeVisible();

    const comingUp = region(page, 'Coming up');
    await expect(comingUp.getByTestId('coming-up-headline')).toHaveText(
      '0 due today · 2 this week',
    );
    await expect(comingUp.getByTestId('recall-if-stopped')).toContainText(/recall about \d+%/);

    const calendar = region(page, 'Practice calendar');
    await expect(calendar.getByTestId('calendar-headline')).toContainText(
      'Practised 5 of the last 7 days',
    );
    await expect(calendar.locator('[data-level="3"][data-testid^="calendar-"]')).toHaveCount(4);

    // The mastery map rewinds to day 1, when only one note had been met.
    const map = region(page, 'Mastery map');
    await expect(map.getByTestId('heat-tile')).toHaveCount(5);
    await map.getByTestId('heatmap-as-of').fill('0');
    await expect(map.getByTestId('heat-tile')).toHaveCount(1);
    await expect(map.getByTestId('heatmap-as-of-date')).not.toHaveText('Today');

    await expectNoHorizontalOverflow(page);
  });

  test('fits a phone @smoke @layout @phone', async ({ page }) => {
    await freshStart(page);
    await seedFiveDays(page);
    await openProgress(page);
    await expect(
      region(page, 'Over time').getByRole('img', { name: /Items you know/ }),
    ).toBeVisible();
    await expect(region(page, 'Coming up').getByRole('img')).toBeVisible();
    await expect(region(page, 'Practice calendar').getByRole('table')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
