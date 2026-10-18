import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName } from './helpers';

// M1-27: D3 says "note" (not "letter"), and tapping the note on the neck
// answers like its button, since finding it on the neck is the skill.

// An independent answer key (deliberately not imported from app code).
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STEPS: Record<string, number> = { half: 1, whole: 2 };

const ALPHABET = / in the musical alphabet\?$/;

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

interface Cell {
  string: number;
  fret: number;
}

const promptText = (page: Page) => page.locator('#drill-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);

async function question(page: Page): Promise<string> {
  await expect(promptText(page)).toBeVisible();
  return (await promptText(page).innerText()).trim();
}

/** A visible cell sounding `note`, off the low E string where the step is drawn. */
async function cellFor(page: Page, note: string): Promise<Cell> {
  const from = Number(await neck(page).getAttribute('data-fret-from'));
  const to = Number(await neck(page).getAttribute('data-fret-to'));
  for (const string of [3, 4, 2, 5, 1, 6]) {
    for (let fret = from; fret <= to; fret++) {
      if (noteName(string, fret) === note) return { string, fret };
    }
  }
  throw new Error(`No ${note} on frets ${from}–${to}`);
}

async function tapNote(page: Page, note: string): Promise<Cell> {
  const cell = await cellFor(page, note);
  await cellAt(page, cell).click();
  return cell;
}

async function expectCorrect(page: Page, note: string): Promise<void> {
  await expect(page.getByTestId('feedback-correct')).toHaveText(`✓ ${note}`);
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

test.describe('M1-27 D3 says "note" and answers on the neck', () => {
  test('answers a prompt by tapping the note on the neck @smoke', async ({ page }) => {
    await freshStart(page);
    await page.getByTestId('start-session').click();

    const text = await question(page);
    expect(text).toContain('in the musical alphabet');
    expect(text).not.toMatch(/letter/i);
    await expect(page.getByTestId('d3-hint')).toHaveText(
      'Tap the note on any string of the neck, or press a button.',
    );

    const note = solve(text);
    const cell = await tapNote(page, note);
    expect(cell.string).not.toBe(6);
    await expectCorrect(page, note);
    await expectNoHorizontalOverflow(page);
  });

  test('recall by neck taps: a wrong tap marks the tapped and the right cells', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await page.getByTestId('start-session').click();

    // Guided worked examples: tap the marked answer on the neck.
    for (let i = 0; i < 10; i++) {
      const text = await question(page);
      if (!text.endsWith('to continue.')) break;
      const target = page.getByTestId('marker-target');
      const cell = {
        string: Number(await target.getAttribute('data-string')),
        fret: Number(await target.getAttribute('data-fret')),
      };
      await cellAt(page, cell).click();
      await expectCorrect(page, solve(text));
    }

    // Unguided recall: only the start is labelled, and no tap target names a note.
    let text = await question(page);
    expect(text).toMatch(ALPHABET);
    const from = /([A-G]) in the musical alphabet\?$/.exec(text)![1]!;
    const texts = (await neck(page).locator('text').allTextContents()).map((t) => t.trim());
    expect(texts).toEqual([from]);
    const labels = await neck(page)
      .getByRole('button')
      .evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label')));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toMatch(/^string \d, fret \d+$/);

    // Neck cells stay at least 44pt on iPad, even the narrowest (highest) fret.
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    const box = (await cellAt(page, { string: 1, fret: to }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    // A right tap, on a string other than the drawn step's.
    const right = solve(text);
    await tapNote(page, right);
    await expectCorrect(page, right);

    // A wrong tap: the sharp a fret above the answer. For a musical-alphabet
    // item that is the natural's neighbour, which must not count.
    text = await question(page);
    const expected = solve(text);
    const wrong = CHROMATIC[(CHROMATIC.indexOf(expected) + 1) % 12]!;
    const tapped = await tapNote(page, wrong);
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${expected}`);
    const wrongMarker = neck(page).getByTestId('marker-wrong');
    await expect(wrongMarker).toHaveCount(1);
    await expect(wrongMarker).toHaveAttribute('data-string', String(tapped.string));
    await expect(wrongMarker).toHaveAttribute('data-fret', String(tapped.fret));
    await expect(wrongMarker).toHaveText(wrong);
    const correct = neck(page).getByTestId('marker-correct');
    expect(await correct.count()).toBeGreaterThanOrEqual(1);
    for (const t of await correct.allTextContents()) expect(t.trim()).toBe(expected);
    // The answer is also marked on the tapped string, where the miss was made.
    await expect(
      neck(page).locator(`[data-testid="marker-correct"][data-string="${tapped.string}"]`),
    ).toHaveCount(1);

    // Taps do nothing until Continue.
    await cellAt(page, tapped).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });
});
