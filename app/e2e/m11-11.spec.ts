import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';

// M11-11: the acoustic bodies in the Garage (design §3.8). The five acoustics
// can be tried on, and a body drawn without a pickguard (the classical, the
// Superstrat) says so plainly in the Pickguard tab instead of offering parts
// that would never show.

/** Give the learner `xp` lifetime XP, as earlier sessions would have. */
async function seedXp(page: Page, xp: number): Promise<void> {
  await page.evaluate(async (xpTotal) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('gamification', 'readwrite');
      const store = tx.objectStore('gamification');
      const read = store.get('singleton');
      read.onsuccess = () => store.put({ ...(read.result ?? {}), key: 'singleton', xpTotal });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, xp);
}

async function openGarage(page: Page): Promise<void> {
  await freshStart(page);
  await seedXp(page, 1000);
  await page.goto('/progress/garage');
  await expect(page.getByRole('heading', { name: 'Garage', level: 1 })).toBeVisible();
}

const preview = (page: Page) => page.getByRole('img', { name: /^[^:]+: \w[\w ()]* guitar, / });
const ACOUSTICS = ['Dreadnought', 'Jumbo', 'Parlour', 'Concert \\(OM\\)', 'Classical'];

test.describe('acoustic bodies in the Garage', () => {
  test('tries on each acoustic, and the classical has no pickguard to choose', async ({ page }) => {
    await openGarage(page);
    await page.getByRole('tab', { name: 'Body' }).click();
    const bodies = page.getByRole('list', { name: 'Body parts' });
    for (const name of ACOUSTICS) {
      await bodies.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await expect(preview(page)).toHaveAccessibleName(new RegExp(`: ${name} guitar, `));
    }

    // The classical draws no guard, so the Pickguard tab says so and offers nothing.
    await expect(preview(page)).toHaveAccessibleName(/: Classical guitar, red, no pickguard, /);
    await page.getByRole('tab', { name: 'Pickguard' }).click();
    await expect(page.getByTestId('no-guard-note')).toHaveText('This body has no pickguard.');
    await expect(page.getByRole('list', { name: 'Pickguard parts' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Buy/ })).toHaveCount(0);

    // A steel-string acoustic has a guard: the parts are back.
    await page.getByRole('tab', { name: 'Body' }).click();
    await bodies.getByRole('button', { name: /^Dreadnought/ }).click();
    await page.getByRole('tab', { name: 'Pickguard' }).click();
    await expect(page.getByTestId('no-guard-note')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Pickguard parts' })).toBeVisible();
    await expect(preview(page)).toHaveAccessibleName(/: Dreadnought guitar, red, \w+ pickguard, /);
  });

  test('tries on the classical from the parts sheet on a phone @smoke @layout @phone', async ({
    page,
  }) => {
    await openGarage(page);
    await page.getByRole('button', { name: 'Show parts' }).click();
    const sheet = page.getByTestId('context-sheet');
    await sheet.getByRole('tab', { name: 'Body' }).click();
    await sheet.getByRole('button', { name: /^Classical/ }).click();
    await expect(preview(page)).toHaveAccessibleName(/: Classical guitar, red, no pickguard, /);
    await sheet.getByRole('tab', { name: 'Pickguard' }).click();
    await expect(sheet.getByTestId('no-guard-note')).toBeVisible();
  });
});
