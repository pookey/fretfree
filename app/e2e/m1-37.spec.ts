import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M1-37: the F3 lessons ("Fret markers 3, 5, 7, 9 and 12" and "The neck
// repeats at the 12th fret") used to open to "Session complete" with no
// items, because no drill could test them. D39 "Fret landmarks" serves them
// now, and a session with nothing to serve says so.

const promptText = (page: Page) => page.locator('#drill-prompt');
const neckArea = (page: Page) => page.getByTestId('d39-neck');

/** An independent answer key (deliberately not imported from app code). */
async function solve(page: Page): Promise<{ fret: number; tap: boolean }> {
  await expect(promptText(page)).toBeVisible();
  const text = (await promptText(page).innerText()).trim();
  const find = /(?:^Tap the|^The) (\d+)(?:st|nd|rd|th)-fret marker/.exec(text);
  if (find) return { fret: Number(find[1]), tap: true };
  const shown = /Tap (\S+) to continue/.exec(text);
  if (shown) return { fret: shown[1] === 'Open' ? 0 : Number(shown[1]), tap: false };
  if (text === 'Which fret is this marker on?') {
    return { fret: Number(await neckArea(page).getAttribute('data-spotlight')), tap: false };
  }
  const repeat = /same notes as (?:fret (\d+)|the open strings), an octave (higher|lower)\?$/.exec(
    text,
  );
  if (!repeat) throw new Error(`Unexpected D39 prompt: ${text}`);
  const from = repeat[1] ? Number(repeat[1]) : 0;
  return { fret: from + (repeat[2] === 'higher' ? 12 : -12), tap: false };
}

async function give(page: Page, fret: number, tap: boolean): Promise<void> {
  if (tap) await page.locator(`[data-cell="s3f${fret}"]`).click();
  else
    await page
      .getByRole('button', { name: fret === 0 ? 'Open string' : `Fret ${fret}`, exact: true })
      .click();
}

async function answerCorrectly(page: Page): Promise<void> {
  const { fret, tap } = await solve(page);
  await give(page, fret, tap);
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

test.describe('D39 "Fret landmarks"', () => {
  test('the fret markers lesson serves prompts and grades them', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, 'F3.markers');

    // A worked example first: the marker is shown, and named.
    await expect(promptText(page)).toHaveText(/(This is the|The) \d+\w\w-fret marker/);
    await expect(page.getByText('Session complete')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await answerCorrectly(page);
    await answerCorrectly(page);

    // A miss names the right fret and waits for Continue.
    const { fret, tap } = await solve(page);
    const wrong = fret === 12 ? 9 : 12;
    await give(page, wrong, tap);
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was fret ${fret}.`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
    await expect(promptText(page)).toBeVisible();
  });

  test('an open marker prompt shows the whole neck to fret 12, with no fret numbers @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad layout');
    await freshStart(page);
    await focusSession(page, 'F3.markers');
    // Past the worked examples to unguided prompts.
    for (let i = 0; i < 12; i++) {
      const text = (await promptText(page).innerText()).trim();
      if (!/continue/.test(text)) break;
      await answerCorrectly(page);
    }
    await expect(promptText(page)).not.toContainText('continue');
    const neck = page.locator('svg[data-fret-from]');
    await expect(neck).toHaveAttribute('data-fret-from', '0');
    await expect(neck).toHaveAttribute('data-fret-to', '12');
    await expect(neck).toBeInViewport({ ratio: 1 });
    const numbers = (await neck.locator('text').allTextContents()).filter((t) =>
      /^\d+$/.test(t.trim()),
    );
    expect(numbers).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });

  test('the 12th-fret repeat lesson serves repeat prompts', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['F3.markers']);
    await focusSession(page, 'F3.repeat-12');
    await expect(neckArea(page)).toHaveAttribute('data-mode', 'repeat');
    await expect(promptText(page)).toContainText('the same notes as');
    await answerCorrectly(page);
    await expect(neckArea(page)).toHaveAttribute('data-mode', 'repeat');
  });

  test('a session with nothing to serve says so @smoke @layout', async ({ page }, info) => {
    await freshStart(page);
    // Mastered, with no cards: nothing is due and nothing is new.
    await masterSkills(page, ['F3.markers']);
    await page.goto('/session?skill=F3.markers');
    await expect(page.getByTestId('session-empty')).toContainText('Nothing to practise right now');
    await expect(page.getByText('Session complete')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    if (info.project.name === 'ipad-landscape') {
      // A centred message in a readable column, not a full-width line.
      const heading = (await page
        .getByRole('heading', { name: 'Nothing to practise right now' })
        .boundingBox())!;
      const column = (await page.getByTestId('session-empty').boundingBox())!;
      const width = page.viewportSize()!.width;
      expect(Math.abs(heading.x + heading.width / 2 - width / 2)).toBeLessThan(2);
      expect(Math.abs(column.x + column.width / 2 - width / 2)).toBeLessThan(2);
      expect(column.width).toBeLessThanOrEqual(32 * 16 + 1);
      expect(column.y).toBeGreaterThan(page.viewportSize()!.height * 0.15);
    }
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });
});
