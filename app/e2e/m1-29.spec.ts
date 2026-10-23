import { expect, test, type Page } from '@playwright/test';
import { answer, expectNoHorizontalOverflow, firstLaunch, freshStart, targetNote } from './helpers';
import { focusSession } from './helpers/focus';
import { emulateStandalone } from './helpers/install';

// M1-29: "Add to Home Screen" (design §2, §4, §7). Every project is an iPad or
// iPhone Safari, so onboarding opens with the install step and Today carries
// the same tip, until the app runs standalone or the learner says "Not now".

const choice = (page: Page) => page.getByTestId('onboarding-choice');
const installCard = (page: Page) => page.getByRole('region', { name: 'Install FretFree' });

/** "Step 1 of N" → N. */
async function stepCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('onboarding-progress').textContent()) ?? '';
  return Number(/of (\d+)/.exec(text)?.[1]);
}

test.describe('M1-29 install step and Today card', () => {
  test('onboarding opens with the install step on iPad Safari @layout', async ({ page }, info) => {
    await firstLaunch(page);
    await choice(page).getByRole('button', { name: 'Get started' }).click();

    await expect(page.getByRole('heading', { name: 'Install FretFree', level: 1 })).toBeVisible();
    await expect(page.getByTestId('onboarding-progress')).toHaveText(/^Step 1 of \d+$/);
    const explanation = page.getByTestId('onboarding-explanation');
    for (const reason of ['full screen', 'works offline', 'One tap', 'progress is kept safe'])
      await expect(explanation).toContainText(reason);

    const steps = page.getByTestId('install-steps');
    await expect(steps).toContainText('Tap Share at the top right.');
    await expect(steps).toContainText('Add to Home Screen');
    await expect(page.getByTestId('install-storage')).toContainText(
      'open FretFree from your Home Screen and finish setup there',
    );
    await expectNoHorizontalOverflow(page);

    // Regular-wide: the explanation and the steps sit side by side.
    if (info.project.name !== 'ipad-portrait') {
      const explain = await explanation.boundingBox();
      const pane = await choice(page).boundingBox();
      expect(pane!.x).toBeGreaterThan(explain!.x + explain!.width - 1);
    }

    // Never a gate.
    await choice(page).getByRole('button', { name: 'Continue in the browser' }).click();
    await expect(page.getByRole('heading', { name: 'Your guitar', level: 1 })).toBeVisible();
    await expect(page.getByTestId('onboarding-progress')).toHaveText(/^Step 2 of \d+$/);
    await choice(page).getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Install FretFree', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    // The same tip on Today, under the hero.
    await expect(installCard(page)).toBeVisible();
    await expect(page.locator('[data-today-card]').nth(1)).toHaveAttribute(
      'data-today-card',
      'install',
    );
  });

  test('the Today card gives the tip, and "Not now" sticks @smoke', async ({ page }, info) => {
    await freshStart(page);
    const card = installCard(page);
    await expect(card).toBeVisible();
    const ipad = info.project.name !== 'iphone-smoke';
    await expect(card).toHaveAttribute('data-platform', ipad ? 'ipad' : 'iphone');
    await expect(card).toContainText(
      ipad ? 'Tap Share at the top right.' : 'Tap Share at the bottom of the screen',
    );
    await expect(card).toContainText('Add to Home Screen');
    await expectNoHorizontalOverflow(page);
    // The card sits in the page flow, so the main action stays reachable.
    await page.getByTestId('start-session').click({ trial: true });

    await card.getByRole('button', { name: 'Not now' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(card).toHaveCount(0);

    // Re-running setup on this device skips the step too.
    await page.goto('/onboarding');
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { name: 'Your guitar', level: 1 })).toBeVisible();
    await expect(page.getByTestId('onboarding-progress')).toHaveText(/^Step 1 of \d+$/);
  });

  test('progress in this browser gets an export before installing', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, 'F2.string6-naturals');
    await answer(page, await targetNote(page));
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await page.goto('/');

    const card = installCard(page);
    await expect(card.getByTestId('install-storage')).toContainText('won’t carry over by itself');
    await expect(card).toContainText('Settings → Your data → Import data');
    const download = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Export my progress' }).click();
    expect((await download).suggestedFilename()).toMatch(/^fretfree-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('neither the step nor the card shows in standalone mode', async ({ page }) => {
    // Count the steps in Safari first, then launch "from the Home Screen".
    await firstLaunch(page);
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    const inSafari = await stepCount(page);

    await emulateStandalone(page);
    await page.goto('/onboarding');
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { name: 'Your guitar', level: 1 })).toBeVisible();
    expect(await stepCount(page)).toBe(inSafari - 1);
    await expect(page.getByRole('heading', { name: 'Install FretFree' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Skip setup' }).click();
    for (const section of ['Learn', 'Progress', 'Today']) {
      await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('link', { name: section })
        .click();
      await expect(page.getByRole('heading', { name: section, level: 1 })).toBeVisible();
      await expect(installCard(page)).toHaveCount(0);
    }
    await expect(page.getByRole('complementary', { name: /Install/ })).toHaveCount(0);
  });
});
