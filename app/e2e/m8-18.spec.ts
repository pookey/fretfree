import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { press } from './helpers/keyboard';

// M8-18: T6 pickups, repeats and endings, and the form-reading drill. A
// short tune on a rhythm staff: tap bar N of a pickup tune, say which beat
// its pickup starts on, say which bar follows a repeat or ending, or tap the
// bars in the order they are played. A new card opens as a worked example;
// feedback numbers and marks the bars and explains the turn.

const card = (page: Page) => page.getByTestId('form-drill');
const bars = (page: Page) => card(page).getByTestId('form-bar');
const prompt = async (page: Page) => (await page.locator('#drill-prompt').textContent()) ?? '';

/** Each bar's accessible name, which carries its signs and, on a pickup card, its notes. */
const labels = (page: Page) =>
  bars(page).evaluateAll((els) =>
    els.map((e) => e.querySelector('button, [role="img"]')?.getAttribute('aria-label') ?? ''),
  );

interface FormMarks {
  repeatStart?: true;
  repeatEnd?: true;
  ending?: 1 | 2;
}

/**
 * The order a reader plays the bars in, worked out here from the signs, as
 * a reader does: back once at each end repeat, to the last begin repeat or
 * the start, skipping a 1st ending the second time.
 */
function playOrder(bars: readonly FormMarks[]): number[] {
  const order: number[] = [];
  const taken = new Set<number>();
  let from = 0;
  let again = false;
  for (let i = 0; i < bars.length;) {
    const bar = bars[i]!;
    if (bar.repeatStart) from = i;
    if (bar.ending === 1 && again) {
      i++;
      continue;
    }
    order.push(i);
    if (bar.repeatEnd && !taken.has(i)) {
      taken.add(i);
      i = from;
      again = true;
      continue;
    }
    if (bar.repeatEnd || bar.ending === 2) {
      again = false;
      from = i + 1;
    }
    i++;
  }
  return order;
}

/** The bar after the `time`-th play of `bar`. */
function nextBar(order: readonly number[], bar: number, time: number): number {
  const at = order.flatMap((b, i) => (b === bar ? [i] : []))[time - 1];
  return order[(at ?? -2) + 1] ?? -1;
}

/** The road map the bars' signs spell. */
function marksOf(names: readonly string[]): FormMarks[] {
  return names.map((n) => ({
    ...(n.includes('begin repeat') ? { repeatStart: true as const } : {}),
    ...(n.includes('end repeat') ? { repeatEnd: true as const } : {}),
    ...(n.includes('1st ending')
      ? { ending: 1 as const }
      : n.includes('2nd ending')
        ? { ending: 2 as const }
        : {}),
  }));
}

const QUARTERS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5 };

/** A bar's length in the time signature's bottom note, from the notes in its name. */
function countOf(name: string, bottom: number): number {
  const notes = name.slice(name.indexOf(': ') + 2).split(', ');
  return notes.reduce((sum, n) => {
    const dotted = n.startsWith('dotted ');
    const q = QUARTERS[n.replace('dotted ', '')] ?? 0;
    return sum + q * (dotted ? 1.5 : 1) * (bottom / 4);
  }, 0);
}

/** Answers the card on screen right. */
async function answerRight(page: Page) {
  const task = await prompt(page);
  const names = await labels(page);
  const tapBar = (i: number) => bars(page).nth(i).getByRole('button').click();
  let m: RegExpExecArray | null;
  if ((m = /Tap bar (\d)/.exec(task))) return tapBar(Number(m[1]));
  if (task.includes('pickup start')) {
    const [top, bottom] = await bars(page)
      .first()
      .locator('svg text')
      .allTextContents()
      .then((t) => t.map(Number));
    const start = top! - countOf(names[0]!, bottom!) + 1;
    return card(page)
      .getByRole('group')
      .getByRole('button', { name: new RegExp(`^(Beat|Eighth) ${start}$`) })
      .click();
  }
  const order = playOrder(marksOf(names));
  if ((m = /after bar (\d)/i.exec(task))) {
    const next = nextBar(order, Number(m[1]) - 1, task.includes('second time') ? 2 : 1);
    return card(page)
      .getByRole('group')
      .getByRole('button', { name: `Bar ${next + 1}`, exact: true })
      .click();
  }
  for (const i of order) await tapBar(i);
}

/** Opens a focused session on a skill, with what it builds on mastered. */
async function open(page: Page, skillId: string, mastered: readonly string[]) {
  await freshStart(page);
  await masterSkills(page, mastered);
  await focusSession(page, skillId);
  await expect(card(page)).toBeVisible();
}

