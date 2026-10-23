import { expect, test, type Page } from '@playwright/test';
import {
  F1_SKILLS,
  F3_SKILLS,
  answer,
  expectNoHorizontalOverflow,
  freshStart,
  masterSkills,
  noteName,
  targetNote,
} from './helpers';
import { startFindSession } from './helpers/find-session';

// M1-20 compact (iPhone) polish (design §7 iPhone best-effort): a wider,
// letterboxed neck window on a phone on its side, and the context panel as a
// sheet. Multi-target drills' region-by-region fallback is pure logic
// (`neckRegions` in size-class.ts) until the first multi-target drill (D4).

const PHONE_PORTRAIT = { width: 393, height: 659 };
const PHONE_LANDSCAPE = { width: 734, height: 343 };

const neck = (page: Page) => page.locator('svg[data-fret-from]');

async function windowFrets(page: Page): Promise<number> {
  const from = Number(await neck(page).getAttribute('data-fret-from'));
  const to = Number(await neck(page).getAttribute('data-fret-to'));
  return to - from + 1;
}

/** The neck is letterboxed: it sits wholly on screen, with no page scroll. */
async function expectNeckOnScreen(page: Page): Promise<void> {
  const box = (await neck(page).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  await expectNoHorizontalOverflow(page);
}

/** The sheet is pinned to the bottom edge, full width, leaving the top of the screen clear. */
async function expectBottomSheet(page: Page, testId: string): Promise<void> {
  const sheet = page.getByTestId(testId);
  await expect(sheet).toBeVisible();
  // Let it finish sliding in.
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.round(box.y + box.height)).toBe(vp.height);
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(vp.width);
  expect(box.y).toBeGreaterThan(vp.height * 0.3);
  await expectNoHorizontalOverflow(page);
}

async function startD1Session(page: Page): Promise<void> {
  await freshStart(page);
  await masterSkills(page, [...F1_SKILLS, ...F3_SKILLS]);
  await page.getByTestId('start-session').click();
  await expect(page.getByTestId('marker-target')).toBeVisible();
}

test.describe('M1-20 compact (iPhone) polish', () => {
  test('the session degrades from iPad to a phone in either orientation @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    // iPad first: a fresh session (D3) shows the note wheel beside or below the neck.
    await freshStart(page);
    await page.getByTestId('start-session').click();
    const panel = page.getByTestId('context-panel');
    await expect(panel.getByTestId('note-wheel')).toBeVisible();
    expect(await windowFrets(page)).toBeGreaterThanOrEqual(13);
    expect((await panel.boundingBox())!.width).toBeLessThan(page.viewportSize()!.width);

    // A phone in portrait: the zoomed 5-fret window, and help moves into a sheet.
    await page.setViewportSize(PHONE_PORTRAIT);
    await expect(panel).toHaveCount(0);
    expect(await windowFrets(page)).toBe(5);
    await page.getByRole('button', { name: 'Show help' }).click();
    await expectBottomSheet(page, 'context-panel');
    await expect(panel.getByTestId('note-wheel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show help' })).toBeVisible();

    // The same phone on its side: more frets, letterboxed into the short screen.
    await page.setViewportSize(PHONE_LANDSCAPE);
    await expect.poll(() => windowFrets(page)).toBe(10);
    await expectNeckOnScreen(page);

    // Back on the iPad, the panel returns alongside, open.
    await page.setViewportSize(info.project.use.viewport!);
    await expect(panel.getByTestId('note-wheel')).toBeVisible();
  });

  test('D2 on a phone on its side slides a wider window over the neck @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await startFindSession(page);
    // The guided first reps on the iPad's whole neck.
    for (let i = 0; i < 4; i++) {
      const target = page.getByTestId('marker-target').first();
      const string = await target.getAttribute('data-string');
      const fret = await target.getAttribute('data-fret');
      await page.locator(`[data-cell="s${string}f${fret}"]`).click();
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }

    // Recall on a phone on its side: a 10-fret window from the nut, letterboxed.
    await page.setViewportSize(PHONE_LANDSCAPE);
    await expect(page.getByTestId('d2-window')).toHaveText('Frets 0–9');
    await expectNeckOnScreen(page);
    await page.getByRole('button', { name: 'Higher frets' }).click();
    await expect(page.getByTestId('d2-window')).toHaveText('Frets 3–12');

    // Answer it: every fret of the region is at most one slide away.
    const text = (await page.getByTestId('d2-prompt').textContent()) ?? '';
    const [, pc, s] = /Find ([A-G]#?) on string (\d)/.exec(text)!;
    const fret = Array.from({ length: 13 }, (_, f) => f).find(
      (f) => noteName(Number(s), f) === pc,
    )!;
    if (fret < 3) await page.getByRole('button', { name: 'Lower frets' }).click();
    await page.locator(`[data-cell="s${s}f${fret}"]`).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText(`✓ ${pc}`);
    await expect(page.getByTestId('feedback-correct')).toBeHidden();

    // Rotated upright, the window is the zoomed 5 frets again.
    await page.setViewportSize(PHONE_PORTRAIT);
    await expect(page.getByTestId('d2-window')).toHaveText('Frets 0–4');
  });

  test('the Today context panel is a sheet on a phone @layout', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await expect(page.getByTestId('context-panel')).toBeVisible();
    await page.setViewportSize(PHONE_PORTRAIT);
    await expect(page.getByTestId('context-panel')).toHaveCount(0);
    const toggle = page.getByRole('button', { name: 'Show why daily practice' });
    await toggle.click();
    await expectBottomSheet(page, 'context-sheet');
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('context-sheet')).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });

  test.describe('on a phone @smoke', () => {
    const phoneOnly = (project: string) =>
      test.skip(project !== 'iphone-smoke', 'phone happy path');

    test('a phone on its side gets a wider, letterboxed neck @layout @phone', async ({
      page,
    }, info) => {
      phoneOnly(info.project.name);
      await startD1Session(page);
      expect(await windowFrets(page)).toBe(10);
      await expectNeckOnScreen(page);
      await expect(page.getByTestId('marker-target')).toBeInViewport();
      await answer(page, await targetNote(page));
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
    });

    test('session help opens as a sheet and closes again @layout @phone', async ({
      page,
    }, info) => {
      phoneOnly(info.project.name);
      await startD1Session(page);
      const panel = page.getByTestId('context-panel');
      await expect(panel).toHaveCount(0);
      await page.getByRole('button', { name: 'Show help' }).click();
      await expectBottomSheet(page, 'context-panel');
      await expect(panel.getByRole('heading', { name: 'Musical alphabet' })).toBeVisible();
      // The header stays clear of the sheet, so its toggle closes it.
      await page.getByRole('button', { name: 'Hide help' }).click();
      await expect(panel).toHaveCount(0);
      // The drill still answers once the sheet is gone.
      const marker = page.getByTestId('marker-target');
      const note = noteName(
        Number(await marker.getAttribute('data-string')),
        Number(await marker.getAttribute('data-fret')),
      );
      await answer(page, note);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
    });

    test('Today context opens as a sheet over the tab bar @layout @phone', async ({
      page,
    }, info) => {
      phoneOnly(info.project.name);
      await freshStart(page);
      await page.getByRole('button', { name: 'Show why daily practice' }).click();
      await expectBottomSheet(page, 'context-sheet');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('context-sheet')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    });
  });
});
