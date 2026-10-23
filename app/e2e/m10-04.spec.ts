import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { dismissIntro, enableIntros } from './helpers/intros';

// M10-04: a new skill's concept intro, before its first worked rep
// (research/02 rule 8), shown once per skill.

const card = (page: Page) => page.getByTestId('concept-card');
const workedPrompt = (page: Page) => page.locator('#drill-prompt');

/** Tap the note the worked rep names ("… Tap G to continue."). */
async function answerWorkedRep(page: Page): Promise<void> {
  await expect(workedPrompt(page)).toContainText('to continue.');
  const note = (await workedPrompt(page).locator('strong').textContent())!;
  await page
    .getByRole('group', { name: /to continue/ })
    .getByRole('button', { name: note, exact: true })
    .click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await enableIntros(page);
});

test('a first session opens with the alphabet intro, then the worked rep; the next one does not @smoke @layout', async ({
  page,
}) => {
  await focusSession(page, 'F1.alphabet');
  const intro = page.getByRole('region', { name: 'The musical alphabet' });
  await expect(intro).toBeVisible();
  await expect(intro).toHaveAttribute('data-intro', 'f1-alphabet');
  await expect(intro).toContainText('Music uses seven letters, A to G');
  await expect(intro.getByTestId('note-wheel')).toBeVisible();
  await expect(intro.getByRole('button', { name: 'Got it' })).toBeInViewport();
  // Nothing to answer yet: the drill waits behind the card.
  await expect(workedPrompt(page)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await dismissIntro(page);
  await answerWorkedRep(page);

  // A second session goes straight to practice.
  await page.getByRole('button', { name: 'End session' }).click();
  await focusSession(page, 'F1.alphabet');
  await expect(page.locator('[data-drill="note-wheel"]')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test('the card takes focus and Enter dismisses it', async ({ page }) => {
  await focusSession(page, 'F1.alphabet');
  await expect(card(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card(page)).toHaveCount(0);
  await expect(workedPrompt(page)).toContainText('to continue.');
});

test('Space dismisses it, and a neck intro fits the screen @layout', async ({ page }) => {
  await focusSession(page, 'F2.string6-naturals');
  await expect(card(page)).toHaveAttribute('data-intro', 'f2-string6-naturals');
  const neck = card(page).getByRole('group', { name: /String 6: E open/ });
  await expect(neck).toBeVisible();
  await expect(neck.getByTestId('marker-tone')).toHaveCount(8);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press(' ');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('[data-drill]')).toBeVisible();
});

test('a skill’s intro shows once, not before each rep of its block', async ({ page }) => {
  await focusSession(page, 'F1.alphabet');
  await expect(card(page)).toHaveAttribute('data-intro', 'f1-alphabet');
  await expect(card(page)).toHaveAttribute('data-ready', 'true');
  await card(page).click();
  await answerWorkedRep(page);
  // The rest of the alphabet block follows with no card in between.
  await expect(workedPrompt(page)).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});
