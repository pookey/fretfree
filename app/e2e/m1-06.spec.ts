import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch } from './helpers';
import { skipInstallTip } from './helpers/install';

// Onboarding (design §4): first launch routes here, every step is skippable,
// and choices persist to settings and gamification.

const STEPS = [
  'Your guitar',
  'What do you want to play?',
  'Your daily goal',
  'Reading music',
  'Where do you want to start?',
  'How long is a session?',
  'Tap the lit dots',
  'Play on your real guitar?',
  'Already play a bit?',
];

const choice = (page: Page) => page.getByTestId('onboarding-choice');

async function expectStep(page: Page, n: number) {
  await expect(page.getByRole('heading', { name: STEPS[n - 1], level: 1 })).toBeVisible();
  await expect(page.getByTestId('onboarding-progress')).toHaveText(`Step ${n} of ${STEPS.length}`);
}

async function pick(page: Page, name: string | RegExp) {
  await choice(page).getByRole('radio', { name }).check();
}

const readsTab = (page: Page) =>
  choice(page)
    .getByRole('group', { name: 'What can you already read?' })
    .getByRole('checkbox', { name: /^Tab/ });

async function next(page: Page) {
  await choice(page).getByRole('button', { name: 'Continue' }).click();
}

// The install step (M1-29) has its own spec.
test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M1-06 onboarding', () => {
  test('first launch completes onboarding and keeps the choices @smoke @layout', async ({
    page,
  }, info) => {
    await firstLaunch(page);
    await expect(
      page.getByRole('heading', { name: 'Welcome to FretFree', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(/adapts to what you know and what you want, not to a/),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Regular-wide is two-pane: explanation on the left, choice on the right.
    // Narrower windows stack the explanation above the choice.
    const explain = await page.getByTestId('onboarding-explanation').boundingBox();
    const pane = await choice(page).boundingBox();
    if (info.project.name === 'ipad-landscape' || info.project.name === 'ipad-mini-landscape') {
      expect(pane!.x).toBeGreaterThan(explain!.x + explain!.width - 1);
      expect(Math.abs(pane!.y - explain!.y)).toBeLessThan(explain!.height);
    } else {
      expect(pane!.y).toBeGreaterThan(explain!.y + explain!.height - 1);
    }

    await choice(page).getByRole('button', { name: 'Get started' }).click();

    await expectStep(page, 1);
    await pick(page, /Left-handed/);
    await pick(page, /Drop D/);
    await next(page);

    await expectStep(page, 2);
    await pick(page, /Jazz/);
    await next(page);

    await expectStep(page, 3);
    await pick(page, /Intense/);
    await next(page);

    await expectStep(page, 4);
    await readsTab(page).check();
    await expectNoHorizontalOverflow(page);
    await next(page);

    // "Start with sound" (M4-10) has its own spec.
    await expectStep(page, 5);
    await next(page);

    await expectStep(page, 6);
    await pick(page, /15 minutes/);
    await next(page);

    // Calibration (M1-07), the mic (M5-04) and the placement test (M2-09) have their own specs.
    await expectStep(page, 7);
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    await expectStep(page, 8);
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    await expectStep(page, 9);
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('start-session')).toHaveText('Start session (15 min)');

    // A relaunch goes straight to Today.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    // Every choice was stored: re-opening onboarding starts from them.
    await page.goto('/onboarding');
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    await expect(choice(page).getByRole('radio', { name: /Left-handed/ })).toBeChecked();
    await expect(choice(page).getByRole('radio', { name: /Drop D/ })).toBeChecked();
    await next(page);
    await expect(choice(page).getByRole('radio', { name: /Jazz/ })).toBeChecked();
    await next(page);
    await expect(choice(page).getByRole('radio', { name: /Intense/ })).toBeChecked();
    await next(page);
    await expect(readsTab(page)).toBeChecked();
    await next(page);
    await next(page);
    await expect(choice(page).getByRole('radio', { name: /15 minutes/ })).toBeChecked();
  });

  test('the whole flow can be skipped', async ({ page }) => {
    await firstLaunch(page);
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(page.getByTestId('start-session')).toHaveText('Start session (10 min)');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('every step can be skipped, keeping the defaults', async ({ page }) => {
    await firstLaunch(page);
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    for (let n = 1; n <= STEPS.length; n++) {
      await expectStep(page, n);
      await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(page.getByTestId('start-session')).toHaveText('Start session (10 min)');
  });

  test('Back returns to the previous step, and setup can be skipped midway', async ({ page }) => {
    await firstLaunch(page);
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    await pick(page, /Left-handed/);
    await next(page);
    await expectStep(page, 2);
    await choice(page).getByRole('button', { name: 'Back' }).click();
    await expectStep(page, 1);
    await expect(choice(page).getByRole('radio', { name: /Left-handed/ })).toBeChecked();

    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await page.goto('/explore');
    await expect(page.locator('svg[data-fret-from]')).toHaveAttribute('data-handedness', 'left');
  });
});
