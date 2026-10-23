import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { skipInstallTip } from './helpers/install';
import { saveSettings } from './helpers/settings';

// M4-16: a "start with sound" learner with sound off is never graded on a
// sound they can't hear (research/02 §3.7). Ear-find cards aren't served,
// Today's first-day line names what the session will really start with,
// and the path falls back to the neck. With sound on, ear → fretboard still
// leads. The Ear module's copy and test-out match its gate.

const hero = (page: Page) => page.getByRole('region', { name: 'Streak and daily goal' });

/** Start the daily session from Today and wait for its first prompt. */
async function startDaily(page: Page): Promise<void> {
  await hero(page).getByTestId('start-session').click();
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('#drill-prompt')).toBeVisible();
}

test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M4-16 ear cards and sound', () => {
  test('with sound off, a start-with-sound learner starts on the neck @smoke', async ({ page }) => {
    await freshStart(page);
    await saveSettings(page, { startWithSound: true, soundOn: false });
    await expect(hero(page).getByTestId('first-day')).toHaveText(
      'Your first session takes about 10 minutes and starts with the musical alphabet.',
    );
    await startDaily(page);
    await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'note-wheel');
    await expect(page.getByText(/Listen|you hear/)).toHaveCount(0);
  });

  test('with sound off, an ear → fretboard session has nothing to grade', async ({ page }) => {
    await freshStart(page);
    await saveSettings(page, { startWithSound: true, soundOn: false });
    // Focused as "Practise this now" does. With nothing it can serve, the
    // session says so instead of planning an unheard card.
    await page.goto('/session?skill=I6.ear-find');
    await expect(page.getByTestId('session-empty')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('d15-prompt')).toHaveCount(0);
  });

  test('with sound on, ear → fretboard still leads', async ({ page }) => {
    await freshStart(page);
    await saveSettings(page, { startWithSound: true });
    await expect(hero(page).getByTestId('first-day')).toHaveText(
      'Your first session takes about 10 minutes and starts with hear it, find it on the neck.',
    );
    await startDaily(page);
    await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'hear-it-find-it');
    await expect(page.getByTestId('d15-prompt')).toContainText('Listen, then tap it.');
  });

  test('the Ear module says when it opens, and tests out only what placement probes', async ({
    page,
  }) => {
    await freshStart(page, '/learn?module=ear');
    const detail = page.getByTestId('module-detail');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('It opens after your first session');
    await expect(detail).not.toContainText('from your first day');
    const offer = page.getByRole('region', { name: 'Already know this?' });
    await expect(offer).toContainText(
      'Ear opens once you’re practising The musical alphabet and Natural notes on string 6.',
    );
    await expect(offer).not.toContainText('Progressions');
  });
});
