import { expect, test, type Page } from '@playwright/test';
import { answer, expectNoHorizontalOverflow, freshStart, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// Focused sessions (design §7): "Quiz me on this" in Explore and "Practise
// this now" in Learn. A fresh, unfocused session opens on the F1 note wheel.

const NOTE_SKILLS =
  /\/session\?skill=F2\.string6-naturals&skill=F2\.string5-naturals&skill=C2\.string1-naturals&skill=C2\.string4-naturals&skill=C2\.string3-naturals&skill=C2\.string2-naturals&skill=C2\.low-accidentals&skill=C2\.all-notes$/;

/** Answer the D1 prompt on screen correctly; returns the string it was on. */
async function answerCorrectly(page: Page): Promise<number> {
  const string = Number(await page.getByTestId('marker-target').getAttribute('data-string'));
  await answer(page, await targetNote(page));
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return string;
}

test.describe('M2-11 focused sessions', () => {
  test('"Quiz me on this" in Explore quizzes the notes the explorer shows', async ({ page }) => {
    await freshStart(page, '/explore');
    await page.getByRole('link', { name: 'Quiz me on this' }).click();
    await expect(page).toHaveURL(NOTE_SKILLS);
    await expect(page.getByTestId('session')).toBeVisible();

    // Note naming on the neck, not the note wheel a fresh session leads with.
    await expect(page.getByText(/^This is/)).toBeVisible();
    await expect(page.getByTestId('note-wheel')).toHaveCount(0);
    await answerCorrectly(page);
    await expect(page.getByTestId('marker-target')).toBeVisible();

    // iPad keeps neck cells at 44pt or more (design §7).
    const sizes = await page
      .locator('[data-cell^="s6f"]')
      .evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect()));
    expect(sizes.length).toBeGreaterThan(0);
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
  });

  test('"Practise this now" in Learn serves only that skill', async ({ page }) => {
    await freshStart(page, '/learn?module=notes-1');
    await expect(page.getByTestId('module-detail')).toBeVisible();
    await page
      .getByTestId('skill-F2.string5-naturals')
      .getByRole('link', { name: 'Practise this now' })
      .click();
    await expect(page).toHaveURL(/\/session\?skill=F2\.string5-naturals$/);

    // String 6 leads an unfocused session; this one stays on string 5.
    const strings: number[] = [];
    for (let i = 0; i < 5; i++) strings.push(await answerCorrectly(page));
    expect(new Set(strings)).toEqual(new Set([5]));

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('summary-items')).toHaveText('5');
  });

  test('a focus on several skills and the focusSession helper', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, ['F2.string5-naturals', 'C1.octaves']);
    // C1 is still gated (research/02 rule 7), so string 5 is all there is.
    await expect(page.locator('[data-testid="marker-target"][data-string="5"]')).toBeVisible();
    await expect(page.getByText(/^This is/)).toBeVisible();
  });

  test('"Quiz me on this" on a phone @smoke', async ({ page }) => {
    await freshStart(page, '/explore');
    await page.getByRole('link', { name: 'Quiz me on this' }).click();
    await expect(page).toHaveURL(NOTE_SKILLS);
    await answerCorrectly(page);
    await expectNoHorizontalOverflow(page);
  });
});
