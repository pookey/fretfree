import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M1-41: D39's 0–12 neck was 468px tall on iPad mini landscape and ended
// under the pinned feedback bar. On iPad the neck now takes the room above
// the bar, shrinking to fit it, with every cell still at least 44pt.

const MIN_CELL = 44;

const promptText = (page: Page) => page.locator('#drill-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');

/** The neck ends above the bar, is wholly on screen and keeps 44pt cells. */
async function expectNeckFits(page: Page): Promise<void> {
  const box = (await neck(page).boundingBox())!;
  const bar = (await page.getByTestId('feedback-bar').boundingBox())!;
  const from = await neck(page).getAttribute('data-fret-from');
  const to = await neck(page).getAttribute('data-fret-to');
  const prompt = await promptText(page).innerText();
  expect(box.y + box.height, `${from}–${to} neck under the bar: ${prompt}`).toBeLessThanOrEqual(
    bar.y + 1,
  );
  await expect(neck(page)).toBeInViewport({ ratio: 1 });
  // The highest fret has the narrowest cells.
  const cell = (await page.locator(`[data-cell="s1f${to}"]`).boundingBox())!;
  expect(cell.width).toBeGreaterThanOrEqual(MIN_CELL - 0.5);
  expect(cell.height).toBeGreaterThanOrEqual(MIN_CELL - 0.5);
  await expectNoHorizontalOverflow(page);
}

/** Answer the current repeat prompt (an independent key, not app code). */
async function answerRepeat(page: Page): Promise<void> {
  const text = (await promptText(page).innerText()).trim();
  const shown = /Tap (\S+) to continue/.exec(text);
  const repeat = /same notes as (?:fret (\d+)|the open strings), an octave (higher|lower)\?$/.exec(
    text,
  );
  const fret = shown
    ? shown[1] === 'Open'
      ? 0
      : Number(shown[1])
    : (repeat?.[1] ? Number(repeat[1]) : 0) + (repeat?.[2] === 'higher' ? 12 : -12);
  await page
    .getByRole('button', { name: fret === 0 ? 'Open string' : `Fret ${fret}`, exact: true })
    .click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

test.describe('M1-41 D39 neck fits above the feedback bar', () => {
  test('the 0–12 marker neck clears the bar on every iPad', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad layout');
    await freshStart(page);
    await focusSession(page, 'F3.markers');
    await expect(neck(page)).toHaveAttribute('data-fret-from', '0');
    await expect(neck(page)).toHaveAttribute('data-fret-to', '12');
    await expectNeckFits(page);
  });

  test('both octaves of the repeat neck clear the bar on every iPad', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad layout');
    test.setTimeout(120_000);
    await freshStart(page);
    await masterSkills(page, ['F3.markers']);
    await focusSession(page, 'F3.repeat-12');
    await expect(page.getByTestId('d39-neck')).toHaveAttribute('data-mode', 'repeat');

    // The upper octave (12–24) has the narrowest frets, so it is drawn the
    // tallest; step on until it has been seen, checking every neck on the way.
    const seen = new Set<string>();
    for (let i = 0; i < 20 && seen.size < 2; i++) {
      await expect(promptText(page)).toBeVisible();
      seen.add(`${await neck(page).getAttribute('data-fret-from')}`);
      await expectNeckFits(page);
      await answerRepeat(page);
    }
    expect([...seen].sort()).toEqual(['0', '12']);
  });

  test('on a phone the neck stays on screen @smoke', async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-smoke', 'phone flow');
    await freshStart(page);
    await focusSession(page, 'F3.markers');
    // Compact keeps its 44pt cells and scrolls the neck sideways in its own
    // area, so it is the area that must sit wholly on screen.
    await expect(page.getByTestId('d39-neck')).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalOverflow(page);
  });
});
