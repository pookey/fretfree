import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M1-34: progress before mastery (design §3.4, §3.7, §7 Learn; research/02
// rule 15). Same-day practice can't make an item stable, so a first session
// lights the rings' learning layer while stable stays at 0.

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

/** A short focused session: a few correct answers, then end it and open Learn. */
async function firstSessionThenLearn(page: Page): Promise<void> {
  await freshStart(page);
  await focusSession(page, SKILL);
  for (let n = 0; n < ANSWERS; n++) await answerCorrectly(page);
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByTestId('summary-items')).toHaveText(String(ANSWERS));
  await page.goto('/learn');
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
}

async function expectLearningNotStable(page: Page): Promise<void> {
  const card = page.getByTestId('module-notes-1');
  const ring = card.getByRole('img');
  await expect(ring).toHaveAttribute('data-mastery', '0');
  await expect(ring).not.toHaveAttribute('data-learning', '0');
  await expect(ring).toHaveAccessibleName(/^Neck basics: [1-9]\d*% learning, 0% stable$/);
  await expect(card).toContainText(/[1-9]\d*% learning · 0% stable/);
}

test.describe('M1-34 learning vs stable', () => {
  test('a first session lights the learning layer while stable stays 0', async ({ page }) => {
    await firstSessionThenLearn(page);
    await expectLearningNotStable(page);

    const detail = page.getByTestId('module-detail');
    await expect(detail.getByTestId('module-progress')).toHaveText(
      /^[1-9]\d*% learning · 0% stable$/,
    );
    const skill = detail.getByTestId(`skill-${SKILL}`);
    await expect(skill.getByTestId('skill-progress')).toHaveText(
      new RegExp(`^${ANSWERS} learning · 0 stable of \\d+$`),
    );
    await expect(skill).not.toContainText(/learned/i);
    // The learning arc is drawn; the stable arc isn't yet.
    const skillRing = skill.getByRole('img');
    await expect(skillRing.locator('circle')).toHaveCount(2);
    await expect(skillRing).toHaveAccessibleName(/% learning, 0% stable$/);
    await expectNoHorizontalOverflow(page);
  });

  test('the map and skill show learning before stable @smoke', async ({ page }) => {
    await firstSessionThenLearn(page);
    await expectLearningNotStable(page);
    await page.getByTestId('module-notes-1').click();
    const skill = page.getByTestId('module-detail').getByTestId(`skill-${SKILL}`);
    await expect(skill.getByTestId('skill-progress')).toHaveText(
      new RegExp(`^${ANSWERS} learning · 0 stable of \\d+$`),
    );
    await expectNoHorizontalOverflow(page);
  });
});
