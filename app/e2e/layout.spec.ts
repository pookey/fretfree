import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// iPad-first layout system (design §7).
test.describe('iPad layout', () => {
  test('uses the right shell for the size class', async ({ page }, info) => {
    await freshStart(page);
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();
    await expect(page.getByTestId('tabbar')).toHaveCount(0);
    if (info.project.name === 'ipad-portrait') {
      // Regular: the sidebar collapses to icons; the context panel sits below.
      await expect(sidebar.getByText('Learn', { exact: true })).toHaveCount(0);
    } else {
      await expect(sidebar.getByText('Learn', { exact: true })).toBeVisible();
      const main = await page.getByRole('heading', { name: 'Today' }).boundingBox();
      const ctx = await page.getByTestId('context-panel').boundingBox();
      expect(ctx!.x).toBeGreaterThan(main!.x);
    }
    await expect(page.getByTestId('context-panel')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('sessions show the whole neck on iPad', async ({ page }, info) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();
    const neck = page.locator('svg[data-fret-from]');
    await expect(neck).toBeVisible();
    const expectedTo = info.project.name === 'ipad-portrait' ? '12' : '15';
    await expect(neck).toHaveAttribute('data-fret-from', '0');
    await expect(neck).toHaveAttribute('data-fret-to', expectedTo);

    // Every fret cell is at least 44pt in both directions.
    const sizes = await page
      .locator('[data-cell^="s1f"]')
      .evaluateAll((cells) =>
        cells.map((c) => c.getBoundingClientRect()).map((r) => [r.width, r.height]),
      );
    for (const [w, h] of sizes) {
      expect(w).toBeGreaterThanOrEqual(44);
      expect(h).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
  });
});
