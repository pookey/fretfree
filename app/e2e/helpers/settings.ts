import { expect, type Page } from '@playwright/test';

/** Merge fields into the stored settings, as the Settings screen saves them, then reload Today. */
export async function saveSettings(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (fields) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const store = () => db.transaction('settings', 'readwrite').objectStore('settings');
    const row = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const req = store().get('singleton');
      req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    });
    await new Promise<void>((resolve, reject) => {
      const req = store().put({ ...row, ...fields, key: 'singleton' });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  }, patch);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}
