import { expect, type Page } from '@playwright/test';

/**
 * Start a focused session on one skill (or several), the way "Practise this
 * now" does: `/session?skill=<id>`. A spec that pins its skill doesn't depend
 * on which drill a fresh session happens to serve first. Call after
 * `freshStart` (or any seeding); the session is on screen when it resolves.
 */
export async function focusSession(page: Page, skillId: string | readonly string[]): Promise<void> {
  const ids = typeof skillId === 'string' ? [skillId] : skillId;
  const query = new URLSearchParams(ids.map((id) => ['skill', id]));
  await page.goto(`/session?${query.toString()}`);
  await expect(page.getByTestId('session')).toBeVisible();
  // The screen renders before the runner has planned and started the session.
  // Wait for that too, or a spec that steps a fake clock next can do it before
  // the session's start time and lose the first answer's minute under load.
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
}
