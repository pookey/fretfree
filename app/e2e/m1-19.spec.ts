import { expect, test, type Page } from '@playwright/test';
import { F1_SKILLS, answer, freshStart, masterSkills, targetNote } from './helpers';
import { C4_SKILLS, I3_SKILLS } from './helpers/keys';

const swState = (page: Page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return JSON.stringify({
      installing: r?.installing?.state,
      waiting: r?.waiting?.state,
      active: r?.active?.state,
      controlled: navigator.serviceWorker.controller !== null,
    });
  });

/**
 * The first visit: the service worker installs (precaching every asset) and
 * activates. Wait for that before navigating again, because WebKit can leave
 * an install stuck when its page navigates mid-precache.
 */
async function firstVisit(page: Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => swState(page), { timeout: 20_000 }).toContain('"active":"activated"');
}

/** Pages loaded after activation are controlled, so they work offline. */
async function expectControlled(page: Page): Promise<void> {
  await page.reload();
  await expect.poll(() => swState(page)).toContain('"controlled":true');
}

test.describe('M1-19 offline', () => {
  test('a full session runs offline after the first load', async ({ page, context }) => {
    await firstVisit(page);
    await freshStart(page);
    // Keys open with F1 and would take the goal lane's share of new items (M10-03).
    await masterSkills(page, [...F1_SKILLS, ...C4_SKILLS, ...I3_SKILLS]);
    await expectControlled(page);

    await context.setOffline(true);
    await page.clock.install();
    // A cold start and a deep link both come from the precache.
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    await page.getByTestId('start-session').click();
    // A minute per answer spends the 10-minute budget, so the session ends by itself.
    let answered = 0;
    while (!(await page.getByTestId('session-summary').isVisible())) {
      expect(answered).toBeLessThan(20);
      const note = await targetNote(page);
      await page.clock.fastForward('01:00');
      await answer(page, note);
      answered++;
      await expect(
        page.getByTestId('feedback-correct').or(page.getByTestId('session-summary')),
      ).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    await expect(page.getByTestId('summary-items')).toHaveText(String(answered));
    await page.getByRole('link', { name: 'Done' }).click();

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Progress' })
      .click();
    await expect(page.getByTestId('review-count')).toHaveText(String(answered));
    // Still offline: a reload keeps the app and the session's answers.
    await page.reload();
    await expect(page.getByTestId('review-count')).toHaveText(String(answered));
  });

  test('the app reopens offline and every section loads @smoke', async ({ page, context }) => {
    await firstVisit(page);
    await freshStart(page);
    await masterSkills(page, F1_SKILLS);
    await expectControlled(page);
    await context.setOffline(true);
    await page.goto('/');
    for (const section of ['Learn', 'Explore', 'Progress', 'Today']) {
      await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('link', { name: section })
        .click();
      await expect(page.getByRole('heading', { name: section, level: 1 })).toBeVisible();
    }
    await page.getByTestId('start-session').click();
    const note = await targetNote(page);
    await answer(page, note);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });
});
