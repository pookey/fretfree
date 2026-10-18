import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M1-11: the Today hero (streak, daily-goal ring, freezes) and the sidebar
// streak badge (design §7 Today, §3.7).

interface Seed {
  streak: number;
  freezes: number;
  minutesToday: number;
}

/** Write gamification state straight into IndexedDB, then reload so the app reads it. */
async function seed(page: Page, { streak, freezes, minutesToday }: Seed): Promise<void> {
  // Wait for the app to have created its database.
  await expect(page.getByTestId('goal-ring').first()).toBeVisible();
  await page.evaluate(
    async ({ streak, freezes, minutesToday }) => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['gamification', 'dailyProgress'], 'readwrite');
      tx.objectStore('gamification').put({
        key: 'singleton',
        dailyGoalMinutes: 10,
        streakCurrent: streak,
        streakLongest: streak,
        freezesHeld: freezes,
      });
      tx.objectStore('dailyProgress').put({
        date: today,
        xp: 0,
        minutes: minutesToday,
        goalMet: minutesToday >= 10,
        freezeUsed: false,
        questsCompleted: [],
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { streak, freezes, minutesToday },
  );
  await page.reload();
}

const hero = (page: Page) => page.getByRole('region', { name: 'Streak and daily goal' });

test.describe('M1-11 Today hero and sidebar streak', () => {
  test('the hero shows the streak, goal ring and freezes beside the due and new counts', async ({
    page,
  }) => {
    await freshStart(page);
    await expect(hero(page).getByTestId('streak-count')).toHaveText('0');
    await expect(
      hero(page).getByRole('img', { name: 'Daily goal: 0 of 10 minutes' }),
    ).toBeVisible();
    await expect(hero(page).getByTestId('freezes')).toHaveText('No streak freezes held');
    await expect(page.getByTestId('due-count')).toHaveText(/^\d+$/);
    await expect(page.getByTestId('new-count')).toHaveText(/^\d+$/);

    await seed(page, { streak: 7, freezes: 2, minutesToday: 6 });
    await expect(hero(page).getByTestId('streak-count')).toHaveText('7');
    await expect(
      hero(page).getByRole('img', { name: 'Daily goal: 6 of 10 minutes' }),
    ).toHaveAttribute('data-progress', '0.60');
    await expect(hero(page).getByTestId('freezes')).toContainText('2 streak freezes held');
    await expect(hero(page).getByTestId('goal-copy')).toHaveText(/4 min to go/);
    // The ring and the streak share a row, even in the narrow iPad mini column.
    const ring = (await hero(page).getByTestId('goal-ring').boundingBox())!;
    const count = (await hero(page).getByTestId('streak-count').boundingBox())!;
    expect(count.x).toBeGreaterThan(ring.x + ring.width);
    expect(count.y).toBeLessThan(ring.y + ring.height);

    await seed(page, { streak: 8, freezes: 2, minutesToday: 12 });
    await expect(
      hero(page).getByRole('img', { name: 'Daily goal met: 12 of 10 minutes' }),
    ).toHaveAttribute('data-met', 'true');
    await expect(hero(page).getByTestId('goal-copy')).toHaveText(/come back tomorrow/i);
    await expectNoHorizontalOverflow(page);
  });

  test('the iPad sidebar always shows the streak and ring, compact in the icon sidebar', async ({
    page,
  }, info) => {
    await freshStart(page);
    await seed(page, { streak: 105, freezes: 1, minutesToday: 3 });
    const sidebar = page.getByTestId('sidebar');
    const badge = sidebar.getByTestId('sidebar-streak');
    const iconSidebar = info.project.name === 'ipad-portrait';

    // On every section, not just Today.
    for (const section of ['Learn', 'Explore', 'Progress', 'Today']) {
      await sidebar.getByRole('link', { name: section }).click();
      await expect(page.getByRole('heading', { level: 1, name: section })).toBeVisible();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAccessibleName(
        '105-day streak. Daily goal: 3 of 10 minutes. 1 streak freeze held',
      );
      await expect(badge.getByTestId('sidebar-streak-count')).toHaveText('105');
      await expect(badge.getByRole('img', { name: 'Daily goal: 3 of 10 minutes' })).toBeVisible();
    }

    await expect(badge).toHaveAttribute('data-variant', iconSidebar ? 'icon' : 'full');
    if (iconSidebar) await expect(badge).not.toContainText('min today');
    else await expect(badge).toContainText('3/10 min today');

    // The badge fits inside the sidebar, collapsed or not.
    const s = (await sidebar.boundingBox())!;
    const b = (await badge.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(s.x);
    expect(b.x + b.width).toBeLessThanOrEqual(s.x + s.width);
    expect(b.y + b.height).toBeLessThanOrEqual(s.y + s.height);
    // …and a 3-digit streak fits inside the badge.
    const c = (await badge.getByTestId('sidebar-streak-count').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(b.x);
    expect(c.x + c.width).toBeLessThanOrEqual(b.x + b.width);
    await expectNoHorizontalOverflow(page);
  });

  test('the ring animates, and holds still under reduced motion', async ({ page }) => {
    await freshStart(page);
    await seed(page, { streak: 1, freezes: 0, minutesToday: 5 });
    const fill = hero(page).locator('[data-testid="goal-ring"] circle').nth(1);
    const motion = () =>
      fill.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { animation: cs.animationName, transition: cs.transitionDuration };
      });
    const moving = await motion();
    expect(moving.animation).toContain('draw-in');
    expect(parseFloat(moving.transition)).toBeGreaterThan(0.1);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(fill).toBeVisible();
    const still = await motion();
    expect(still.animation).toBe('none');
    expect(parseFloat(still.transition)).toBeLessThanOrEqual(0.001);
  });

  test('the phone shows the hero, with no streak in the tab bar @smoke', async ({ page }) => {
    await freshStart(page);
    await seed(page, { streak: 3, freezes: 1, minutesToday: 2 });
    await expect(hero(page).getByTestId('streak-count')).toHaveText('3');
    await expect(
      hero(page).getByRole('img', { name: 'Daily goal: 2 of 10 minutes' }),
    ).toBeVisible();
    await expect(page.getByTestId('start-session')).toBeVisible();
    if (await page.getByTestId('tabbar').isVisible()) {
      await expect(page.getByTestId('tabbar').getByTestId('sidebar-streak')).toHaveCount(0);
      await expect(page.getByTestId('sidebar-streak')).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);
  });
});
