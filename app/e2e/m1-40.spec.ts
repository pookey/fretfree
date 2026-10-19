import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { seedKnownNotes } from './helpers/find-session';
import { focusSession } from './helpers/focus';

// M1-40: D1 and D2 copied D1's `justify-content: space-between`, which on
// iPad portrait centred the neck in a tall empty band and pinned help to the
// bottom, as D5 and D6 did before M2-20. They now stack prompt, answers, neck
// and help as one column from the top.
//
// With SCREENSHOTS=<dir> each layout is also saved there (run from app/):
//   SCREENSHOTS=/tmp/m1-40 pnpm e2e:only e2e/m1-40.spec.ts --project ipad-portrait

/** The most of the viewport's height the prompt may sit above the neck (as in m2-20). */
const MAX_PROMPT_GAP = 0.15;
/** Apple's minimum touch target, in CSS px. */
const MIN_CELL = 44;
const PORTRAIT = 'ipad-portrait';
const SKILL = 'F2.string6-naturals';
const neckSelector = 'svg[data-fret-from]';
/** D1's answer buttons, labelled by its prompt (the neck is a group too). */
const D1_ANSWERS = /^(name the highlighted note|this is)/i;

type Box = { x: number; y: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, selector).not.toBeNull();
  return b!;
}

/** A tight column from the top: prompt, neck, then help, with 44pt cells. */
async function expectPortraitColumn(page: Page, name: string): Promise<void> {
  const vh = page.viewportSize()!.height;
  const prompt = await box(page, '#drill-prompt');
  const neck = await box(page, neckSelector);

  const gap = neck.y - (prompt.y + prompt.height);
  expect(gap).toBeGreaterThan(0);
  expect(gap / vh, `${name}: prompt-to-neck gap ${Math.round(gap)}px`).toBeLessThan(MAX_PROMPT_GAP);

  // The help panel follows the neck at its width, not pinned to the bottom.
  const help = page.getByTestId('context-panel');
  if (await help.isVisible()) {
    const h = await box(page, '[data-testid="context-panel"]');
    const helpGap = h.y - (neck.y + neck.height);
    expect(helpGap).toBeGreaterThan(0);
    expect(helpGap / vh, `${name}: neck-to-help gap ${Math.round(helpGap)}px`).toBeLessThan(
      MAX_PROMPT_GAP,
    );
    expect(h.width).toBeGreaterThanOrEqual(neck.width - 1);
  }

  await expect(page.locator(neckSelector)).toBeInViewport({ ratio: 1 });
  const cell = await box(page, `${neckSelector} rect[data-cell^="s6f"]`);
  expect(cell.width).toBeGreaterThanOrEqual(MIN_CELL);
  expect(cell.height).toBeGreaterThanOrEqual(MIN_CELL);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectNoHorizontalOverflow(page);

  if (process.env.SCREENSHOTS) {
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/${name}.png` });
  }
}

/** A fresh session on string 6's naturals opens with D1's guided examples. */
async function startD1(page: Page): Promise<void> {
  await freshStart(page);
  await focusSession(page, SKILL);
  await expect(page.getByRole('group', { name: D1_ANSWERS })).toBeVisible();
}

/** With string 6's note@ items known, the session goes to D2's find items. */
async function startD2(page: Page): Promise<void> {
  await freshStart(page);
  await seedKnownNotes(page);
  await page.reload();
  await focusSession(page, SKILL);
  await expect(page.getByTestId('d2-prompt')).toBeVisible();
}

test.describe('M1-40 D1 and D2 on iPad portrait', () => {
  test('D1: prompt, answers, neck and help form one column', async ({ page }, info) => {
    test.skip(info.project.name !== PORTRAIT, 'iPad portrait layout');
    await startD1(page);
    await expect(page.getByTestId('context-panel')).toBeVisible();

    await expectPortraitColumn(page, 'd1-portrait');

    // Every answer button is in view, above the neck.
    const buttons = page.getByRole('group', { name: D1_ANSWERS }).getByRole('button');
    for (const b of await buttons.all()) await expect(b).toBeInViewport({ ratio: 1 });
    const neck = await box(page, neckSelector);
    const last = (await buttons.last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(neck.y);
  });

  test('D2: prompt, neck and help form one column', async ({ page }, info) => {
    test.skip(info.project.name !== PORTRAIT, 'iPad portrait layout');
    await startD2(page);
    await expect(page.getByTestId('context-panel')).toBeVisible();

    await expectPortraitColumn(page, 'd2-portrait');

    // The answers are the neck's cells: every one is in view, so a tap answers.
    const cells = page.locator(`${neckSelector} rect[data-cell]`);
    await expect(cells.first()).toBeInViewport({ ratio: 1 });
    await expect(cells.last()).toBeInViewport({ ratio: 1 });
  });

  test('hiding help leaves the column at the top', async ({ page }, info) => {
    test.skip(info.project.name !== PORTRAIT, 'iPad portrait layout');
    for (const [start, name] of [
      [startD1, 'd1'],
      [startD2, 'd2'],
    ] as const) {
      await start(page);
      await page.getByRole('button', { name: 'Hide help' }).click();
      await expect(page.getByTestId('context-panel')).toHaveCount(0);
      await expectPortraitColumn(page, `${name}-portrait-no-help`);
    }
  });

  test('@smoke the D1 prompt, answers and neck fit the screen', async ({ page }) => {
    await startD1(page);
    await expect(page.locator('#drill-prompt')).toBeInViewport();
    await expect(page.locator(neckSelector)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
