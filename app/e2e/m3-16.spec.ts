import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';

// Explore views load on demand (design §10 first-load budget): the list is
// there at once, each view's chunk downloads when it opens, and the service
// worker's precache covers those chunks so Explore works offline.

const VIEW_CHUNK = /\/assets\/(?:fretboard-explorer|caged|tab-viewer)-[^/]+\.js$/;

const swState = (page: Page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return JSON.stringify({
      active: r?.active?.state,
      controlled: navigator.serviceWorker.controller !== null,
    });
  });

/** Opens every listed view in turn and checks it renders. */
async function openEveryView(page: Page): Promise<void> {
  const list = page.getByRole('navigation', { name: 'Explore views' });
  const titles = await list.getByRole('link').allTextContents();
  expect(titles.slice(0, 1)).toEqual(['Fretboard explorer']);
  expect(titles).toEqual(expect.arrayContaining(['CAGED visualiser', 'Tab viewer']));
  for (const title of titles) {
    await list.getByRole('link', { name: title, exact: true }).click();
    const region = page.getByRole('region', { name: title });
    await expect(region).toBeVisible();
    await expect(region.getByRole('status')).toHaveCount(0);
    await expect(region.getByRole('alert')).toHaveCount(0);
    await expect(region.locator(':scope > *')).not.toHaveCount(0);
  }
  await list.getByRole('link', { name: 'Fretboard explorer' }).click();
  await expect(page.getByTestId('explorer-name')).toBeVisible();
  await list.getByRole('link', { name: 'Tab viewer' }).click();
  await expect(
    page.getByRole('group', { name: 'Tab of an A minor pentatonic lick' }),
  ).toBeVisible();
}

test.describe('M3-16 lazy Explore views', () => {
  test('each view loads only when Explore opens it @smoke', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (VIEW_CHUNK.test(new URL(r.url()).pathname)) chunks.push(r.url());
    });
    await freshStart(page);
    expect(chunks).toEqual([]);

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Explore' })
      .click();
    await expect(page.getByRole('heading', { name: 'Explore', level: 1 })).toBeVisible();
    await openEveryView(page);
    expect(chunks.some((u) => u.includes('/fretboard-explorer-'))).toBe(true);
    expect(chunks.some((u) => u.includes('/tab-viewer-'))).toBe(true);
    expect(chunks.some((u) => u.includes('/caged-'))).toBe(true);
  });

  test('every view opens offline after a first load', async ({ page, context }) => {
    // The first visit installs the service worker, precaching every chunk.
    await page.goto('/');
    await expect.poll(() => swState(page), { timeout: 20_000 }).toContain('"active":"activated"');
    await freshStart(page);
    await page.reload();
    await expect.poll(() => swState(page)).toContain('"controlled":true');

    // Explore has not been opened yet, so its chunks can only come from the precache.
    await context.setOffline(true);
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: 'Explore', level: 1 })).toBeVisible();
    await openEveryView(page);

    // A cold deep link to a view, still offline.
    await page.goto('/explore?view=tab-viewer');
    await expect(
      page.getByRole('group', { name: 'Tab of an A minor pentatonic lick' }),
    ).toBeVisible();
  });
});
