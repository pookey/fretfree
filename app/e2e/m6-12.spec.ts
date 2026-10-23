import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { tapAudioOutput } from './helpers/audio';
import { focusSession } from './helpers/focus';

// M6-12: D20's grid (M6-10 finding 3). Every box is the same size, since in
// a rhythm a bigger box reads as an accent; Start sits under the rhythm in the
// prompt column; and the feedback marks each hit against its click, with no
// glyph that reads as a play button. The onsets come from the e2e fake
// (timing/e2e-hook.ts), as in m6-08.spec.ts.

const FAKE_ONSETS_KEY = 'fretwork.e2e.fakeOnsets';

type HookWindow = Window & { fretworkFakeOnsets?: { echo: number | null } };

const session = (page: Page) => page.getByTestId('session');

/** A fresh learner on F4.eighths: a hit on every box, and an unchecked tap timing. */
async function openEighths(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((key) => localStorage.setItem(key, '1'), FAKE_ONSETS_KEY);
  await tapAudioOutput(page);
  await freshStart(page);
  await masterSkills(page, ['F4.pulse']);
  await focusSession(page, 'F4.eighths');
  await expect(session(page).getByTestId('d20-prompt')).toContainText('Eighth notes');
  return errors;
}

/** Plays every hit `ms` after its click; the hook exists once a rep has started. */
async function echo(page: Page, ms: number) {
  await page.waitForFunction(() => Boolean((window as HookWindow).fretworkFakeOnsets));
  await page.evaluate((v) => {
    (window as HookWindow).fretworkFakeOnsets!.echo = v;
  }, ms);
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

/** Each step's box (its first child), left to right. */
async function boxes(grid: Locator) {
  const cells = grid.getByRole('listitem');
  await expect(cells).toHaveCount(8);
  return Promise.all((await cells.all()).map((cell) => box(cell.locator('span').first())));
}

/** All the same size, and a beat's two eighths closer together than the beats. */
async function expectEqualGroupedBoxes(grid: Locator) {
  const all = await boxes(grid);
  for (const b of all) {
    expect(Math.abs(b.width - all[0]!.width)).toBeLessThan(0.5);
    expect(Math.abs(b.height - all[0]!.height)).toBeLessThan(0.5);
    expect(Math.abs(b.y - all[0]!.y)).toBeLessThan(0.5);
  }
  const gap = (i: number) => all[i + 1]!.x - (all[i]!.x + all[i]!.width);
  for (const within of [0, 2, 4, 6]) expect(gap(within)).toBeLessThan(gap(1));
  expect(gap(3)).toBeCloseTo(gap(1), 0);
  expect(gap(5)).toBeCloseTo(gap(1), 0);
}

test.describe('M6-12 D20 grid', () => {
  test('boxes are all one size, and Start sits under the rhythm, on screen @smoke @layout', async ({
    page,
  }) => {
    const errors = await openEighths(page);
    const drill = session(page);
    const grid = drill.getByRole('list', { name: 'The rhythm, one bar' });
    await expectEqualGroupedBoxes(grid);
    // The counts under the boxes sit on one line.
    const counts = await Promise.all(
      (await grid.getByRole('listitem').all()).map((cell) => box(cell.locator('span').nth(1))),
    );
    for (const c of counts) expect(Math.abs(c.y - counts[0]!.y)).toBeLessThan(0.5);

    // Start: under the grid, centred on the prompt's column, and on screen
    // without scrolling, even with the timing-check reminder showing.
    await expect(drill.getByTestId('d20-calibrate')).toBeVisible();
    const start = drill.getByRole('button', { name: 'Start' });
    await expect(start).toBeInViewport({ ratio: 1 });
    const s = await box(start);
    const g = await box(grid);
    const prompt = await box(drill.getByTestId('d20-prompt'));
    expect(s.y).toBeGreaterThan(g.y + g.height);
    expect(Math.abs(s.x + s.width / 2 - (prompt.x + prompt.width / 2))).toBeLessThan(2);
    const reminder = await box(drill.getByTestId('d20-calibrate'));
    expect(reminder.y).toBeGreaterThan(s.y + s.height);
    // Beside the context panel (iPad landscape), Start stays left of it.
    const panel = page.getByTestId('context-panel');
    if (await panel.isVisible()) {
      const p = await box(panel);
      if (p.y < s.y + s.height && p.x > s.x) expect(s.x + s.width).toBeLessThanOrEqual(p.x);
    }
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('marks each late hit right of its click, with no play-button glyph @smoke @layout', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await openEighths(page);
    const drill = session(page);
    await drill.getByRole('button', { name: 'Start' }).click();
    await echo(page, 90);
    await expect(page.getByTestId('feedback-wrong')).toBeVisible({ timeout: 30_000 });

    const results = drill.getByTestId('d20-results');
    await expect(results).toContainText('left of the line is early, right is late');
    await expect(results).not.toContainText('▶');
    for (const bar of ['Bar 1', 'Bar 2']) {
      const grid = results.getByRole('list', { name: bar });
      await expectEqualGroupedBoxes(grid);
      const cells = grid.getByRole('listitem');
      await expect(cells.first()).toHaveAccessibleName('1: too late, 90 ms late');
      for (const cell of await cells.all()) {
        // The marker's parts: the click line, the tail, then the hit dot.
        const parts = cell.locator('[data-side="late"] > span');
        await expect(parts).toHaveCount(3);
        const click = await box(parts.nth(0));
        const hit = await box(parts.nth(2));
        const outer = await box(cell.locator('span').first());
        const clickX = click.x + click.width / 2;
        // The click is the box's middle; the hit is to its right, clear of
        // the line even in a phone's boxes, and inside the box.
        expect(Math.abs(clickX - (outer.x + outer.width / 2))).toBeLessThan(1);
        expect(hit.x).toBeGreaterThan(click.x + click.width + 2);
        expect(hit.x + hit.width).toBeLessThanOrEqual(outer.x + outer.width);
      }
    }
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
});
