import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { press } from './helpers/keyboard';

// M8-06: D29 "Complete the bar". A time signature and the start of a bar;
// note values are dragged or tapped in (or typed, 1–6) to fill it, then
// checked. A wrong fill is explained ("6/8 groups in dotted quarters") and
// shown filled one right way. D29 serves T1's and T2's felt-beats cards,
// taking turns with D32, so a session reaches it once a card comes back.

const d29 = (page: Page) => page.getByTestId('d29-drill');
const d32 = (page: Page) => page.getByTestId('d32-drill');
const palette = (page: Page) => d29(page).getByRole('group', { name: 'Note values' });
const tile = (page: Page, name: string) => palette(page).getByRole('button', { name, exact: true });
const placed = (page: Page) => d29(page).getByTestId('d29-placed');

/** Eighths each value lasts, by its accessible name (a given value is `Given: …`). */
const EIGHTHS: Record<string, number> = {
  whole: 8,
  'dotted half': 6,
  half: 4,
  'dotted quarter': 3,
  quarter: 2,
  eighth: 1,
  'dotted eighth': 1.5,
  sixteenth: 0.5,
  'quarter rest': 2,
};

/** Opens a focused session on a skill, with what it builds on mastered. */
async function open(page: Page, skillId: string, mastered: readonly string[]) {
  await freshStart(page);
  await masterSkills(page, mastered);
  await focusSession(page, skillId);
}

/**
 * Answers D32's cards (right on a worked example, else whatever comes) until
 * a D29 card is on screen: D29 serves a felt-beats card when it comes back.
 */
async function reachD29(page: Page) {
  for (let i = 0; i < 30; i++) {
    await expect(d29(page).or(d32(page))).toBeVisible();
    if (await d29(page).isVisible()) return;
    const choices = d32(page).getByRole('group');
    const shown = d32(page).locator('#drill-prompt strong');
    if (await shown.count()) {
      await choices.getByText((await shown.textContent())!, { exact: true }).click();
    } else {
      await choices.getByRole('button').first().click();
    }
    const right = page.getByTestId('feedback-correct');
    const wrong = page.getByTestId('feedback-wrong');
    await expect(right.or(wrong)).toBeVisible();
    if (await wrong.isVisible()) await page.getByRole('button', { name: 'Continue' }).click();
    await expect(right.or(wrong)).toBeHidden();
  }
  throw new Error('No D29 card came up');
}

/** Eighths left to fill: the bar's length less the given start. */
async function eighthsLeft(page: Page): Promise<number> {
  const said = (await d29(page)
    .getByRole('img', { name: / time/ })
    .first()
    .getAttribute('aria-label'))!;
  const [top, bottom] = said
    .replace(/ time.*/, '')
    .split(' ')
    .map(Number);
  const given = await d29(page)
    .getByRole('img', { name: /^Given: / })
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace('Given: ', '')));
  const lengths = given.map((g) => EIGHTHS[g]);
  expect(lengths, given.join(', ')).not.toContain(undefined);
  return (top! * 8) / bottom! - lengths.reduce((n: number, l) => n + l!, 0);
}

/**
 * A finger drag: pointer events of type touch, from the middle of one
 * element to the middle of another (or well off the bar).
 */
async function touchDrag(page: Page, from: Locator, to: Locator | null): Promise<void> {
  const a = (await from.boundingBox())!;
  const b = to ? (await to.boundingBox())! : { x: a.x, y: 4, width: 0, height: 0 };
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await from.dispatchEvent('pointerdown', {
    pointerId: 11,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  });
  await page.evaluate(
    ({ start, end }) => {
      const fire = (type: string, x: number, y: number) =>
        window.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
      for (let i = 1; i <= 4; i++) {
        fire(
          'pointermove',
          start.x + ((end.x - start.x) * i) / 4,
          start.y + ((end.y - start.y) * i) / 4,
        );
      }
      fire('pointerup', end.x, end.y);
    },
    { start, end },
  );
}

