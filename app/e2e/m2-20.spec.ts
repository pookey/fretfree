import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import {
  C3_SKILLS,
  SKILLS_BEFORE_C3,
  THIRDS_SHAPES,
  seedIntervals,
  type SeedCard,
} from './helpers/intervals';

// M2-20: on iPad portrait, D5 and D6 stack prompt, answers, neck and help as
// one column from the top, instead of centring the neck in a tall empty band
// with the help panel pinned to the bottom (M2-14 QA).
//
// With SCREENSHOTS=<dir> each layout is also saved there (run from app/):
//   SCREENSHOTS=/tmp/m2-20 pnpm e2e:only e2e/m2-20.spec.ts --project ipad-portrait

/** The most of the viewport's height the prompt may sit above the neck. */
const MAX_PROMPT_GAP = 0.15;
/** Apple's minimum touch target, in CSS px. */
const MIN_CELL = 44;
const PORTRAIT = 'ipad-portrait';

/**
 * C3.thirds in practice at guide level 2 (so the help panel shows), with
 * every other skill mastered. `due` picks the drill: `interval-name:` cards
 * are D5's, `interval:` cards D6's; the other direction is known and not due.
 * Reloads.
 */
async function seedThirds(page: Page, due: 'interval-name' | 'interval'): Promise<void> {
  const cards: SeedCard[] = THIRDS_SHAPES.flatMap((shape) =>
    (['interval-name', 'interval'] as const).map((prefix) => ({
      itemId: `${prefix}:${shape}`,
      skillId: 'C3.thirds',
      ...(prefix === due ? { dueInDays: -1, stability: 3 } : { dueInDays: 30, stability: 60 }),
      reviewedDaysAgo: 3,
    })),
  );
  await seedIntervals(page, {
    mastered: [...SKILLS_BEFORE_C3, ...C3_SKILLS.filter((s) => s !== 'C3.thirds')],
    cards,
    practising: [{ skillId: 'C3.thirds', guideLevel: 2 }],
  });
}

type Box = { x: number; y: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, selector).not.toBeNull();
  return b!;
}

const neckSelector = 'svg[data-fret-from]';

/** The checks both drills share: a tight column, the neck and help in view, 44pt cells. */
async function expectPortraitColumn(page: Page, name: string): Promise<void> {
  const vh = page.viewportSize()!.height;
  const prompt = await box(page, '#drill-prompt');
  const neck = await box(page, neckSelector);
  const help = await box(page, '[data-testid="context-panel"]');

  // The neck follows the prompt closely, not centred in a tall empty band.
  const gap = neck.y - (prompt.y + prompt.height);
  expect(gap).toBeGreaterThan(0);
  expect(gap / vh, `${name}: prompt-to-neck gap ${Math.round(gap)}px`).toBeLessThan(MAX_PROMPT_GAP);

  // The help panel follows the neck, not pinned to the bottom of the screen.
  const helpGap = help.y - (neck.y + neck.height);
  expect(helpGap).toBeGreaterThan(0);
  expect(helpGap / vh, `${name}: neck-to-help gap ${Math.round(helpGap)}px`).toBeLessThan(
    MAX_PROMPT_GAP,
  );
  // It spans the neck's width, so its rows spread across rather than down.
  expect(help.width).toBeGreaterThanOrEqual(neck.width - 1);

  // The whole neck is in view without scrolling, with touch-sized cells.
  await expect(page.locator(neckSelector)).toBeInViewport({ ratio: 1 });
  const cell = await box(page, `${neckSelector} rect[data-cell^="s1f"]`);
  expect(cell.width).toBeGreaterThanOrEqual(MIN_CELL);
  expect(cell.height).toBeGreaterThanOrEqual(MIN_CELL);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectNoHorizontalOverflow(page);

  if (process.env.SCREENSHOTS) {
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/${name}.png` });
  }
}

test.describe('M2-20 D5 and D6 on iPad portrait', () => {
  test('D5: prompt, answers, neck and legend form one column @layout', async ({ page }, info) => {
    test.skip(info.project.name !== PORTRAIT, 'iPad portrait layout');
    await freshStart(page);
    await seedThirds(page, 'interval-name');
    await focusSession(page, 'C3.thirds');
    await expect(page.getByTestId('d5-drill')).toBeVisible();
    await expect(page.getByTestId('interval-legend')).toBeVisible();

    await expectPortraitColumn(page, 'd5-portrait');

    // Every answer button is in view, above the neck, without scrolling.
    const buttons = page.getByRole('group', { name: /interval/i }).getByRole('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(2);
    for (const b of await buttons.all()) await expect(b).toBeInViewport({ ratio: 1 });
    const neck = await box(page, neckSelector);
    const last = (await buttons.last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(neck.y);

    // Feedback keeps the column: the legend marks the answer in place.
    await buttons.first().click();
    await expect(page.getByTestId('feedback-bar')).toHaveAttribute('data-state', /correct|wrong/);
    await expectPortraitColumn(page, 'd5-portrait-feedback');
  });

  test('D6: prompt, neck and help form one column @layout', async ({ page }, info) => {
    test.skip(info.project.name !== PORTRAIT, 'iPad portrait layout');
    await freshStart(page);
    await seedThirds(page, 'interval');
    await focusSession(page, 'C3.thirds');
    await expect(page.getByTestId('d6-prompt')).toBeVisible();
    await expect(page.getByTestId('context-panel')).toBeVisible();

    await expectPortraitColumn(page, 'd6-portrait');

    // The answers are the neck's cells: every one is in view, so a tap answers.
    const cells = page.locator(`${neckSelector} rect[data-cell]`);
    await expect(cells.first()).toBeInViewport({ ratio: 1 });
    await expect(cells.last()).toBeInViewport({ ratio: 1 });
  });

  test('hiding help leaves the column at the top @layout', async ({ page }, info) => {
    test.skip(info.project.name !== PORTRAIT, 'iPad portrait layout');
    await freshStart(page);
    await seedThirds(page, 'interval');
    await focusSession(page, 'C3.thirds');
    await expect(page.getByTestId('d6-prompt')).toBeVisible();
    await page.getByRole('button', { name: 'Hide help' }).click();
    await expect(page.getByTestId('context-panel')).toHaveCount(0);

    const vh = page.viewportSize()!.height;
    const prompt = await box(page, '#drill-prompt');
    const neck = await box(page, neckSelector);
    expect((neck.y - (prompt.y + prompt.height)) / vh).toBeLessThan(MAX_PROMPT_GAP);
    await expect(page.locator(neckSelector)).toBeInViewport({ ratio: 1 });
  });
});
