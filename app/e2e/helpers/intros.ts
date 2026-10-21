import type { Page } from '@playwright/test';

/**
 * Turn concept intros back on (M10-04). `firstLaunch` turns them off so other
 * specs start on their drill; call after it, before the session opens.
 */
export async function enableIntros(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('fretwork.e2e.skipIntros'));
}
