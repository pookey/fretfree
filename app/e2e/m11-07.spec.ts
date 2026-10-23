import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';

// M11-07: the equipped guitar beside the sidebar streak badge, linking to the
// Garage, and a "Your guitar" panel on Progress (design §3.8, §7). Both
// follow the build as parts are equipped.

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

const avatar = (page: Page) => page.getByTestId('sidebar').getByTestId('sidebar-guitar');
const panel = (page: Page) => page.locator('[data-progress-panel="guitar"]');
const panelGuitar = (page: Page) => panel(page).getByRole('img', { name: /^My guitar: / });

test.describe('M11-07 your guitar in the sidebar and on Progress', () => {
  test('the sidebar guitar and the Progress panel follow a newly equipped part', async ({
    page,
  }) => {
    await freshStart(page);
    await seedXp(page, 1000);
    await page.reload();

    // The sidebar shows the starter, named, beside the streak badge.
    await expect(avatar(page)).toHaveAccessibleName('Your guitar: My guitar');
    await expect(avatar(page)).toHaveAccessibleDescription(/^Stratocaster guitar, red,/);
    await expect(page.getByTestId('sidebar-streak')).toBeVisible();

    // Progress previews the same build, its name and the balance.
    await page.getByTestId('sidebar').getByRole('link', { name: 'Progress' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Your guitar' })).toBeVisible();
    await expect(panelGuitar(page)).toHaveAccessibleName(/, red,/);
    await expect(panel(page).getByTestId('progress-guitar-name')).toHaveText('My guitar');
    await expect(panel(page).getByTestId('progress-guitar-balance')).toHaveText(
      '1,000 to spend in the Garage',
    );

    // The sidebar guitar opens the Garage: buy and equip a blue finish.
    await avatar(page).click();
    await expect(page).toHaveURL(/\/progress\/garage$/);
    await expect(page.getByRole('heading', { name: 'Garage', level: 1 })).toBeVisible();
    await page.getByRole('tab', { name: 'Finish' }).click();
    await page.getByRole('button', { name: /^Blue\b/ }).click();
    await page
      .getByTestId('selected-part')
      .getByRole('button', { name: `Buy · ${BLUE_PRICE} XP` })
      .click();
    await expect(page.getByTestId('garage-wallet')).toHaveText(`${1000 - BLUE_PRICE} to spend`);
    await page.getByLabel('Guitar name').fill('Bluebird');
    await page.getByLabel('Guitar name').blur();

    // The sidebar follows at once, with no reload.
    await expect(avatar(page)).toHaveAccessibleDescription(/, blue,/);
    await expect(avatar(page)).toHaveAccessibleName('Your guitar: Bluebird');

    // …and so does Progress, whose "Open the Garage" link leads back.
    await page.getByRole('link', { name: '← Progress' }).click();
    const preview = panel(page).getByRole('img', { name: /^Bluebird: / });
    await expect(preview).toHaveAccessibleName(/, blue,/);
    await expect(panel(page).getByTestId('progress-guitar-name')).toHaveText('Bluebird');
    await expect(panel(page).getByTestId('progress-guitar-balance')).toHaveText(
      `${1000 - BLUE_PRICE} to spend in the Garage`,
    );
    await panel(page).getByRole('link', { name: 'Open the Garage' }).click();
    await expect(page.getByRole('heading', { name: 'Garage', level: 1 })).toBeVisible();
  });

  test('the sidebar guitar fits the sidebar, and shrinks to the body in the icon rail @layout', async ({
    page,
  }, info) => {
    await freshStart(page);
    const iconSidebar = info.project.name === 'ipad-portrait';
    const link = avatar(page);
    await expect(link).toHaveAttribute('data-variant', iconSidebar ? 'icon' : 'full');
    const art = link.locator('svg');
    // The whole guitar beside its name, or the body alone on the rail.
    await expect(art).toHaveAttribute(
      'viewBox',
      iconSidebar ? '-185 300 370 502' : '-185 -200 370 1010',
    );
    if (iconSidebar) await expect(link).not.toContainText('My guitar');
    else await expect(link).toContainText('My guitar');

    const s = (await page.getByTestId('sidebar').boundingBox())!;
    const a = (await link.boundingBox())!;
    const b = (await page.getByTestId('sidebar-streak').boundingBox())!;
    expect(a.x).toBeGreaterThanOrEqual(s.x);
    expect(a.x + a.width).toBeLessThanOrEqual(s.x + s.width);
    // Directly on top of the badge, and a full-size tap target.
    expect(a.y + a.height).toBeLessThanOrEqual(b.y);
    expect(b.y - (a.y + a.height)).toBeLessThan(16);
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(a.width).toBeGreaterThanOrEqual(44);
  });

  test('the phone shows the guitar on Progress, and none in the tab bar @smoke @phone', async ({
    page,
  }) => {
    await freshStart(page, '/progress');
    await expect(panelGuitar(page)).toHaveAccessibleName(/Stratocaster guitar, red,/);
    await expect(page.getByTestId('sidebar-guitar')).toHaveCount(0);
    await panel(page).getByRole('link', { name: 'Open the Garage' }).click();
    await expect(page.getByRole('heading', { name: 'Garage', level: 1 })).toBeVisible();
  });
});
