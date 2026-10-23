import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M1-38: copy polish from the M2-14 QA. A locked skill lists its
// prerequisites one per line, since titles hold their own "and", and the
// summary's "Became stable" tile reads as a subset of the learning one.

/**
 * Answer whatever note prompt is on screen correctly: D1 names the
 * highlighted note, D2 taps the named note on its string.
 */
async function answerCorrectly(page: Page): Promise<void> {
  const find = page.getByTestId('d2-prompt');
  const named = page.getByTestId('marker-target').first();
  // D2's worked example also marks its targets, so check for its prompt first.
  await expect(find.or(named).first()).toBeVisible();
  if (await find.isVisible()) {
    const [, pc, string] = /(?:Find|This is) ([A-G]) on string (\d)/.exec(
      (await find.textContent()) ?? '',
    )!;
    const fret = Array.from({ length: 13 }, (_, f) => f).find(
      (f) => noteName(Number(string), f) === pc,
    )!;
    await page.locator(`[data-cell="s${string}f${fret}"]`).click();
  } else {
    const note = await targetNote(page);
    await page
      .getByRole('group', { name: /highlighted|this is/i })
      .getByRole('button', { name: note, exact: true })
      .click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

test.describe('M1-38 copy polish', () => {
  test('a locked skill lists its prerequisites one per line', async ({ page }) => {
    await freshStart(page, '/learn?module=intervals');
    await expect(page.locator('[data-loaded="true"]')).toBeVisible();
    const skill = page.getByTestId('module-detail').getByTestId('skill-C3.thirds');
    await expect(skill).toContainText(
      "Preview only. It joins your sessions once you're practising:",
    );
    await expect(
      skill.getByRole('list', { name: 'Prerequisites' }).getByRole('listitem'),
    ).toHaveText(['Half steps: sharps and flats', 'Whole steps', 'Octave shapes']);
    await expectNoHorizontalOverflow(page);
  });

  test('@smoke the stable tile counts within the learning one @layout', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, 'F2.string6-naturals');
    await answerCorrectly(page);
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('session-summary')).toBeVisible();
    await expect(page.getByTestId('summary-learning')).toHaveText('1');
    await expect(page.getByTestId('summary-stable')).toHaveText('0');
    await expect(page.getByTestId('summary-stable-of')).toHaveText('of the 1 learning');
    await expect(page.getByRole('link', { name: 'Done' })).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
});
