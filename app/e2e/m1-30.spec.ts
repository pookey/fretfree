import { expect, test, type Page } from '@playwright/test';
import { answer, expectNoHorizontalOverflow, freshStart, targetNote } from './helpers';
import { focusSession } from './helpers/focus';
import { skipInstallTip } from './helpers/install';

// M1-30: streak repair is visible on Today (design §3.7, §7 Today). A broken
// streak shows a card offering a double session within the window; doing it
// restores the streak and the card goes.

// Tuesday 20 October 2026, 09:00 local. The streak last met its goal on
// Sunday, so opening the app settles Monday as missed and breaks it.
const TODAY = '2026-10-20T09:00:00';
const STREAK = 10;
// A 5-minute goal makes the double session 10 minutes: one default session.
const GOAL_MINUTES = 5;
const DOUBLE_MINUTES = 2 * GOAL_MINUTES;
// Each answer counts at most 60 s toward the goal, so wait just over that.
const GAP = '01:01';

const card = (page: Page) => page.getByTestId('streak-repair');

/** A 10-day streak with its goal last met on Sunday, written as earlier sessions left it. */
async function seedStreak(page: Page): Promise<void> {
  await page.evaluate(
    async ({ streak, goal }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('gamification', 'readwrite');
        tx.objectStore('gamification').put({
          key: 'singleton',
          dailyGoalMinutes: goal,
          xpTotal: 500,
          streakCurrent: streak,
          streakLongest: streak,
          lastGoalMetDate: '2026-10-18',
          freezesHeld: 0,
          weekendAmulet: false,
          streakRepairDeadline: null,
          streakBeforeBreak: 0,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { streak: STREAK, goal: GOAL_MINUTES },
  );
  // Opening the app settles Monday: no goal, no freeze, so the streak breaks.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

async function breakStreak(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(TODAY) });
  await freshStart(page);
  await seedStreak(page);
  await expect(page.getByTestId('streak-count')).toHaveText('0');
}

/** Answer D1 prompts a minute apart until the session's time budget ends. */
async function doubleSession(page: Page): Promise<void> {
  await focusSession(page, 'F2.string6-naturals');
  const summary = page.getByTestId('session-summary');
  const feedback = page.getByTestId('feedback-correct');
  for (let i = 0; i < DOUBLE_MINUTES + 5 && !(await summary.isVisible()); i++) {
    await page.clock.fastForward(GAP);
    await answer(page, await targetNote(page));
    await expect(feedback).toBeVisible();
    // Wait for the auto-advance, so the next gap falls between prompts.
    await expect(feedback).toBeHidden();
  }
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('summary-items')).toHaveText(String(DOUBLE_MINUTES));
}

test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M1-30 streak repair', () => {
  // A ten-minute session, answered a minute at a time.
  test.describe.configure({ timeout: 120_000 });

  test('a broken streak offers a repair, and a double session restores it', async ({ page }) => {
    await breakStreak(page);

    await expect(card(page)).toBeVisible();
    await expect(
      card(page).getByRole('heading', { name: `Bring back your ${STREAK}-day streak` }),
    ).toBeVisible();
    await expect(page.getByTestId('streak-repair-copy')).toHaveText(
      `Your ${STREAK}-day streak broke. Practise 2× your goal (${DOUBLE_MINUTES} min in one day) by the end of Wednesday to restore it.`,
    );
    await expect(page.getByTestId('streak-repair-progress')).toHaveText(
      `0 / ${DOUBLE_MINUTES} min today`,
    );
    // Under the hero and the install tip's slot (dismissed here), above quests.
    const order = await page
      .locator('[data-today-card]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-today-card')));
    expect(order.slice(0, 4)).toEqual(['hero', 'install', 'streak-repair', 'quests']);
    await expectNoHorizontalOverflow(page);

    await doubleSession(page);
    await page.goto('/');
    // Today's goal counts once (1), then the repair adds the 10 back.
    await expect(page.getByTestId('streak-count')).toHaveText(String(STREAK + 1));
    await expect(card(page)).toHaveCount(0);
  });

  test('the card goes once the window closes', async ({ page }) => {
    await breakStreak(page);
    await expect(card(page)).toBeVisible();

    // Thursday: Tuesday and Wednesday passed without a double session.
    await page.clock.fastForward('48:00:00');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByTestId('streak-count')).toHaveText('0');
  });

  test('a phone shows the card without overflow @smoke', async ({ page }) => {
    await breakStreak(page);
    await expect(card(page)).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Double session today' })).toHaveAttribute(
      'aria-valuetext',
      `0 of ${DOUBLE_MINUTES} minutes`,
    );
    await expectNoHorizontalOverflow(page);
  });
});
