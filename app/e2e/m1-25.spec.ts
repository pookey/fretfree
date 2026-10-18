import { expect, test, type Page } from '@playwright/test';
import { F1_SKILLS, freshStart, masterSkills, noteName } from './helpers';

// M1-25: a recall prompt must never print its answer on the neck. A fresh
// learner's skill sits at guide level 3, which used to label the target.

const D1_RECALL = 'Name the highlighted note';

const promptText = (page: Page) => page.locator('#drill-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');

/** Every worked example (any drill) ends "Tap X to continue." */
async function workedExampleAnswer(page: Page): Promise<string | null> {
  const text = (await promptText(page).innerText()).trim();
  return /Tap (\S+) to continue\.$/.exec(text)?.[1] ?? null;
}

async function tap(page: Page, note: string): Promise<void> {
  await page
    .getByRole('group', { name: /highlighted|continue|\?/i })
    .getByRole('button', { name: note, exact: true })
    .click();
}

/** Answer worked examples (whatever the drill) until `done` holds for the prompt. */
async function answerWorkedExamplesUntil(
  page: Page,
  done: (prompt: string) => boolean,
): Promise<string> {
  for (let i = 0; i < 40; i++) {
    await expect(promptText(page)).toBeVisible();
    const text = (await promptText(page).innerText()).trim();
    if (done(text)) return text;
    const answer = await workedExampleAnswer(page);
    if (!answer) throw new Error(`Reached a recall prompt first: ${text}`);
    await tap(page, answer);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  }
  throw new Error('No matching prompt within 40 reps');
}

test.describe('M1-25 recall prompts hide the answer', () => {
  test('after the worked example, the D1 prompt shows no answer on the neck @smoke', async ({
    page,
  }) => {
    await freshStart(page);
    // F1 (note-wheel) items lead a fresh session; skip them to reach D1.
    await masterSkills(page, F1_SKILLS);
    await page.getByTestId('start-session').click();

    let sawWorkedExample = false;
    await answerWorkedExamplesUntil(page, (text) => {
      if (text.startsWith('This is')) sawWorkedExample = true;
      return text === D1_RECALL;
    });
    expect(sawWorkedExample).toBe(true);

    const target = page.getByTestId('marker-target');
    const string = Number(await target.getAttribute('data-string'));
    const fret = Number(await target.getAttribute('data-fret'));
    const note = noteName(string, fret);

    // The target cell carries no text, and no marker text names the answer.
    await expect(target.locator('text')).toHaveCount(0);
    const markerTexts = await neck(page).locator('[data-testid^="marker-"] text').allTextContents();
    expect(markerTexts).not.toContain(note);

    // The target string's name at the nut never names the answer (fret 0 / 12).
    const ownString = neck(page).locator(`[data-testid="string-name"][data-string="${string}"]`);
    if ((await ownString.count()) > 0) await expect(ownString).not.toHaveText(note);
  });

  test('the first D3 (F1) recall prompt shows only its starting note @smoke', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();

    const question = await answerWorkedExamplesUntil(page, (text) => text.endsWith('?'));
    const from = /([A-G]#?)(?: in the musical alphabet)?\?$/.exec(question)?.[1];
    expect(from).toBeTruthy();
    await expect(page.getByTestId('marker-target')).toHaveCount(0);
    await expect(page.getByTestId('marker-correct')).toHaveCount(0);
    const texts = (await neck(page).locator('text').allTextContents()).map((t) => t.trim());
    expect(texts).toEqual([from]);
  });
});
