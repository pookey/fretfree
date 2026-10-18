import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// An independent answer key (deliberately not imported from app code).
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STEPS: Record<string, number> = { half: 1, whole: 2 };

function solve(question: string): string {
  const tap = /Tap (\S+) to continue/.exec(question);
  if (tap) return tap[1]!;
  const letter = /^The note (after|before) ([A-G]) in the musical alphabet\?$/.exec(question);
  if (letter) {
    const i = LETTERS.indexOf(letter[2]!) + (letter[1] === 'after' ? 1 : -1);
    return LETTERS[(i + 7) % 7]!;
  }
  const step = /^A (half|whole) step (above|below) ([A-G]#?)\?$/.exec(question);
  if (!step) throw new Error(`Unexpected D3 prompt: ${question}`);
  const size = STEPS[step[1]!]! * (step[2] === 'above' ? 1 : -1);
  return CHROMATIC[(CHROMATIC.indexOf(step[3]!) + size + 12) % 12]!;
}

const promptText = (page: Page) => page.locator('#drill-prompt');

async function currentAnswer(page: Page): Promise<string> {
  await expect(promptText(page)).toBeVisible();
  return solve((await promptText(page).innerText()).trim());
}

async function tap(page: Page, note: string): Promise<void> {
  await page
    .getByRole('group', { name: /\?|continue/ })
    .getByRole('button', { name: note, exact: true })
    .click();
}

async function neckTexts(page: Page): Promise<string[]> {
  const texts = await page.locator('svg[data-fret-from] text').allTextContents();
  return texts.map((t) => t.trim());
}

test.describe('D3 "Note-wheel steps"', () => {
  test('a first session walks the musical alphabet with the note wheel', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await page.getByTestId('start-session').click();

    // Guided worked examples first: the answer is shown on the neck.
    await expect(promptText(page)).toHaveText(
      'The note after C in the musical alphabet is D. Tap D to continue.',
    );
    const panel = page.getByTestId('context-panel');
    await expect(panel.getByTestId('note-wheel')).toBeVisible();
    await expect(panel.getByTestId('half-step-B-C')).toBeVisible();
    await expect(panel.getByTestId('half-step-E-F')).toBeVisible();
    await expect(panel.getByTestId('wheel-note-C')).toHaveAttribute('data-role', 'start');
    const neck = await page.locator('svg[data-fret-from]').boundingBox();
    const box = await panel.boundingBox();
    if (info.project.name === 'ipad-portrait') expect(box!.y).toBeGreaterThan(neck!.y);
    else expect(box!.y + box!.height).toBeLessThanOrEqual(neck!.y + 1);
    // The step is drawn on the low E string: the whole neck must fit on screen.
    await expect(page.getByTestId('marker-root')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('marker-target')).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalOverflow(page);

    for (let i = 0; i < 4; i++) {
      await tap(page, await currentAnswer(page));
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }

    // Unguided recall: the neck shows only the starting note, never the answer.
    await expect(promptText(page)).toHaveText('The note after C in the musical alphabet?');
    expect(await neckTexts(page)).toEqual(['C']);
    await expect(panel.getByTestId('wheel-note-D')).not.toHaveAttribute('data-role');

    // Keyboard: a letter answers.
    await page.keyboard.press('d');
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ D');
    await expect(page.getByTestId('feedback-correct')).toBeHidden();

    // A wrong answer shows both notes and waits for Continue.
    const expected = await currentAnswer(page);
    const wrong = expected === 'C' ? 'G' : 'C';
    await tap(page, wrong);
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${expected}`);
    await expect(panel.getByTestId(`wheel-note-${expected}`)).toHaveAttribute(
      'data-role',
      'expected',
    );
    await expect(panel.getByTestId(`wheel-note-${wrong}`)).toHaveAttribute('data-role', 'given');
    expect(await neckTexts(page)).toEqual(expect.arrayContaining([expected, wrong]));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();

    // The help toggle hides the wheel.
    await page.getByRole('button', { name: 'Hide help' }).click();
    await expect(page.getByTestId('note-wheel')).toHaveCount(0);
  });

  test('asks "a whole step above E?" and takes Shift for sharps', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    // Whole steps unlock once the alphabet, B–C/E–F and half steps are done.
    await masterSkills(page, ['F1.alphabet', 'F1.b-c-e-f', 'F1.half-steps']);
    await page.getByTestId('start-session').click();

    await expect(promptText(page)).toContainText('A whole step above C is D.');
    for (let i = 0; i < 4; i++) {
      await tap(page, await currentAnswer(page));
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    for (const [question, key, shown] of [
      ['A whole step above C?', 'd', 'D'],
      ['A whole step above D?', 'e', 'E'],
      ['A whole step above E?', 'Shift+F', 'F#'],
    ] as const) {
      await expect(promptText(page)).toHaveText(question);
      expect(await neckTexts(page)).not.toContain(shown);
      await page.keyboard.press(key);
      await expect(page.getByTestId('feedback-correct')).toHaveText(`✓ ${shown}`);
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
  });

  test('answers a note-wheel prompt on a phone @smoke', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();
    await tap(page, await currentAnswer(page));
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
