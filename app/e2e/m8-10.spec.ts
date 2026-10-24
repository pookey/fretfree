import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M8-10: R2 skills and D23 "Staff → fretboard by position" (design §12).
// One note on the staff above the whole neck; the position's frets are
// drawn and the rest dimmed, and the learner taps where the position plays
// the note. The first rep of each new item is a worked example.

/** What the reading track opens with (engine/skills/r2.ts, as R1). */
const READING_GATES = ['F2.string6-naturals', 'F2.string5-naturals', 'T1.simple-meters'];

/** Open position's one cell for each staff place R2.open reads (0 = bottom line). */
const OPEN: Readonly<Record<number, readonly [string: number, fret: number]>> = {
  [-7]: [6, 0],
  [-6]: [6, 1],
  [-5]: [6, 3],
  [-4]: [5, 0],
  [-3]: [5, 2],
  [-2]: [5, 3],
  [-1]: [4, 0],
  0: [4, 2],
  1: [4, 3],
  2: [3, 0],
  3: [3, 2],
  4: [2, 0],
  5: [2, 1],
  6: [2, 3],
  7: [1, 0],
  8: [1, 1],
  9: [1, 3],
};

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const staff = (page: Page) => page.getByTestId('d23-staff');
const prompt = (page: Page) => page.getByTestId('d23-prompt');

/** Taps a cell, sliding a compact window to it first. */
async function tapCell(page: Page, string: number, fret: number): Promise<void> {
  const cell = neck(page).locator(`[data-cell="s${string}f${fret}"]`);
  for (let i = 0; i < 4 && (await cell.count()) === 0; i += 1) {
    await page.getByRole('button', { name: 'Higher frets' }).click();
  }
  await cell.click();
}

/** A learner past the reading track's gates starts a focused session on one position. */
async function startReading(page: Page, skillId: string, more: string[] = []): Promise<void> {
  await masterSkills(page, [...READING_GATES, ...more]);
  await focusSession(page, skillId);
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'staff-to-fret');
  await expect(prompt(page)).toBeVisible();
  // VexFlow loads on first use; the note is drawn once it has engraved.
  await expect(staff(page).getByTestId('staff-note')).toHaveCount(1);
}

/** The worked example's marked cell. */
async function markedCell(page: Page): Promise<{ string: number; fret: number }> {
  const target = neck(page).getByTestId('marker-target');
  return {
    string: Number(await target.getAttribute('data-string')),
    fret: Number(await target.getAttribute('data-fret')),
  };
}

test.beforeEach(async ({ page }) => {
  await freshStart(page);
});

test.describe('D23 "Staff → fretboard by position"', () => {
  test('reads a note in open position and taps it on the neck @smoke', async ({ page }) => {
    await startReading(page, 'R2.open');

    // The worked example: the note named and its cell marked.
    await expect(page.getByTestId('d23-position')).toHaveText('Open position, frets 0–3');
    await expect(prompt(page)).toHaveText(
      'D3 in open position is string 4, fret 0. Tap it to continue.',
    );
    await expect(staff(page).getByTestId('staff-note')).toHaveAccessibleName(/^D 3, whole note/);
    await expect(neck(page).getByTestId('marker-target')).toHaveAttribute('data-string', '4');
    await expect(neck(page).getByTestId('marker-target')).toHaveAttribute('data-fret', '0');
    await expectNoHorizontalOverflow(page);

    await tapCell(page, 4, 0);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('d23-explain')).toHaveText(
      'D3 in open position is string 4, fret 0, the open string.',
    );
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '0');
    await expect(staff(page).getByTestId('staff-note')).toHaveAttribute('data-style', 'correct');
  });

  test('on iPad the staff sits above the whole neck, dimmed outside the position @layout', async ({
    page,
  }, info) => {
    await startReading(page, 'R2.pos5', ['R2.open']);
    await expect(page.getByTestId('d23-position')).toHaveText('5th position, frets 5–8');

    // Landscape draws the whole neck; portrait 13 frets for 44pt cells.
    const portrait = info.project.name === 'ipad-portrait';
    await expect(neck(page)).toHaveAttribute('data-fret-from', '0');
    await expect(neck(page)).toHaveAttribute('data-fret-to', portrait ? '12' : '15');
    // 5th position's frets (4–8, with the index finger's stretch to 4) are drawn; the rest dimmed.
    await expect(neck(page).getByTestId('dimmed-fret')).toHaveCount(portrait ? 8 : 11);

    // Both in view at once, the staff above the neck.
    await expect(staff(page)).toBeInViewport({ ratio: 1 });
    await expect(neck(page)).toBeInViewport({ ratio: 1 });
    const staffBox = (await staff(page).boundingBox())!;
    const neckBox = (await neck(page).boundingBox())!;
    expect(staffBox.y + staffBox.height).toBeLessThanOrEqual(neckBox.y);

    const sizes = await neck(page)
      .locator('[data-cell^="s6f"]')
      .evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect()));
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    // The worked example's cell is in the position, and taps outside it do nothing.
    const { string, fret } = await markedCell(page);
    expect(fret).toBeGreaterThanOrEqual(4);
    expect(fret).toBeLessThanOrEqual(8);
    await tapCell(page, 1, 0);
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
    await tapCell(page, string, fret);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('hides the cell once the worked examples are done, and explains a misread', async ({
    page,
  }) => {
    await startReading(page, 'R2.open');

    // The first block's worked examples: tap each marked cell.
    for (let i = 0; i < 6; i += 1) {
      const guided = (await prompt(page).textContent())?.endsWith('Tap it to continue.');
      if (!guided) break;
      const { string, fret } = await markedCell(page);
      await tapCell(page, string, fret);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }

    // Independent: nothing marks the answer, and the staff says where the note sits, not its name.
    await expect(prompt(page)).toHaveText('Tap this note in open position');
    await expect(neck(page).locator('[data-testid^="marker-"]')).toHaveCount(0);
    await expect(staff(page).getByTestId('staff-note')).toHaveAccessibleName(/^whole note on /);

    // Misread the staff: tap the note on the line or space beside it.
    const place = Number(await staff(page).getAttribute('data-place'));
    const right = OPEN[place]!;
    const [string, fret] = OPEN[place + 1] ?? OPEN[place - 1]!;
    await tapCell(page, string, fret);
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('d23-explain')).toContainText(
      /on the (line|space) just (above|below)/,
    );
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute(
      'data-string',
      String(right[0]),
    );
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute(
      'data-fret',
      String(right[1]),
    );
    await expect(neck(page).getByTestId('marker-wrong')).toHaveAttribute('data-fret', String(fret));
    // The tapped note is drawn beside the asked one.
    await expect(staff(page).getByTestId('staff-note')).toHaveCount(2);
    await expect(staff(page).getByTestId('staff-note').nth(1)).toHaveAttribute(
      'data-style',
      'wrong',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('answers from the keyboard', async ({ page }) => {
    await startReading(page, 'R2.open');
    // The focus starts on the top string at the position's first fret: D3 is three strings down.
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });
});
