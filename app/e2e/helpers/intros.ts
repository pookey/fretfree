import { expect, type Page } from '@playwright/test';

/**
 * Turn concept intros back on (M10-04). `firstLaunch` turns them off so other
 * specs start on their drill; call after it, before the session opens.
 */
export async function enableIntros(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('fretwork.e2e.skipIntros'));
}

/**
 * Tap "Got it" on the concept card. The card ignores taps for a moment after
 * it appears (`engine/config/intros.ts`), so wait until it takes them.
 */
export async function dismissIntro(page: Page): Promise<void> {
  const card = page.getByTestId('concept-card');
  await expect(card).toHaveAttribute('data-ready', 'true');
  await card.getByRole('button', { name: 'Got it' }).click();
  await expect(card).toHaveCount(0);
}