test.describe('M8-06 complete the bar', () => {
  test('fills a bar by tapping and checks it @smoke', async ({ page }) => {
    await open(page, 'T1.simple-meters', ['F4.pulse']);
    await reachD29(page);
    await expect(d29(page).getByRole('group', { name: /^Your bar in / })).toBeVisible();
    const left = await eighthsLeft(page);
    // Eighths fill any bar of simple time.
    for (let i = 0; i < left; i++) await tile(page, 'Eighth').click();
    await expect(placed(page)).toHaveCount(left);
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(placed(page).first()).toHaveAttribute('data-mark', 'correct');
    await expectNoHorizontalOverflow(page);
  });

  test('on an iPad every value is a comfortable target @layout', async ({ page }) => {
    await open(page, 'T1.simple-meters', ['F4.pulse']);
    await reachD29(page);
    await tile(page, 'Quarter').click();
    const boxes = await d29(page)
      .locator('[data-tile], [data-testid="d29-placed"]')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    for (const r of boxes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    // The staff sits above the values and the palette.
    const staff = (await d29(page)
      .getByRole('group', { name: /^Your bar in / })
      .boundingBox())!;
    const values = (await palette(page).boundingBox())!;
    expect(staff.y + staff.height).toBeLessThanOrEqual(values.y);
    await expectNoHorizontalOverflow(page);
  });

  test('a finger drags values onto the bar, reorders one and drags it off @layout', async ({
    page,
  }) => {
    await open(page, 'T1.simple-meters', ['F4.pulse']);
    await reachD29(page);
    const bar = d29(page).getByTestId('d29-bar');
    await touchDrag(page, tile(page, 'Eighth'), bar);
    await touchDrag(page, tile(page, 'Quarter'), bar);
    await expect(placed(page)).toHaveCount(2);
    await expect(placed(page).nth(1)).toHaveAccessibleName('Quarter, value 2 of 2');
    // The quarter onto the eighth: it goes before it.
    await touchDrag(page, placed(page).nth(1), placed(page).nth(0));
    await expect(placed(page).nth(0)).toHaveAccessibleName('Quarter, value 1 of 2');
    // Off the bar: gone.
    await touchDrag(page, placed(page).nth(0), null);
    await expect(placed(page)).toHaveCount(1);
    await expect(placed(page).nth(0)).toHaveAccessibleName('Eighth, value 1 of 1');
    // A pointer (trackpad or mouse) drags one in too.
    await tile(page, 'Half').dragTo(bar);
    await expect(placed(page)).toHaveCount(2);
  });

  test('fills a bar from a hardware keyboard', async ({ page }) => {
    await open(page, 'T1.simple-meters', ['F4.pulse']);
    await reachD29(page);
    const left = await eighthsLeft(page);
    const key = (await tile(page, 'Eighth').getAttribute('aria-keyshortcuts'))!;
    // One too many, then Backspace undoes it.
    for (let i = 0; i <= left; i++) await press(page, key);
    await expect(placed(page)).toHaveCount(left + 1);
    await press(page, 'Backspace');
    await expect(placed(page)).toHaveCount(left);
    // A placed value moves with the arrow keys and Delete takes it out.
    await press(page, (await tile(page, 'Quarter').getAttribute('aria-keyshortcuts'))!);
    await placed(page).last().focus();
    await press(page, 'ArrowLeft');
    await expect(placed(page).nth(left - 1)).toHaveAccessibleName(/^Quarter/);
    await press(page, 'Delete');
    await expect(placed(page)).toHaveCount(left);
    // Enter on a focused value would be its click: check from the page.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await press(page, 'Enter');
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('a compound bar filled as 3/4 is explained: groups in dotted quarters', async ({ page }) => {
    await open(page, 'T2.compound-meters', ['F4.pulse', 'T1.simple-meters']);
    await reachD29(page);
    // Two beats or more are left: three quarters span two dotted-quarter beats.
    const left = await eighthsLeft(page);
    expect(left).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < 3; i++) await tile(page, 'Quarter').click();
    for (let i = 6; i < left; i++) await tile(page, 'Eighth').click();
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    const why = d29(page).getByTestId('d29-explanation');
    await expect(why).toContainText('groups in dotted quarters');
    await expect(why).toContainText('hiding it');
    // The quarter that hides the beat is marked by its edge, not colour alone.
    await expect(d29(page).locator('[data-testid="d29-placed"][data-mark="wrong"]')).toHaveCount(1);
    // One right way, with a button to hear each.
    const solution = d29(page).getByTestId('d29-solution');
    await expect(solution).toBeVisible();
    await expect(solution.getByRole('button', { name: 'Hear this bar' })).toBeVisible();
    await expect(d29(page).getByRole('button', { name: 'Hear your bar' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a bar left short says by how much', async ({ page }) => {
    await open(page, 'T1.simple-meters', ['F4.pulse']);
    await reachD29(page);
    const left = await eighthsLeft(page);
    for (let i = 1; i < left; i++) await tile(page, 'Eighth').click();
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(d29(page).getByTestId('d29-explanation')).toContainText('Short by an eighth');
  });
});
