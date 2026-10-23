import { expect, test, type Page } from '@playwright/test';
import { freshStart, masterSkills } from './helpers';

async function openProgress(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Progress' })
    .click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
}

test.describe('M10-17 module badges and a fair speed demon', () => {
  test('mastering the pop progressions earns "Song-ready" @smoke', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['C9.pop']);

    const toast = page.getByTestId('achievement-toast');
    await expect(toast).toContainText('Song-ready');
    await toast.getByRole('button', { name: 'Dismiss' }).click();

    await openProgress(page);
    const panel = page.getByRole('region', { name: 'Achievements' });
    await expect(panel.getByTestId('achievement-progressions-song-ready')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
    // One stage is not the whole module.
    await expect(panel.getByTestId('achievement-progressions-all')).toHaveAttribute(
      'data-unlocked',
      'false',
    );
    for (const id of ['chords-built', 'caged-shapes', 'harmony-every-key']) {
      await expect(panel.getByTestId(`achievement-${id}`)).toContainText('Not yet');
    }
    // Speed demon is measured against the learner's own tap time, and says so.
    await expect(panel.getByTestId('achievement-speed-demon')).toContainText(
      'within half a second of your own tap time',
    );
  });
});
