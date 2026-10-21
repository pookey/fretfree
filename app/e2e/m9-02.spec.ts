import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, F3_SKILLS, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M9-02: D33 "Tab → neck" (docs/design/tab-track.md §6). One note on the tab
// staff; the learner taps that cell on the neck. The first rep of each new
// item is a worked example; after it, nothing marks the cell before the tap.

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const staff = (page: Page) => page.getByTestId('d33-staff');

/** Taps a cell, sliding a compact window to it first. */
async function tapCell(page: Page, string: number, fret: number): Promise<void> {
  const cell = neck(page).locator(`[data-cell="s${string}f${fret}"]`);
  for (let i = 0; i < 4 && (await cell.count()) === 0; i += 1) {
    await page.getByRole('button', { name: 'Higher frets' }).click();
  }
  await cell.click();
}

/** The cell the staff's one note names. */
async function shownCell(page: Page): Promise<{ string: number; fret: number }> {
  const note = staff(page).getByTestId('tab-note');
  return {
    string: Number(await note.getAttribute('data-string')),
    fret: Number(await note.getAttribute('data-fret')),
  };
}

/** A learner past the fret markers, which the tab track builds on, starts on string 1. */
async function startTab(page: Page): Promise<void> {
  await masterSkills(page, F3_SKILLS);
  await focusSession(page, 'TAB.string1');
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'tab-to-neck');
  await expect(page.getByTestId('d33-prompt')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freshStart(page);
});

test.describe('D33 "Tab → neck"', () => {
  test('reads a tab note and taps it on the neck @smoke', async ({ page }) => {
    await startTab(page);

    // The worked example: the line highlighted and named, the cell marked.
    await expect(page.getByTestId('d33-prompt')).toHaveText(
      'This note is on string 1, fret 0. Tap it to continue.',
    );
    await expect(staff(page).getByTestId('tab-note')).toHaveText('0');
    await expect(staff(page).locator('[data-mark="selected"]')).toHaveAttribute('data-string', '1');
    await expect(staff(page).getByTestId('tab-line-name')).toHaveCount(6);
    await expect(neck(page).getByTestId('marker-target')).toHaveAttribute('data-fret', '0');
    await expectNoHorizontalOverflow(page);

    await tapCell(page, 1, 0);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('d33-explain')).toHaveText(
      'The top line is string 1 (e): fret 0 there is E.',
    );
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '0');
  });

  test('hides the cell once the worked examples are done, and explains a misread line', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await startTab(page);

    // The first block's worked examples: tap each shown cell.
    for (let i = 0; i < 6; i += 1) {
      const guided = (await page.getByTestId('d33-prompt').textContent())?.startsWith('This note');
      if (!guided) break;
      const { string, fret } = await shownCell(page);
      await tapCell(page, string, fret);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }

    // Independent: nothing on the neck or the staff marks the answer.
    await expect(page.getByTestId('d33-prompt')).toHaveText('Tap this note on the neck');
    await expect(neck(page).locator('[data-testid^="marker-"]')).toHaveCount(0);
    await expect(staff(page).locator('[data-mark]')).toHaveCount(0);
    await expect(staff(page)).toHaveAttribute('role', 'img');
    await expect(staff(page)).toHaveAttribute(
      'aria-label',
      /^Tab, 6 lines: one note on the top line/,
    );

    // Reading it upside down: the bottom string at the same fret.
    const { fret } = await shownCell(page);
    await tapCell(page, 6, fret);
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('d33-explain')).toContainText('reads the tab upside down');
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute('data-string', '1');
    await expect(neck(page).getByTestId('marker-wrong')).toHaveAttribute('data-string', '6');
    await expect(staff(page).locator('[data-mark="wrong"]')).toHaveAttribute('data-string', '6');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('answers from the keyboard', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await startTab(page);
    const { fret } = await shownCell(page);
    await page.keyboard.press('ArrowRight');
    for (let f = 0; f < fret; f += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });
});
