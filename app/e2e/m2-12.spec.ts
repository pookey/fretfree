import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// Fretboard explorer v2 (design §7 Explore): pick a key, scale or chord, then
// label it by note name, degree or interval across the whole neck. A chord
// colours its root, 3rd, 5th and 7th by shape as well as colour.

const NOTE_SKILLS =
  '/session?skill=F2.string6-naturals&skill=F2.string5-naturals&skill=C2.string1-naturals&skill=C2.string4-naturals&skill=C2.string3-naturals&skill=C2.string2-naturals&skill=C2.low-accidentals&skill=C2.all-notes';

async function pick(page: Page, root: string, show: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Root' }).selectOption({ label: root });
  await page.getByRole('combobox', { name: 'Show' }).selectOption({ label: show });
}

const marker = (page: Page, style: string, string: number, fret: number) =>
  page.locator(`[data-testid="marker-${style}"][data-string="${string}"][data-fret="${fret}"]`);

/** The fill a marker's shape is painted with. */
const fillOf = (page: Page, style: string) =>
  page
    .locator(`[data-testid="marker-${style}"] :is(circle, rect, polygon)`)
    .first()
    .evaluate((el) => getComputedStyle(el).fill);

test.describe('M2-12 fretboard explorer', () => {
  test('picks a chord, colours its tones across the whole neck and relabels them @layout', async ({
    page,
  }) => {
    await freshStart(page, '/explore');
    const neck = page.getByRole('group', { name: 'C major key across the neck' });
    await expect(neck).toHaveAttribute('data-fret-from', '0');
    await expect(neck).toHaveAttribute('data-fret-to', '15');
    await expect(marker(page, 'root', 5, 3)).toHaveText('C');

    // A key: A minor, by degree.
    await pick(page, 'A', 'Minor key');
    await page.getByText('Degrees', { exact: true }).click();
    await expect(page.getByTestId('explorer-name')).toHaveText('A minor key');
    await expect(marker(page, 'root', 6, 5)).toHaveText('1');
    await expect(marker(page, 'tone', 6, 8)).toHaveText('b3');

    // A chord: G7. Root, 3rd, 5th and 7th each get their own shape and colour.
    await pick(page, 'G', 'Dominant seventh');
    await expect(page.getByTestId('explorer-name')).toContainText('G7');
    await expect(page.getByTestId('explorer-legend')).toHaveText(/Root.*3rd.*5th.*7th/);
    await expect(marker(page, 'root', 6, 3)).toHaveText('R');
    await expect(marker(page, 'third', 6, 7)).toHaveText('3');
    await expect(marker(page, 'fifth', 5, 5)).toHaveText('5');
    await expect(marker(page, 'seventh', 6, 1)).toHaveText('b7');
    await expect(marker(page, 'seventh', 6, 13)).toHaveText('b7');
    await expect(page.getByTestId('marker-tone')).toHaveCount(0);
    await expect(marker(page, 'root', 6, 3).locator('rect')).toHaveCount(1);
    await expect(marker(page, 'third', 6, 7).locator('circle')).toHaveCount(1);
    await expect(marker(page, 'fifth', 5, 5).locator('polygon')).toHaveCount(1);
    await expect(marker(page, 'seventh', 6, 1).locator('polygon')).toHaveCount(1);
    const fills = await Promise.all(
      ['root', 'third', 'fifth', 'seventh'].map((s) => fillOf(page, s)),
    );
    expect(new Set(fills).size).toBe(4);

    await page.getByText('Intervals', { exact: true }).click();
    await expect(marker(page, 'seventh', 6, 1)).toHaveText('m7');
    await expect(marker(page, 'third', 6, 7)).toHaveText('M3');
    await page.getByText('Note names', { exact: true }).click();
    await expect(marker(page, 'seventh', 6, 1)).toHaveText('F');
    await page.getByText('Degrees', { exact: true }).click();

    // iPad keeps neck cells at 44pt or more (design §7).
    const sizes = await page
      .locator('[data-cell^="s6f"]')
      .evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect()));
    expect(sizes).toHaveLength(16);
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    // "Quiz me on this" starts a focused session. A fresh learner hasn't
    // unlocked the interval shapes (rule 7), and D37 doesn't exist yet, so
    // even by degree it quizzes the notes rather than an empty session.
    await expect(page.getByRole('link', { name: 'Quiz me on this' })).toHaveAttribute(
      'href',
      NOTE_SKILLS,
    );
    await page.getByRole('link', { name: 'Quiz me on this' }).click();
    await expect(page).toHaveURL(new RegExp(`${NOTE_SKILLS.replace(/[.?]/g, '\\$&')}$`));
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByText(/^This is/)).toBeVisible();
  });

  test('quizzes the interval shapes once they are unlocked', async ({ page }) => {
    await freshStart(page, '/explore');
    // C3.thirds opens once its prerequisites are mastered; 4ths and 5ths wait for it.
    await masterSkills(page, ['F1.half-steps', 'F1.whole-steps', 'C1.octaves']);
    await pick(page, 'G', 'Dominant seventh');
    await page.getByText('Intervals', { exact: true }).click();
    const quiz = page.getByRole('link', { name: 'Quiz me on this' });
    await expect(quiz).toHaveAttribute('href', '/session?skill=C3.thirds');
    await quiz.click();
    await expect(page).toHaveURL(/\/session\?skill=C3\.thirds$/);
    await expect(page.getByTestId('session')).toBeVisible();
    // A real C3 drill, not an empty session.
    await expect(page.getByTestId('d5-drill')).toBeVisible();
  });

  test('a chord on a phone @smoke @phone', async ({ page }) => {
    await freshStart(page, '/explore');
    await pick(page, 'D', 'Minor seventh');
    await expect(page.getByTestId('explorer-name')).toContainText('Dm7');
    await expect(marker(page, 'root', 5, 5)).toHaveText('D');
    await expect(marker(page, 'seventh', 4, 10)).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('link', { name: 'Quiz me on this' }).click();
    await expect(page.getByTestId('session')).toBeVisible();
  });
});
