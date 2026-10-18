import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

async function openLearn(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Learn' })
    .click();
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
}

test.describe('M1-16 Learn screen', () => {
  test('two panes: the module map with rings beside the skill detail', async ({ page }) => {
    await freshStart(page);
    await openLearn(page);
    const map = page.getByRole('region', { name: 'Modules' });
    const detail = page.getByTestId('module-detail');
    await expect(map.getByTestId('mastery-ring')).toHaveCount(18);
    await expect(detail.getByRole('heading', { level: 2 })).toHaveText('Neck basics');

    // Side by side: the detail pane starts to the right of the map.
    const m = (await map.boundingBox())!;
    const d = (await detail.boundingBox())!;
    expect(d.x).toBeGreaterThanOrEqual(m.x + m.width - 1);
    expect(Math.abs(d.y - m.y)).toBeLessThan(80);

    // Module cards are comfortable touch targets.
    const card = (await page.getByTestId('module-notes-1').boundingBox())!;
    expect(card.height).toBeGreaterThanOrEqual(44);

    await expect(detail.getByTestId('skill-F2.string6-naturals')).toContainText('Ready');
    await expectNoHorizontalOverflow(page);
  });

  test('locked modules can be previewed', async ({ page }) => {
    await freshStart(page);
    await openLearn(page);
    await page.getByTestId('module-notes-2').click();
    await expect(page).toHaveURL(/\?module=notes-2$/);
    const detail = page.getByTestId('module-detail');
    await expect(detail.getByRole('heading', { level: 2 })).toHaveText('Whole neck');
    await expect(detail.getByTestId('module-state')).toHaveText('Locked: preview');
    await expect(detail.getByTestId('preview-note')).toBeVisible();
    await expect(detail.getByTestId('skill-C2.all-notes')).toContainText('Preview only');
    await expect(page.getByTestId('module-notes-2')).toHaveAttribute('aria-current', 'true');
  });

  test('the goal reorders the map and persists', async ({ page }) => {
    await freshStart(page);
    await openLearn(page);
    const cards = page.getByRole('region', { name: 'Modules' }).getByRole('link');
    await expect(cards.first()).toHaveAttribute('data-testid', 'module-notes-1');
    await page.getByRole('combobox', { name: 'Ordered for your goal' }).selectOption('songs');
    await expect(cards.first()).toHaveAttribute('data-testid', 'module-harmony');
    await page.reload();
    await expect(page.locator('[data-loaded="true"]')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Ordered for your goal' })).toHaveValue(
      'songs',
    );
    await expect(cards.first()).toHaveAttribute('data-testid', 'module-harmony');
  });

  test('opens a module from the map, one pane at a time on phones @smoke', async ({ page }) => {
    await freshStart(page);
    await openLearn(page);
    await expectNoHorizontalOverflow(page);
    await page.getByTestId('module-notes-1').click();
    const detail = page.getByTestId('module-detail');
    await expect(detail.getByRole('heading', { level: 2 })).toHaveText('Neck basics');
    await expectNoHorizontalOverflow(page);
    // Compact (design §7 size classes) shows one pane at a time; iPad keeps both.
    const compact = await page.evaluate(() => innerWidth < 744 || innerHeight < 500);
    const back = page.getByRole('link', { name: '← All modules' });
    if (compact) {
      await expect(page.getByRole('region', { name: 'Modules' })).toHaveCount(0);
      await back.click();
      await expect(page.getByRole('region', { name: 'Modules' })).toBeVisible();
      await expect(detail).toHaveCount(0);
    } else {
      await expect(back).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Modules' })).toBeVisible();
    }
  });
});
