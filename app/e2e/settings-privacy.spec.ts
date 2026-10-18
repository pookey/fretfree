import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// Settings as its own section (design §7) and the Privacy page.

test.describe('Settings and Privacy', () => {
  test('Settings is a section of its own, and leads to Privacy and back @smoke', async ({
    page,
  }) => {
    await freshStart(page);
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Your guitar' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your data' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page
      .getByRole('region', { name: 'About' })
      .getByRole('link', { name: 'Privacy' })
      .click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
    for (const name of [
      'What stays on your device',
      'What we don’t collect',
      'Hosting',
      'Optional sign-in (not available yet)',
      'Copies hosted by others',
      'Questions',
    ]) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Back to Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  test('every section in the nav keeps a full-size tap target @smoke', async ({ page }) => {
    await freshStart(page);
    const links = page.getByRole('navigation', { name: 'Sections' }).getByRole('link');
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) {
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
  });
});
