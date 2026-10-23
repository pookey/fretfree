import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';

// M11-06: the Garage (design §3.8, §7 Garage). Tapping a part tries it on for
// free; Buy spends the garage balance and equips it; owned parts re-equip
// for free; the guitar can be named. All of it survives a reload.

const BLUE_PRICE = 350;

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

async function openGarage(page: Page, xp: number): Promise<void> {
  await freshStart(page);
  await seedXp(page, xp);
  await page.goto('/progress/garage');
  await expect(page.getByRole('heading', { name: 'Garage', level: 1 })).toBeVisible();
  await expect(balance(page)).toBeVisible();
}

const balance = (page: Page) => page.getByTestId('garage-wallet');
const preview = (page: Page) => page.getByRole('img', { name: /^[^:]+: \w[\w ]* guitar, / });
const swatch = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}\\b`) });
const selected = (page: Page) => page.getByTestId('selected-part');

test.describe('the Garage', () => {
  test('tries on, buys, re-equips the starter and keeps the build after a reload', async ({
    page,
  }) => {
    await openGarage(page, 1000);
    // A screen under Progress: its nav entry stays highlighted.
    await expect(page.getByRole('link', { name: 'Progress', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(preview(page)).toHaveAccessibleName(/^My guitar: Stratocaster guitar, red,/);
    await expect(balance(page)).toHaveText('1,000 to spend');

    // Try on: the preview changes, nothing is spent.
    await page.getByRole('tab', { name: 'Finish' }).click();
    await swatch(page, 'Blue').click();
    await expect(preview(page)).toHaveAccessibleName(/, blue,/);
    await expect(balance(page)).toHaveText('1,000 to spend');
    await page.getByRole('button', { name: 'Reset to my build' }).click();
    await expect(preview(page)).toHaveAccessibleName(/, red,/);

    // Buy: the balance updates at once, and the part is equipped and owned.
    await swatch(page, 'Blue').click();
    await selected(page)
      .getByRole('button', { name: `Buy · ${BLUE_PRICE} XP` })
      .click();
    await expect(balance(page)).toHaveText(`${1000 - BLUE_PRICE} to spend`);
    await expect(selected(page)).toContainText('Owned');
    await expect(swatch(page, 'Blue')).toContainText('Owned');

    // Re-equip the starter finish: free.
    await swatch(page, 'Red').click();
    await expect(preview(page)).toHaveAccessibleName(/, red,/);
    await expect(balance(page)).toHaveText(`${1000 - BLUE_PRICE} to spend`);

    // Name the guitar; it saves on blur.
    const name = page.getByLabel('Guitar name');
    await name.fill('Big Red');
    await name.blur();
    await expect(preview(page)).toHaveAccessibleName(/^Big Red: /);

    await page.reload();
    await expect(balance(page)).toHaveText(`${1000 - BLUE_PRICE} to spend`);
    await expect(page.getByLabel('Guitar name')).toHaveValue('Big Red');
    await expect(preview(page)).toHaveAccessibleName(/^Big Red: Stratocaster guitar, red,/);
    await page.getByRole('tab', { name: 'Finish' }).click();
    await expect(swatch(page, 'Blue')).toContainText('Owned');
  });

  test('shows prices plainly and links a badge finish to the achievements', async ({ page }) => {
    await openGarage(page, 100);
    await page.getByRole('tab', { name: 'Finish' }).click();
    await swatch(page, 'Blue').click();
    await expect(
      selected(page).getByRole('button', { name: `Buy · ${BLUE_PRICE} XP` }),
    ).toBeDisabled();
    await expect(page.locator('body')).not.toContainText(/afford|not enough/i);

    await swatch(page, 'Gold leaf').click();
    await selected(page).getByRole('link', { name: 'Unlocked by the Whole neck badge' }).click();
    await expect(page).toHaveURL(/\/progress#achievements$/);
    await expect(page.getByRole('heading', { name: 'Achievements', level: 2 })).toBeVisible();
  });

  test('puts the parts panel beside the guitar on iPad, swatches 44pt or more @layout', async ({
    page,
  }) => {
    await openGarage(page, 0);
    const panel = page.getByTestId('context-panel');
    await expect(panel.getByRole('tablist', { name: 'Part categories' })).toBeVisible();
    const stage = await preview(page).boundingBox();
    const box = await panel.boundingBox();
    expect(stage && box).toBeTruthy();
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (wide) {
      // Regular-wide: the context panel, to the right of the guitar.
      expect(box!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width);
      // The whole guitar is on screen beside it.
      expect(stage!.y + stage!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    } else {
      // Regular: the context panel moves below.
      expect(box!.y).toBeGreaterThanOrEqual(stage!.y + stage!.height);
    }
    for (const button of await panel.getByRole('button').all()) {
      const b = await button.boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(b!.width).toBeGreaterThanOrEqual(44);
    }

    // Try on the lowest finish: the panel scrolls to it, but its state stays
    // in view, and beside the panel so does the whole guitar.
    await panel.getByRole('tab', { name: 'Finish' }).click();
    await panel.getByRole('list', { name: 'Finish parts' }).getByRole('button').last().click();
    await expect(selected(page)).toBeInViewport();
    if (wide) {
      const after = await preview(page).boundingBox();
      expect(after!.y).toBeGreaterThanOrEqual(0);
      expect(after!.y + after!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
  });

  test('opens from the balance tile on Progress', async ({ page }) => {
    await freshStart(page);
    await seedXp(page, 500);
    await page.goto('/progress');
    await page.getByRole('link', { name: '500 to spend in the Garage' }).click();
    await expect(page).toHaveURL(/\/progress\/garage$/);
    await expect(page.getByRole('heading', { name: 'Garage', level: 1 })).toBeVisible();
    await expect(balance(page)).toHaveText('500 to spend');
  });

  test('buys a part from the parts sheet on a phone @smoke @layout @phone', async ({ page }) => {
    await openGarage(page, 1000);
    await page.getByRole('button', { name: 'Show parts' }).click();
    const sheet = page.getByTestId('context-sheet');
    await sheet.getByRole('tab', { name: 'Finish' }).click();
    await sheet.getByRole('button', { name: /^Blue\b/ }).click();
    await expect(preview(page)).toHaveAccessibleName(/, blue,/);
    await sheet.getByRole('button', { name: `Buy · ${BLUE_PRICE} XP` }).click();
    await expect(balance(page)).toHaveText(`${1000 - BLUE_PRICE} to spend`);
    await expect(sheet.getByTestId('selected-part')).toContainText('Owned');

    // A swatch low in the sheet keeps its state and Buy in view above it.
    await sheet.getByRole('list', { name: 'Finish parts' }).getByRole('button').last().click();
    await expect(sheet.getByTestId('selected-part')).toBeInViewport();
  });
});
