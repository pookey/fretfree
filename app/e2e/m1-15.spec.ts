import { expect, test, type Page } from '@playwright/test';
import { answer, freshStart, targetNote, wrongNote } from './helpers';
import { inlayCount, seedString6Reviews, storedGuideLevel } from './helpers/guides';

// M1-15: guide fading within a session, and blind mode (design §3.5).

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const level = (page: Page) => neck(page).getAttribute('data-guide-level');

async function startSession(page: Page): Promise<void> {
  await page.getByTestId('start-session').click();
  await expect(page.locator('#drill-prompt')).toHaveText('Name the highlighted note');
}

/** Answer the D1 prompt quickly and correctly, and wait for the next prompt. */
async function answerFluently(page: Page): Promise<void> {
  await answer(page, await targetNote(page));
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

async function answerWrongly(page: Page): Promise<string> {
  const note = await targetNote(page);
  await answer(page, await wrongNote(note));
  await expect(page.getByTestId('feedback-wrong')).toBeVisible();
  return note;
}

test.describe('M1-15 guide fading', () => {
  test('guides fade after fluent answers and come back after errors, mid-session', async ({
    page,
  }) => {
    await freshStart(page);
    await seedString6Reviews(page, 3);
    await startSession(page);

    // Level 3: the string's naturals are labelled, and none is the answer.
    expect(await level(page)).toBe('3');
    const note = await targetNote(page);
    const ghosts = neck(page).locator('[data-testid="marker-ghost"]');
    expect(await ghosts.count()).toBeGreaterThan(0);
    const texts = await neck(page).locator('[data-testid^="marker-"] text').allTextContents();
    expect(texts).not.toContain(note);
    await expect(neck(page).locator('[data-testid="marker-target"] text')).toHaveCount(0);

    for (let i = 0; i < 5; i++) await answerFluently(page);
    // Level 2: only the root stays highlighted.
    expect(await level(page)).toBe('2');
    await expect(ghosts).toHaveCount(0);

    await answerWrongly(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    expect(await level(page)).toBe('2');
    await answerWrongly(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    expect(await level(page)).toBe('3');
    expect(await ghosts.count()).toBeGreaterThan(0);
  });

  test('a faded level carries over to the next session', async ({ page }) => {
    await freshStart(page);
    await seedString6Reviews(page, 2);
    await startSession(page);
    for (let i = 0; i < 5; i++) await answerFluently(page);
    expect(await level(page)).toBe('1');
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('session-summary')).toBeVisible();
    expect(await storedGuideLevel(page)).toBe(1);
  });
});

test.describe('M1-15 blind mode', () => {
  test('blind mode hides the inlays at level 0, and feedback still names the note @smoke', async ({
    page,
  }) => {
    await freshStart(page, '/progress');
    const blind = page.getByRole('checkbox', { name: 'Blind mode' });
    // The toggle reflects the saved setting, so it flips once the write lands.
    await blind.click();
    await expect(blind).toBeChecked();

    await page.goto('/');
    await seedString6Reviews(page, 0);
    await startSession(page);
    expect(await level(page)).toBe('0');
    expect(await inlayCount(page)).toBe(0);
    await expect(neck(page).locator('text')).toHaveCount(0);

    const note = await answerWrongly(page);
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${note}`);
    await expect(neck(page).locator('[data-testid="marker-correct"] text').first()).toHaveText(
      note,
    );
  });

  test('without blind mode, level 0 keeps the inlays', async ({ page }) => {
    await freshStart(page);
    await seedString6Reviews(page, 0);
    await startSession(page);
    expect(await level(page)).toBe('0');
    expect(await inlayCount(page)).toBeGreaterThan(0);
  });
});
