import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M1-35: the session summary keeps today's accuracy, items learning and items
// that became stable apart, and forecasts the next review (design §3.3 step 5;
// research/02 rules 11 and 15). A strong first session reads as learning, not
// as a 0% that looks untracked.

const SKILL = 'F2.string6-naturals';
const ANSWERS = 3;

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

async function firstSession(page: Page): Promise<void> {
  await freshStart(page);
  await focusSession(page, SKILL);
  for (let n = 0; n < ANSWERS; n++) await answerCorrectly(page);
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByTestId('session-summary')).toBeVisible();
}

const NEXT_REVIEW =
  /today's items come back (tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|on \d{1,2} [A-Z][a-z]+)\.$/;

async function expectLearningSummary(page: Page): Promise<void> {
  await expect(page.getByTestId('summary-accuracy')).toHaveText('100%');
  await expect(page.getByTestId('summary-items')).toHaveText(String(ANSWERS));
  await expect(page.getByTestId('summary-learning')).toHaveText(String(ANSWERS));
  await expect(page.getByTestId('summary-stable')).toHaveText('0');
  const line = page.getByTestId('summary-progress');
  await expect(line).toHaveText(
    new RegExp(`^${ANSWERS} items learning\\. They become stable as you recall them`),
  );
  await expect(line).toHaveText(NEXT_REVIEW);
}

test.describe('M1-35 session summary: learning and stable', () => {
  test('a first session names accuracy, learning and stable apart @layout', async ({ page }) => {
    await firstSession(page);
    await expectLearningSummary(page);
    const stats = page.getByTestId('session-summary').locator('dl');
    await expect(stats.getByRole('term')).toHaveText([
      'Today’s accuracy',
      'Learning',
      'Became stable',
      'XP earned',
    ]);
    // The spacing explanation stays, and Done is in view without scrolling.
    await expect(page.getByTestId('summary-spacing')).toContainText('Come back tomorrow');
    await expect(page.getByRole('link', { name: 'Done' })).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expectNoHorizontalOverflow(page);

    // The summary's learning count is the one Learn shows for the skill.
    await page.getByRole('link', { name: 'Done' }).click();
    await page.goto('/learn');
    await expect(page.locator('[data-loaded="true"]')).toBeVisible();
    await page.getByTestId('module-notes-1').click();
    await expect(
      page.getByTestId('module-detail').getByTestId(`skill-${SKILL}`).getByTestId('skill-progress'),
    ).toHaveText(new RegExp(`^${ANSWERS} learning · 0 stable of \\d+$`));
  });

  test('the summary shows learning and the next review, with Done in view @smoke @layout', async ({
    page,
  }) => {
    await firstSession(page);
    await expectLearningSummary(page);
    // The learning line doesn't push Done below the fold, even held sideways.
    await expect(page.getByRole('link', { name: 'Done' })).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalOverflow(page);
  });
});
