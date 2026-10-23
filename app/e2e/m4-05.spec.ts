import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// M4-05: the interactive circle of fifths in Explore. Tapping a key shows its
// signature, relative key, neighbours and chords, and marks those chords on
// the circle. The three enharmonic positions show both spellings. "Quiz me on
// this" starts a session of D40 key-signature cards (I3).

const view = (page: Page) => page.getByRole('region', { name: 'Circle of fifths' });
const wedge = (page: Page, name: RegExp) => view(page).getByRole('radio', { name });
const keyName = (page: Page) => page.getByTestId('circle-key');
const signature = (page: Page) => page.getByTestId('circle-signature');

async function open(page: Page, mastered: readonly string[] = []) {
  await freshStart(page, '/explore');
  // I3 opens once C4's sharp keys are under way.
  if (mastered.length > 0) await masterSkills(page, mastered);
  await page
    .getByRole('navigation', { name: 'Explore views' })
    .getByRole('link', { name: 'Circle of fifths' })
    .click();
  await expect(page).toHaveURL(/\?view=circle-of-fifths$/);
}

/** Every wedge's tap area, at least 44pt each way (design §7). */
async function expectTapSizedWedges(page: Page) {
  const boxes = await view(page)
    .getByRole('radio')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  expect(boxes).toHaveLength(24);
  for (const r of boxes) {
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
}

test.describe('M4-05 circle of fifths', () => {
  test('a tapped key shows its signature, relatives and chords', async ({ page }) => {
    await open(page);
    await expect(keyName(page)).toHaveText('C major');
    await expect(signature(page)).toHaveText('No sharps or flats');

    await wedge(page, /^A major, 3 sharps/).click();
    await expect(wedge(page, /^A major, 3 sharps/)).toHaveAttribute('aria-checked', 'true');
    await expect(keyName(page)).toHaveText('A major');
    await expect(signature(page)).toHaveText('3 sharps: F♯ C♯ G♯');
    // Its chords sit beside it: IV and V outside, ii, iii and vi inside.
    for (const [name, numeral] of [
      [/^D major/, 'IV'],
      [/^E major/, 'V'],
      [/^B minor/, 'ii'],
      [/^C sharp minor/, 'iii'],
      [/^F sharp minor/, 'vi'],
    ] as const) {
      await expect(wedge(page, name)).toHaveAccessibleName(new RegExp(`; ${numeral} in A major$`));
    }
    await expect(page.getByTestId('circle-chords')).toContainText('vii°G♯dim');

    await view(page).getByRole('button', { name: 'F♯ minor' }).click();
    await expect(keyName(page)).toHaveText('F♯ minor');
    await expect(signature(page)).toHaveText('3 sharps: F♯ C♯ G♯');
    await view(page)
      .getByRole('button', { name: /v: C♯ minor/ })
      .click();
    await expect(keyName(page)).toHaveText('C♯ minor');
    await expect(signature(page)).toHaveText('4 sharps: F♯ C♯ G♯ D♯');

    await expectTapSizedWedges(page);
    await expectNoHorizontalOverflow(page);
  });

  test('both spellings at F♯/G♭, and the neighbours follow the spelling', async ({ page }) => {
    await open(page);
    const fSharp = wedge(page, /^F sharp major, 6 sharps, or G flat major, 6 flats/);
    await expect(fSharp).toContainText('F♯ / G♭');
    await expect(wedge(page, /^D sharp minor, 6 sharps, or E flat minor/)).toContainText('E♭m');

    await fSharp.click();
    await expect(keyName(page)).toHaveText('F♯ major');
    await expect(signature(page)).toHaveText('6 sharps: F♯ C♯ G♯ D♯ A♯ E♯');
    await view(page).getByText('G♭ major', { exact: true }).click();
    await expect(keyName(page)).toHaveText('G♭ major');
    await expect(signature(page)).toHaveText('6 flats: B♭ E♭ A♭ D♭ G♭ C♭');
    await expect(view(page).getByRole('button', { name: 'E♭ minor' })).toBeVisible();
    await view(page)
      .getByRole('button', { name: /IV: C♭ major/ })
      .click();
    await expect(signature(page)).toHaveText('7 flats: B♭ E♭ A♭ D♭ G♭ C♭ F♭');
  });

  test('the keyboard steps round the circle', async ({ page }) => {
    await open(page);
    await wedge(page, /^C major/).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(keyName(page)).toHaveText('D major');
    await expect(wedge(page, /^D major/)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(keyName(page)).toHaveText('B minor');
    await page.keyboard.press('ArrowLeft');
    await expect(keyName(page)).toHaveText('E minor');
    await page.keyboard.press('ArrowUp');
    await expect(keyName(page)).toHaveText('G major');
  });

  test('"Quiz me on this" starts a session of key-signature cards @layout', async ({ page }) => {
    await open(page, ['C4.sharp-keys']);
    const quiz = view(page).getByRole('link', { name: 'Quiz me on this' });
    await expect(quiz).toHaveAttribute('href', '/session?skill=I3.sharp-signatures');
    await quiz.click();
    await expect(page).toHaveURL(/\/session\?skill=I3\.sharp-signatures$/);
    const card = page.getByTestId('d40-drill');
    await expect(card).toBeVisible();

    // A new card opens as a worked example: the fact, then the answer to tap.
    await expect(page.locator('#drill-prompt')).toContainText('to continue');
    await answerWorkedExample(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('d40-feedback')).toBeVisible();

    // iPad: every answer is a comfortable target (design §7).
    const sizes = await card
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
  });

  test('a wrong card says what the chosen answer belongs to', async ({ page }) => {
    await open(page, ['C4.sharp-keys']);
    await view(page).getByRole('link', { name: 'Quiz me on this' }).click();
    const card = page.getByTestId('d40-drill');
    await expect(card).toBeVisible();
    const want = await expectedAnswer(page);
    await card
      .getByRole('group')
      .getByRole('button')
      .filter({ hasNot: page.locator(`text="${want}"`) })
      .first()
      .click();
    await expect(page.getByTestId('d40-feedback')).toBeVisible();
    await expect(card.locator('[data-state="wrong"]')).toHaveCount(1);
    // The right answer gets a dashed edge, so it reads without colour.
    await expect(card.locator('[data-state="expected"]')).toHaveCount(1);
  });

  test('picks a key on a phone @smoke @phone', async ({ page }) => {
    await open(page);
    await wedge(page, /^E flat major, 3 flats/).click();
    await expect(keyName(page)).toHaveText('E♭ major');
    await expect(signature(page)).toHaveText('3 flats: B♭ E♭ A♭');
    await view(page).getByRole('button', { name: 'C minor' }).click();
    await expect(keyName(page)).toHaveText('C minor');
    await expectTapSizedWedges(page);
    await expectNoHorizontalOverflow(page);
  });

  test('a key-signature card on a phone @smoke @phone', async ({ page }) => {
    await open(page, ['C4.sharp-keys']);
    await view(page).getByRole('link', { name: 'Quiz me on this' }).click();
    await expect(page.getByTestId('d40-drill')).toBeVisible();
    await answerWorkedExample(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

/** The answer a worked example names: "… Tap 3♯ to continue." */
async function expectedAnswer(page: Page): Promise<string> {
  return ((await page.locator('#drill-prompt strong').textContent()) ?? '').trim();
}

/** Tap the answer the worked example names. */
async function answerWorkedExample(page: Page) {
  const want = await expectedAnswer(page);
  expect(want).not.toBe('');
  await page
    .getByTestId('d40-drill')
    .getByRole('group')
    .locator(`button:has(span:text-is("${want}"))`)
    .click();
}
