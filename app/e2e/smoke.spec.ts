import { expect, test } from '@playwright/test';
import { answer, expectNoHorizontalOverflow, freshStart, targetNote } from './helpers';

test.describe('smoke @smoke', () => {
  test('loads, navigates every section and serves the manifest', async ({ page, request }) => {
    await freshStart(page);
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    for (const section of ['Learn', 'Explore', 'Progress', 'Today']) {
      await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('link', { name: section })
        .click();
      await expect(page.getByRole('heading', { name: section, level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await request.get(href!);
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).name).toBe('Fretwork');
  });

  test('can answer a drill prompt', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();
    const note = await targetNote(page);
    await answer(page, note);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
