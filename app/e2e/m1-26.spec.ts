import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch } from './helpers';
import { skipInstallTip } from './helpers/install';

// The reading step of onboarding (design §4): two multi-select questions,
// what the learner already reads and what they want to learn to read.

const choice = (page: Page) => page.getByTestId('onboarding-choice');
const reads = (page: Page) =>
  choice(page).getByRole('group', { name: 'What can you already read?' });
const learn = (page: Page) =>
  choice(page).getByRole('group', { name: 'What would you like to learn to read?' });

async function openReadingStep(page: Page) {
  await firstLaunch(page);
  await choice(page).getByRole('button', { name: 'Get started' }).click();
  for (let n = 1; n <= 3; n++)
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
  await expect(page.getByRole('heading', { name: 'Reading music', level: 1 })).toBeVisible();
}

// The install step (M1-29) has its own spec.
test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M1-26 reading question', () => {
  test('picks several notations to read and to learn, and keeps them @smoke', async ({ page }) => {
    await openReadingStep(page);
    await expect(page.getByText(/teaches the neck by name, position and sound/)).toBeVisible();
    await expect(page.getByText(/is extra/)).toBeVisible();
    await expect(choice(page).getByRole('radio')).toHaveCount(0);
    for (const group of [reads(page), learn(page)]) {
      await expect(group.getByRole('checkbox')).toHaveCount(2);
      await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);

    // Pick-any cards are tall tap targets with a square box, not a round radio ring.
    const card = reads(page).locator('label').first();
    expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const box = card.locator('[aria-hidden="true"]');
    await expect(box).toBeVisible();
    const radius = await box.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe('4px');

    await reads(page).getByRole('checkbox', { name: /^Tab/ }).check();
    await reads(page)
      .getByRole('checkbox', { name: /Standard notation/ })
      .check();
    await learn(page)
      .getByRole('checkbox', { name: /Standard notation/ })
      .check();
    await choice(page).getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'How long is a session?' })).toBeVisible();
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    // Calibration (M1-07) and the placement test (M2-09) have their own specs.
    await expect(page.getByRole('heading', { name: 'Tap the lit dots', level: 1 })).toBeVisible();
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    // A relaunch keeps the picks.
    await page.reload();
    await page.goto('/onboarding');
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    for (let n = 1; n <= 3; n++)
      await choice(page).getByRole('button', { name: 'Continue' }).click();
    await expect(reads(page).getByRole('checkbox', { name: /^Tab/ })).toBeChecked();
    await expect(reads(page).getByRole('checkbox', { name: /Standard notation/ })).toBeChecked();
    await expect(learn(page).getByRole('checkbox', { name: /^Tab/ })).not.toBeChecked();
    await expect(learn(page).getByRole('checkbox', { name: /Standard notation/ })).toBeChecked();
  });

  test('neither is fine, and skipping keeps the defaults', async ({ page }) => {
    await openReadingStep(page);
    const learnTab = learn(page).getByRole('checkbox', { name: /^Tab/ });
    await learnTab.check();
    await learnTab.uncheck();
    await choice(page).getByRole('button', { name: 'Continue' }).click();
    await choice(page).getByRole('button', { name: 'Back' }).click();
    await expect(choice(page).getByRole('checkbox', { checked: true })).toHaveCount(0);

    await learnTab.check();
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    await choice(page).getByRole('button', { name: 'Back' }).click();
    await expect(learnTab).not.toBeChecked();
  });
});
