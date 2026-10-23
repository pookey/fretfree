import { expect, test, type Page } from '@playwright/test';
import { firstLaunch, freshStart } from './helpers';
import { skipInstallTip } from './helpers/install';

// Copy fixes from the screens copy audit (M10-10): the welcome screen points
// to Settings, and the onboarding, Settings and Privacy lines say what they mean.

const choice = (page: Page) => page.getByTestId('onboarding-choice');
const explanation = (page: Page) => page.getByTestId('onboarding-explanation');

/** Skip onboarding steps until the one titled `title`, whatever the order. */
async function skipTo(page: Page, title: string) {
  const heading = page.getByRole('heading', { name: title, level: 1 });
  const progress = page.getByTestId('onboarding-progress');
  for (let i = 0; i < 20 && !(await heading.isVisible()); i++) {
    const step = (await progress.textContent()) ?? '';
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    // Either one means the step moved on (the same wait as m4-10.spec.ts).
    const moved = heading.or(progress.filter({ hasNotText: new RegExp(`^${step}$`) }));
    await expect(moved.first()).toBeVisible();
  }
  await expect(heading).toBeVisible();
}

test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M10-10 copy fixes', () => {
  test('the welcome screen says choices change later in Settings @smoke', async ({ page }) => {
    await firstLaunch(page);
    const lead = choice(page).getByText(/quick questions so your practice fits you/);
    await expect(lead).toContainText('change them later in Settings.');
    await expect(lead).not.toContainText('in Progress');
  });

  test('the onboarding steps describe the hand, the reading track and the placement test', async ({
    page,
  }) => {
    await firstLaunch(page);
    await choice(page).getByRole('button', { name: 'Get started' }).click();

    await expect(page.getByRole('heading', { name: 'Your guitar', level: 1 })).toBeVisible();
    await expect(choice(page).getByRole('radio', { name: /Right-handed/ })).toHaveAccessibleName(
      /You fret with your left hand/,
    );
    await expect(choice(page).getByRole('radio', { name: /Left-handed/ })).toHaveAccessibleName(
      /You fret with your right hand; the neck is drawn mirrored/,
    );

    await skipTo(page, 'Reading music');
    await expect(explanation(page)).toContainText(
      'its reading track moved up (the reading track is coming later)',
    );

    await skipTo(page, 'Already play a bit?');
    await expect(explanation(page)).toContainText(
      'it stops asking about anything you don’t know yet',
    );
  });

  test('Settings explains the tap time, and Privacy names Add to Home Screen', async ({ page }) => {
    await freshStart(page, '/settings');
    await expect(page.getByRole('button', { name: 'Measure' })).toHaveAccessibleDescription(
      'How long a tap takes you on this screen. Answers are timed from here, so a slow screen never counts against you.',
    );

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
    await expect(
      page.getByText(/Whether you dismissed the “Add to Home Screen” hint/),
    ).toBeVisible();
  });
});
