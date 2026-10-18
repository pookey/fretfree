import { expect, test, type Page } from '@playwright/test';
import { F1_SKILLS, answer, freshStart, masterSkills, targetNote } from './helpers';

// M1-10: answers earn XP and daily-goal minutes, the goal flips mid-session,
// and the streak settles at session finish and on app open (design §3.7).

/** Merge `patch` into the stored gamification row, then reload so the app reads it. */
async function seedGamification(page: Page, patch: Record<string, unknown>): Promise<void> {
  await expect(page.getByTestId('goal-ring').first()).toBeVisible();
  await page.evaluate(async (patch) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('gamification', 'readwrite');
    const store = tx.objectStore('gamification');
    const get = store.get('singleton');
    get.onsuccess = () => store.put({ ...get.result, ...patch, key: 'singleton' });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, patch);
  await page.reload();
}

/** A local calendar date `offset` days from today, `YYYY-MM-DD`, as the app computes it. */
async function localDate(page: Page, offset: number): Promise<string> {
  return page.evaluate((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, offset);
}

async function storedDay(page: Page, date: string): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(async (date) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const row = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const req = db.transaction('dailyProgress').objectStore('dailyProgress').get(date);
      req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row;
  }, date);
}

const hero = (page: Page) => page.getByRole('region', { name: 'Streak and daily goal' });

test.describe('M1-10 daily progress wiring', () => {
  test('a session reaches the daily goal and extends the streak @smoke', async ({ page }, info) => {
    await page.clock.install();
    await freshStart(page);
    // Skip the F1 note-wheel skills so the session serves D1 prompts.
    await masterSkills(page, F1_SKILLS);
    await seedGamification(page, { dailyGoalMinutes: 5 });
    await expect(hero(page).getByRole('img', { name: 'Daily goal: 0 of 5 minutes' })).toBeVisible();
    await expect(hero(page).getByTestId('streak-count')).toHaveText('0');

    await page.getByTestId('start-session').click();
    // A minute on each prompt: the fifth answer reaches the 5-minute goal.
    for (let i = 0; i < 5; i++) {
      const note = await targetNote(page);
      await page.clock.fastForward('01:00');
      await answer(page, note);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('summary-items')).toHaveText('5');
    await page.getByRole('link', { name: 'Done' }).click();

    await expect(
      hero(page).getByRole('img', { name: 'Daily goal met: 5 of 5 minutes' }),
    ).toHaveAttribute('data-met', 'true');
    await expect(hero(page).getByTestId('streak-count')).toHaveText('1');
    await expect(hero(page).getByTestId('goal-copy')).toHaveText(/come back tomorrow/i);
    if (info.project.name !== 'iphone-smoke') {
      await expect(page.getByTestId('sidebar-streak-count')).toHaveText('1');
    }

    const today = await storedDay(page, await localDate(page, 0));
    expect(today).toMatchObject({ goalMet: true });
    // Five capped minutes, plus the moments between the last answer and finishing.
    expect(today?.minutes).toBeGreaterThanOrEqual(5);
    expect(today?.minutes).toBeLessThan(6);
    expect(today?.xp).toBeGreaterThan(0);
  });

  test('opening the app settles missed days: a freeze covers one, then the streak breaks', async ({
    page,
  }) => {
    await freshStart(page);
    const lastMet = await localDate(page, -3);
    await seedGamification(page, {
      streakCurrent: 6,
      streakLongest: 6,
      lastGoalMetDate: lastMet,
      freezesHeld: 1,
    });

    // Two missed days: the freeze covers the first, the second breaks the streak.
    await expect(hero(page).getByTestId('streak-count')).toHaveText('0');
    await expect(hero(page).getByTestId('freezes')).toHaveText('No streak freezes held');
    await expect(page.getByTestId('sidebar-streak-count')).toHaveText('0');
    expect(await storedDay(page, await localDate(page, -2))).toMatchObject({ freezeUsed: true });

    // Settling again on the next open changes nothing: no second freeze is burned.
    await page.reload();
    await expect(hero(page).getByTestId('streak-count')).toHaveText('0');
    expect(await storedDay(page, await localDate(page, -2))).toMatchObject({ freezeUsed: true });
  });
});
