import { expect, test } from '@playwright/test';
import { answer, freshStart, targetNote } from './helpers';

test.describe('D1 "Name the highlighted note" session', () => {
  test('runs a scheduled session, persists answers and survives a reload', async ({ page }) => {
    await freshStart(page);
    await expect(page.getByTestId('new-count')).toHaveText('16');
    await page.getByTestId('start-session').click();

    // First pass: guided worked examples show the note name on the neck.
    await expect(page.getByText(/^This is/)).toBeVisible();

    let answered = 0;
    for (let i = 0; i < 6; i++) {
      const note = await targetNote(page);
      await answer(page, note);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      answered++;
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }

    // A wrong answer shows both positions and waits for Continue.
    const note = await targetNote(page);
    await answer(page, note === 'C' ? 'D' : 'C');
    answered++;
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${note}`);
    await expect(page.getByTestId('marker-correct')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('marker-target')).toBeVisible();

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('session-summary')).toBeVisible();
    await expect(page.getByTestId('summary-items')).toHaveText(String(answered));
    await page.getByRole('link', { name: 'Done' }).click();

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Progress' })
      .click();
    await expect(page.getByTestId('review-count')).toHaveText(String(answered));
    await page.reload();
    await expect(page.getByTestId('review-count')).toHaveText(String(answered));
    await expect(page.getByTestId('card-count')).not.toHaveText('0');
  });

  test('accepts hardware-keyboard answers and Space to continue', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();
    const note = await targetNote(page);
    await page.keyboard.press(note.length === 1 ? note.toLowerCase() : `Shift+${note[0]}`);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();

    await expect(page.getByTestId('feedback-correct')).toBeHidden();
    const next = await targetNote(page);
    await page.keyboard.press(next === 'C' ? 'd' : 'c');
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });
});
