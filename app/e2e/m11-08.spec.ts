import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { seedString6Reviews } from './helpers/guides';

// M11-08: the neck skin (design §3.8). Drills draw the neck in the equipped
// board wood and inlay shape, unless "Use my guitar's neck in drills" is off.

const SKILL = 'F2.string6-naturals';
const neck = (page: Page) => page.locator('svg[data-fret-from]');
// The wood is the neck's first shape; everything else is drawn over it.
const wood = (page: Page) => neck(page).locator(':scope > rect').first();

/** Equip a build straight into storage; the next page load picks it up. */
async function equip(page: Page, board: string, inlay: string): Promise<void> {
  await page.evaluate(
    async ({ board, inlay }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('garage', 'readwrite');
      tx.objectStore('garage').put({
        key: 'singleton',
        name: 'My guitar',
        spec: {
          body: 'body.stratocaster',
          finish: 'finish.red',
          pickguard: 'pickguard.white',
          hardware: 'hardware.chrome',
          board,
          inlay,
        },
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { board, inlay },
  );
}

/** D1 recall prompts on string 6, at guide level 3 so the inlays show. */
async function openD1(page: Page): Promise<void> {
  await focusSession(page, SKILL);
  await expect(page.locator('#drill-prompt')).toHaveText('Name the highlighted note');
}

test.describe('M11-08 neck skin', () => {
  test('a drill draws the neck in maple with block inlays @smoke', async ({ page }) => {
    await freshStart(page);
    await seedString6Reviews(page, 3);
    await equip(page, 'board.maple', 'inlay.blocks');
    await openD1(page);

    await expect(page.locator('html')).toHaveAttribute('data-board', 'maple');
    await expect(neck(page)).toHaveAttribute('data-inlay-style', 'blocks');
    await expect(wood(page)).toHaveCSS('fill', 'rgb(236, 213, 169)');

    const inlays = neck(page).locator('[data-inlay]');
    expect(await inlays.count()).toBeGreaterThan(0);
    for (const tag of await inlays.evaluateAll((els) => els.map((e) => e.tagName))) {
      expect(tag).toBe('polygon');
    }
    await expect(neck(page).locator('[data-inlay="dots"]')).toHaveCount(0);
  });

  test('with the setting off, the neck looks as it always has', async ({ page }) => {
    await freshStart(page);
    await seedString6Reviews(page, 3);
    await equip(page, 'board.maple', 'inlay.blocks');
    await page.goto('/settings');
    const toggle = page.getByRole('checkbox', { name: "Use my guitar's neck in drills" });
    await expect(toggle).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-board', 'maple');
    // The setting saves before the box shows it, so click rather than uncheck().
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('html')).not.toHaveAttribute('data-board');

    await openD1(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-board');
    await expect(neck(page)).toHaveAttribute('data-inlay-style', 'dots');
    await expect(wood(page)).toHaveCSS('fill', 'rgb(74, 47, 34)');
    await expect(neck(page).locator('[data-inlay="blocks"]')).toHaveCount(0);
  });
});
