import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { press } from './helpers/keyboard';

// M8-12: R3 and D25 "Read the key signature, then apply it to a note". A
// staff shows a key signature and one note written with no accidental; the
// learner picks its spelling (F♭, F or F♯). A new card opens as a worked
// example; feedback plays the note and shows its fret on the neck below,
// beside the chosen spelling's when wrong. R3 opens with I3's signatures.

const card = (page: Page) => page.getByTestId('d25-drill');
const staff = (page: Page) => card(page).getByRole('group', { name: /^Treble clef/ });
const neck = (page: Page) => card(page).getByRole('group', { name: /^Fretboard/ });
const choices = (page: Page) =>
  card(page).getByRole('group', { name: /What is this note|to continue/ }).getByRole('button');
const prompt = (page: Page) => page.locator('#drill-prompt');

const SHARPS = 'FCGDAEB';
const FLATS = 'BEADGCF';

/** The right button's accessible name, read off the staff's signature and the buttons' letter. */
async function rightAnswer(page: Page): Promise<string> {
  const said = (await staff(page).getAttribute('aria-label')) ?? '';
  const m = /key signature of (\d+) (sharp|flat)s?/.exec(said);
  const letter = ((await choices(page).first().getAttribute('aria-label')) ?? '').charAt(0);
  if (!m) return letter;
  const n = Number(m[1]);
  const order = m[2] === 'sharp' ? SHARPS : FLATS;
  return order.slice(0, n).includes(letter) ? `${letter} ${m[2]}` : letter;
}

async function button(page: Page, name: string): Promise<Locator> {
  return card(page).getByRole('button', { name, exact: true });
}

/** Opens a focused session on an R3 skill, with I3's signatures mastered. */
async function open(page: Page, skillId: string, mastered: readonly string[] = []) {
  await freshStart(page);
  await masterSkills(page, ['C4.sharp-keys', 'C4.flat-keys', 'I3.sharp-signatures', ...mastered]);
  await focusSession(page, skillId);
  await expect(card(page)).toBeVisible();
  await expect(staff(page)).toHaveAttribute('data-ready', 'true');
}

/** Answers cards right until one isn't a worked example; returns with it on screen. */
async function reachUnguidedCard(page: Page) {
  for (let i = 0; i < 20; i++) {
    await expect(card(page)).toBeVisible();
    if (!((await prompt(page).textContent()) ?? '').includes('to continue')) return;
    await (await button(page, await rightAnswer(page))).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    // The session moves on by itself after a right answer.
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  }
  throw new Error('Every card was a worked example');
}

test.describe('M8-12 read the key signature', () => {
  test('a new card is worked through: the fact, its spelling and its fret @smoke', async ({
    page,
  }) => {
    await open(page, 'R3.sharps-few');
    // The worked example names the signature and the answer.
    await expect(prompt(page)).toContainText('to continue');
    await expect(choices(page)).toHaveCount(3);
    const right = await rightAnswer(page);
    await expect(neck(page).getByTestId('marker-correct')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await (await button(page, right)).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('d25-feedback')).toBeVisible();
  });

  test('on iPad the staff sits above the neck, both in view @layout', async ({ page }) => {
    await open(page, 'R3.sharps-few');
    await expect(staff(page)).toBeInViewport({ ratio: 1 });
    await expect(neck(page)).toBeInViewport({ ratio: 1 });
    const staffBox = (await staff(page).boundingBox())!;
    const neckBox = (await neck(page).boundingBox())!;
    expect(staffBox.y + staffBox.height).toBeLessThanOrEqual(neckBox.y);

    // Every answer and neck cell is a comfortable target (design §7).
    const sizes = await choices(page).evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()),
    );
    expect(sizes).toHaveLength(3);
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    const cells = await neck(page)
      .locator('[data-cell^="s6f"]')
      .evaluateAll((els) => els.map((c) => c.getBoundingClientRect()));
    for (const r of cells) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
  });

  test('a wrong spelling is explained and shown beside the right fret', async ({ page }) => {
    await open(page, 'R3.sharps-few');
    await reachUnguidedCard(page);
    await expect(prompt(page)).toHaveText('What is this note in this key signature?');
    // Recall: the note's fret is not on the neck before the answer.
    await expect(neck(page).getByTestId('marker-correct')).toHaveCount(0);
    const right = await rightAnswer(page);
    const names = await choices(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') ?? ''),
    );
    await (await button(page, names.find((n) => n !== right)!)).click();

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(card(page).locator('[data-state="wrong"]')).toHaveCount(1);
    // The right answer gets a dashed edge, so it reads without colour.
    await expect(await button(page, right)).toHaveAttribute('data-state', 'expected');
    await expect(page.getByTestId('d25-feedback')).toContainText(/would need/);
    await expect(neck(page).getByTestId('marker-correct')).toHaveCount(1);
    await expect(neck(page).getByTestId('marker-wrong')).toHaveCount(1);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('answers from a hardware keyboard', async ({ page }) => {
    await open(page, 'R3.sharps-few');
    const right = await button(page, await rightAnswer(page));
    const keys = (await right.getAttribute('aria-keyshortcuts')) ?? '';
    expect(keys).toMatch(/^[123] [bn#]$/);
    await press(page, keys.split(' ')[1]!);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(right).toHaveAttribute('data-state', 'correct');
  });

  test('flat signatures open after the sharps', async ({ page }) => {
    await open(page, 'R3.flats-few', ['I3.flat-signatures', 'R3.sharps-few']);
    await expect(staff(page)).toHaveAttribute('aria-label', /no sharps or flats|flat/);
    await (await button(page, await rightAnswer(page))).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });
});
