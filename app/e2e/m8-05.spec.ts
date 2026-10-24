import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { press } from './helpers/keyboard';

// M8-05: T1 and T2, and D32 "Simple or compound? How many felt beats?". A
// card prints a time signature and asks its felt beats, its beat note, or
// simple vs compound, or gives the beats and asks for the signature. A new
// card opens as a worked example with the bar's beats drawn; feedback names
// the fact and, for a wrong answer, draws the meter it belongs to (6/8
// beside 3/4). T1 opens once F4's pulse is under way.

const card = (page: Page) => page.getByTestId('d32-drill');
const choices = (page: Page) => card(page).getByRole('group').getByRole('button');

/** Each meter's answers, by the button's accessible name. */
const METERS: Record<string, { felt: string; unit: string; kind: string; beats: string }> = {
  '2/4': { felt: '2', unit: 'quarter', kind: 'Simple', beats: '2 quarter-note' },
  '3/4': { felt: '3', unit: 'quarter', kind: 'Simple', beats: '3 quarter-note' },
  '4/4': { felt: '4', unit: 'quarter', kind: 'Simple', beats: '4 quarter-note' },
  '2/2': { felt: '2', unit: 'half', kind: 'Simple', beats: '2 half-note' },
  '6/8': { felt: '2', unit: 'dotted quarter', kind: 'Compound', beats: '2 dotted-quarter' },
  '9/8': { felt: '3', unit: 'dotted quarter', kind: 'Compound', beats: '3 dotted-quarter' },
  '12/8': { felt: '4', unit: 'dotted quarter', kind: 'Compound', beats: '4 dotted-quarter' },
};

/** The right button's accessible name for the card on screen. */
async function rightAnswer(page: Page): Promise<string> {
  const subject = page.getByTestId('d32-subject');
  const task = (await page.locator('#drill-prompt').textContent()) ?? '';
  const signature = subject.getByRole('img');
  if ((await signature.count()) === 0) {
    const beats = ((await subject.textContent()) ?? '').replace(/ beats a bar$/, '');
    const meter = Object.keys(METERS).find((m) => METERS[m]!.beats === beats);
    expect(meter, beats).toBeDefined();
    return `${meter!.replace('/', ' ')} time${meter === '2/2' ? ', cut time' : ''}`;
  }
  const said = (await signature.getAttribute('aria-label')) ?? '';
  const meter = said.replace(/ time.*$/, '').replace(' ', '/');
  const m = METERS[meter]!;
  if (task.startsWith('How many beats')) return `${m.felt} beats`;
  if (task.startsWith('What note')) return m.unit;
  return m.kind;
}

/** A wrong button for the card on screen. */
async function wrongButton(page: Page): Promise<Locator> {
  const right = await rightAnswer(page);
  const names = await choices(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  );
  return card(page).getByRole('button', { name: names.find((n) => n !== right)!, exact: true });
}

/** Opens a focused session on a skill, with what it builds on mastered. */
async function open(page: Page, skillId: string, mastered: readonly string[]) {
  await freshStart(page);
  await masterSkills(page, mastered);
  await focusSession(page, skillId);
  await expect(card(page)).toBeVisible();
}

/**
 * Gets past a D29 "Complete the bar" card (M8-06), which takes turns with
 * D32 on felt-beats cards: one eighth never fills a bar, so it's wrong.
 */
async function skipD29(page: Page) {
  const d29 = page.getByTestId('d29-drill');
  await d29.getByRole('button', { name: 'Eighth', exact: true }).click();
  await d29.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('feedback-wrong')).toBeHidden();
}

/** Answers cards right until one isn't a worked example; returns with it on screen. */
async function reachUnguidedCard(page: Page) {
  for (let i = 0; i < 16; i++) {
    const d29 = page.getByTestId('d29-drill');
    await expect(card(page).or(d29)).toBeVisible();
    if (await d29.isVisible()) {
      await skipD29(page);
      continue;
    }
    const prompt = page.locator('#drill-prompt');
    if (!((await prompt.textContent()) ?? '').includes('to continue')) return;
    await card(page)
      .getByRole('button', { name: await rightAnswer(page), exact: true })
      .click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    // The session moves on by itself after a right answer.
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  }
  throw new Error('Every card was a worked example');
}

test.describe('M8-05 simple or compound', () => {
  test('a new compound card is worked through with its beats drawn @layout', async ({ page }) => {
    await open(page, 'T2.compound-meters', ['F4.pulse', 'T1.simple-meters']);
    // The worked example names the answer, explains it and draws the bar.
    await expect(page.locator('#drill-prompt')).toContainText('to continue');
    const feedback = page.getByTestId('d32-feedback');
    await expect(feedback).toContainText('compound time');
    await expect(feedback.getByTestId('d32-strip')).toHaveCount(1);
    await expect(feedback.getByRole('button', { name: /^Hear / })).toBeVisible();

    // iPad: every answer is a comfortable target (design §7).
    const sizes = await card(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    await card(page)
      .getByRole('button', { name: await rightAnswer(page), exact: true })
      .click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('a wrong answer names the meter it belongs to and draws both', async ({ page }) => {
    await open(page, 'T2.compound-meters', ['F4.pulse', 'T1.simple-meters']);
    await reachUnguidedCard(page);
    // No beats drawn before the answer: they would give it away.
    await expect(card(page).getByTestId('d32-strip')).toHaveCount(0);
    await (await wrongButton(page)).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(card(page).locator('[data-state="wrong"]')).toHaveCount(1);
    // The right answer gets a dashed edge, so it reads without colour.
    await expect(card(page).locator('[data-state="expected"]')).toHaveCount(1);
    await expect(page.getByTestId('d32-feedback')).toContainText('compound time');
    const strips = card(page).getByTestId('d32-strip');
    await expect(strips.first()).toBeVisible();
    expect(await strips.count()).toBeGreaterThanOrEqual(1);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('answers from a hardware keyboard', async ({ page }) => {
    await open(page, 'T1.simple-meters', ['F4.pulse']);
    const right = card(page).getByRole('button', { name: await rightAnswer(page), exact: true });
    const keys = (await right.getAttribute('aria-keyshortcuts')) ?? '';
    expect(keys).not.toBe('');
    await press(page, keys.split(' ')[0]!);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(right).toHaveAttribute('data-state', 'correct');
  });

  test('a time-signature card on a phone @smoke @phone', async ({ page }) => {
    await open(page, 'T1.simple-meters', ['F4.pulse']);
    await expect(page.locator('#drill-prompt')).toContainText('to continue');
    await card(page)
      .getByRole('button', { name: await rightAnswer(page), exact: true })
      .click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
