import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M10-03: a session introduces at most its new-item cap (research/02 rule
// 11). Once the cap is reached and nothing is due, it recalls the new items
// once more, then ends early, says why, and meets the daily goal.

const SKILL = 'F2.string6-naturals';
// Cap, new blocks, a raised cap, the retrieval pass and learning steps: well under this.
const MAX_ANSWERS = 120;

/**
 * Answer whatever note prompt is on screen correctly: D1 names the note, D2
 * taps it. False when the session ended instead.
 */
async function answerCorrectly(page: Page): Promise<boolean> {
  const find = page.getByTestId('d2-prompt');
  const named = page.getByTestId('marker-target').first();
  const summary = page.getByTestId('session-summary');
  // D2's worked example also marks its targets, so check for its prompt first.
  await expect(find.or(named).or(summary).first()).toBeVisible();
  if (await summary.isVisible()) return false;
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
  return true;
}

/** Play a focused session until it ends on its own. */
async function playToTheCap(page: Page): Promise<void> {
  for (let n = 0; n < MAX_ANSWERS; n++) if (!(await answerCorrectly(page))) break;
  await expect(page.getByTestId('session-summary')).toBeVisible();
}

test.describe('M10-03 the new-item cap', () => {
  test.setTimeout(240_000);

  test('a session stops at its cap, says why and meets the daily goal', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, SKILL);
    await playToTheCap(page);
    await expect(page.getByTestId('summary-enough-new')).toHaveText(
      "That's enough new material for today: it sticks better after a sleep.",
    );
    // Fewer new items than the skill has: the cap held some back for another day.
    const answered = Number(await page.getByTestId('summary-items').textContent());
    expect(answered).toBeLessThan(MAX_ANSWERS);
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByText('Daily goal met. Come back tomorrow to keep it.')).toBeVisible();
  });

  test('the reason reads on a phone @smoke @phone', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, SKILL);
    await playToTheCap(page);
    const reason = page.getByTestId('summary-enough-new');
    await expect(reason).toBeVisible();
    await expect(page.getByRole('link', { name: 'Done' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
