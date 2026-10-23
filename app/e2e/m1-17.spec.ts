import { expect, test, type Page } from '@playwright/test';
import {
  F1_SKILLS,
  answer,
  expectNoHorizontalOverflow,
  freshStart,
  masterSkills,
  targetNote,
} from './helpers';
import { C4_SKILLS, I3_SKILLS } from './helpers/keys';

// M1-17: multi-drill sessions, worked example → faded → independent reps,
// and the time budget (design §3.3).

const timeLeft = (page: Page) => page.getByRole('timer', { name: 'Time left in session' });

/** Answer a D1 prompt correctly and wait for the auto-advance. */
async function nameCorrectly(page: Page): Promise<string> {
  const note = await targetNote(page);
  await answer(page, note);
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return note;
}

async function startNoteSession(page: Page): Promise<void> {
  await freshStart(page);
  // Skip the F1 note-wheel skills so the session starts on string 6, and Keys,
  // which open with F1 and would take the goal lane's share (M10-03).
  await masterSkills(page, [...F1_SKILLS, ...C4_SKILLS, ...I3_SKILLS]);
  await page.getByTestId('start-session').click();
}

test.describe('M1-17 multi-drill sessions', () => {
  test('a new block is named (D1), then found (D2): the same facts in both directions', async ({
    page,
  }) => {
    await startNoteSession(page);
    await expect(timeLeft(page)).toHaveText('10 min left');

    // Worked examples: the answer is on the neck for the first pass.
    const named: string[] = [];
    for (let i = 0; i < 4; i++) {
      await expect(page.getByText(/^This is/)).toBeVisible();
      named.push(await nameCorrectly(page));
    }
    expect(named).toEqual(['E', 'F', 'G', 'A']);
    // Then three independent passes: recall, with the answer off the neck.
    for (let i = 0; i < 12; i++) {
      await expect(page.getByText('Name the highlighted note')).toBeVisible();
      await nameCorrectly(page);
    }

    // The partner block asks the same four facts the other way round, on the neck.
    const prompt = page.getByTestId('d2-prompt');
    await expect(prompt).toHaveText('This is E on string 6. Tap it to continue.');
    await page.locator('[data-cell="s6f0"]').click();
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ E');
    await expect(prompt).toHaveText('This is F on string 6. Tap it to continue.');
    await expectNoHorizontalOverflow(page);
  });

  test('the session ends at the time budget', async ({ page }) => {
    await page.clock.install();
    await startNoteSession(page);
    await expect(timeLeft(page)).toHaveText('10 min left');
    await nameCorrectly(page);

    await page.clock.fastForward('04:30');
    await expect(timeLeft(page)).toHaveText('6 min left');
    await page.clock.fastForward('05:20');
    await expect(timeLeft(page)).toHaveText('Under 1 min');
    await page.clock.fastForward('00:30');
    await expect(timeLeft(page)).toHaveText('Last one');

    // The prompt on screen can still be answered; then the summary follows.
    await answer(page, await targetNote(page));
    await expect(page.getByTestId('session-summary')).toBeVisible();
    await expect(page.getByTestId('summary-items')).toHaveText('2');
  });

  test('shows the time left on a phone @smoke @phone', async ({ page }) => {
    await startNoteSession(page);
    await expect(timeLeft(page)).toHaveText('10 min left');
    await nameCorrectly(page);
    await expect(timeLeft(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