/** Answers cards right until `want` matches an unguided card's prompt; returns with it on screen. */
async function reachCard(page: Page, want: RegExp) {
  for (let i = 0; i < 24; i++) {
    await expect(card(page)).toBeVisible();
    const task = await prompt(page);
    if (!task.includes('to continue') && want.test(task)) return;
    await answerRight(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    // The session moves on by itself after a right answer.
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  }
  throw new Error(`No unguided card matched ${want}`);
}

const BASICS = ['F4.pulse', 'T1.simple-meters'];

test.describe('M8-18 form reading', () => {
  test('a pickup tune is worked through with the bars counted @layout', async ({ page }) => {
    await open(page, 'T6.pickups', BASICS);
    expect(await prompt(page)).toContain('to continue');
    // The worked example rings the bar to tap and numbers every bar.
    await expect(bars(page)).toHaveCount(5);
    await expect(card(page).locator('[data-state="asked"]')).toHaveCount(1);
    await expect(bars(page).first()).toContainText('Pickup');
    await expect(page.getByTestId('form-feedback')).toContainText("it's a pickup");

    // iPad: every bar is a comfortable target, and the tune fits (design §7).
    const sizes = await bars(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    await answerRight(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('tapping the pickup as bar 1 is marked and explained', async ({ page }) => {
    await open(page, 'T6.pickups', BASICS);
    await reachCard(page, /^Tap bar \d\.$/);
    // Unnumbered until answered: the numbers would give the answer away.
    await expect(bars(page).first()).not.toContainText('Pickup');
    await bars(page).first().getByRole('button').click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(bars(page).first()).toHaveAttribute('data-state', 'wrong');
    await expect(card(page).locator('[data-state="expected"]')).toHaveCount(1);
    await expect(bars(page).first()).toContainText('Pickup');
    await expect(page.getByTestId('form-feedback')).toContainText("so it isn't counted");
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a wrong turn at a repeat shows the order and its rule', async ({ page }) => {
    await open(page, 'T6.repeats', BASICS);
    await reachCard(page, /^After bar \d/);
    await expect(card(page).locator('[data-state="asked"]')).toHaveCount(1);
    const right = await (async () => {
      const order = playOrder(marksOf(await labels(page)));
      const asked = Number(/after bar (\d)/i.exec(await prompt(page))![1]);
      return `Bar ${nextBar(order, asked - 1, 1) + 1}`;
    })();
    const names = await card(page)
      .getByRole('group')
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    await card(page)
      .getByRole('group')
      .getByRole('button', { name: names.find((n) => n !== right)!, exact: true })
      .click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(card(page).getByRole('group').locator('[data-state="expected"]')).toHaveText(
      right.replace('Bar ', ''),
    );
    await expect(page.getByTestId('form-feedback')).toContainText(/Play [\d ]+\./);
    await expect(page.getByTestId('form-feedback')).toContainText('end repeat');
    await expect(page.getByRole('button', { name: 'Hear it in order' })).toBeVisible();
  });

  test('the play order ends at the first wrong tap', async ({ page }) => {
    await open(page, 'T6.repeats', BASICS);
    await reachCard(page, /in the order you play them\.$/);
    // Bar 1, then bar 1 again: the tune always goes on to bar 2 first.
    await bars(page).nth(0).getByRole('button').click();
    await expect(page.getByTestId('form-path')).toHaveText('Your order: 1');
    await bars(page).nth(0).getByRole('button').click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(bars(page).nth(1)).toHaveAttribute('data-state', 'expected');
    await expect(page.getByTestId('form-feedback')).toContainText('Play 1 2');
  });

  test('endings are followed in order from a hardware keyboard', async ({ page }) => {
    await open(page, 'T6.endings', [...BASICS, 'T6.repeats']);
    // The second card of a new road map is its play order, as a worked example.
    for (let i = 0; i < 6 && !(await prompt(page)).includes('order'); i++) {
      await answerRight(page);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    const task = await prompt(page);
    expect(task).toContain('order');
    const order = playOrder(marksOf(await labels(page)));
    expect(order.length).toBeGreaterThan(marksOf(await labels(page)).length);
    for (const i of order) await press(page, String(i + 1));
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('a pickup card on a phone @smoke @phone', async ({ page }) => {
    await open(page, 'T6.pickups', BASICS);
    expect(await prompt(page)).toContain('to continue');
    await expectNoHorizontalOverflow(page);
    await answerRight(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });
});
