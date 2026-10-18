import { expect, test } from '@playwright/test';
import { answer, freshStart, noteName, targetNote } from './helpers';

// M1-25: a recall prompt must never print its answer on the neck. A fresh
// learner's skill sits at guide level 3, which used to label the target.

test.describe('M1-25 recall prompts hide the answer', () => {
  test('after the worked example, the unguided prompt shows no answer on the neck @smoke', async ({
    page,
  }) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();
    const prompt = page.locator('#drill-prompt');

    // The worked example labels the target.
    await expect(prompt).toHaveText(/^This is/);
    await expect(page.getByTestId('marker-target').locator('text')).toHaveText(
      await targetNote(page),
    );

    // Answer worked examples until the first recall prompt.
    for (let i = 0; i < 20; i++) {
      await expect(prompt).toHaveText(/^This is|^Name the highlighted note$/);
      if ((await prompt.textContent()) === 'Name the highlighted note') break;
      await answer(page, await targetNote(page));
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    await expect(prompt).toHaveText('Name the highlighted note');

    const target = page.getByTestId('marker-target');
    const string = Number(await target.getAttribute('data-string'));
    const fret = Number(await target.getAttribute('data-fret'));
    const note = noteName(string, fret);

    // The target cell carries no text.
    await expect(target.locator('text')).toHaveCount(0);

    // No marker text names the answer.
    const neck = page.getByRole('group', { name: /^Fretboard, string/ });
    const markerTexts = await neck.locator('[data-testid^="marker-"] text').allTextContents();
    expect(markerTexts).not.toContain(note);

    // The target string's name at the nut never names the answer (fret 0 / 12).
    const ownString = neck.locator(`[data-testid="string-name"][data-string="${string}"]`);
    if ((await ownString.count()) > 0) await expect(ownString).not.toHaveText(note);
  });
});
