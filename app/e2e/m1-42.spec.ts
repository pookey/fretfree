import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { focusSession } from './helpers/focus';

// Drill logic (prompt building, grading, choices) loads on demand, like the
// drill views (design §10 first-load budget). Every drill's logic shares one
// chunk (drills/logics.ts), fetched before a session's or placement test's
// first prompt, and never on Today.
const LOGIC_CHUNK = /\/assets\/logics-[^/]+\.js$/;

/** Records every request for the logic chunk, from now on. */
function watchLogicChunk(page: Page): string[] {
  const chunks: string[] = [];
  page.on('request', (r) => {
    if (LOGIC_CHUNK.test(new URL(r.url()).pathname)) chunks.push(r.url());
  });
  return chunks;
}

test.describe('M1-42 drill logic out of first-load JS', () => {
  test('a session loads drill logic once, and prompts and grades as before @smoke', async ({
    page,
  }) => {
    const chunks = watchLogicChunk(page);
    await freshStart(page);
    // Today, before any session: no drill logic has downloaded.
    expect(chunks).toEqual([]);

    await focusSession(page, 'F2.string6-naturals');
    await expect(page.locator('[data-drill="name-the-note"]')).toBeVisible();
    const answers = page.getByRole('group', { name: /highlighted|this is/i }).first();
    await expect(answers.getByRole('button').first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Grading comes from the same chunk: any answer gets feedback.
    await answers.getByRole('button').first().click();
    await expect(page.getByTestId('feedback-bar')).toHaveAttribute(
      'data-state',
      /^(correct|wrong)$/,
    );
    expect(chunks).toHaveLength(1);
  });

  test('the placement test serves its first probe once the drill logic loads', async ({ page }) => {
    const chunks = watchLogicChunk(page);
    await freshStart(page, '/placement');
    await page.getByRole('button', { name: 'Start the test' }).click();
    const dialog = page.getByRole('dialog', { name: 'Placement test' });
    await expect(dialog.getByTestId('placement-probe')).toBeVisible();
    await expect(dialog.getByRole('group').first()).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    expect(chunks).toHaveLength(1);
  });
});
