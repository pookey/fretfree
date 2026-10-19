import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M5-05: D16 "Play the note". The learner plays the named note on a real
// guitar and the mic grades it (design §6 mic constraint). A fake pitch
// source stands in for the mic: M5-06's hook in main.tsx installs it when a
// spec sets `window.__fretworkFakeMic = true`, and puts it in its place.
// D16 is served only with mic mode on, and only after another drill has
// served the item (the picker varies the drill, research/02 rule 12).

const ITEM = 'find:A@s6';

interface FakeMic {
  play(note: string): void;
  failNextStart(reason: string): void;
  readonly startCalls: number;
}
type MicWindow = { __fretworkFakeMic?: true | FakeMic };

/** Waits for main.tsx to swap the flag for the fake source. */
async function micReady(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as MicWindow).__fretworkFakeMic === 'object');
}

/** Plays a note into the fake mic, e.g. `A2`. */
async function playNote(page: Page, note: string): Promise<void> {
  await micReady(page);
  await page.evaluate((n) => ((window as MicWindow).__fretworkFakeMic as FakeMic).play(n), note);
}

/** How many times the mic was asked to start (permission prompts). */
async function micStarts(page: Page): Promise<number> {
  await micReady(page);
  return page.evaluate(() => ((window as MicWindow).__fretworkFakeMic as FakeMic).startCalls);
}

async function failNextStart(page: Page, reason: string): Promise<void> {
  await micReady(page);
  await page.evaluate(
    (r) => ((window as MicWindow).__fretworkFakeMic as FakeMic).failNextStart(r),
    reason,
  );
}

/** Turns mic mode on, as M5-04's setting will. */
async function enableMic(page: Page, on = true): Promise<void> {
  await page.evaluate(async (micEnabled) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const store = () => db.transaction('settings', 'readwrite').objectStore('settings');
    const row = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const req = store().get('singleton');
      req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    });
    await new Promise<void>((resolve, reject) => {
      const req = store().put({ ...row, key: 'singleton', micEnabled });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  }, on);
  await page.reload();
}

const drillArea = (page: Page) => page.locator('[data-drill]');

/** A session on one item, the way "Quiz me on this" focuses one. */
async function focusItem(page: Page, itemId: string): Promise<void> {
  await page.goto(`/session?item=${encodeURIComponent(itemId)}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
  await expect(drillArea(page)).toHaveAttribute('data-drill', /./);
}

/** Answer D2 ("Find A on string 6") right until D16 serves the item. */
async function reachD16(page: Page): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    const drill = await drillArea(page).getAttribute('data-drill');
    if (drill === 'play-the-note') return;
    expect(drill).toBe('find-the-note');
    await page.locator('svg[data-fret-from] [data-cell="s6f5"]').click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  }
  throw new Error('D16 never served the item');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as MicWindow).__fretworkFakeMic = true;
  });
  await freshStart(page);
});

test.describe('D16 "Play the note"', () => {
  test('starts the mic on a tap and grades the note played @smoke', async ({ page }) => {
    await enableMic(page);
    await focusItem(page, ITEM);
    await reachD16(page);

    await expect(page.getByTestId('d16-prompt')).toContainText('A on string 6');
    // The mic waits for the learner (design §9).
    expect(await micStarts(page)).toBe(0);
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByTestId('d16-mic')).toHaveAttribute('data-state', 'running');
    await expect(page.getByTestId('d16-mic')).toContainText('Listening');
    await expectNoHorizontalOverflow(page);

    await playNote(page, 'A2');
    await expect(page.getByTestId('feedback-correct')).toContainText('A');
    await expect(page.getByTestId('d16-explain')).toContainText('A is at fret 5 on string 6.');
    await expect(page.getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
  });

  test('shows a wrong note against the right one', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await enableMic(page);
    await focusItem(page, ITEM);
    await reachD16(page);
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByTestId('d16-mic')).toHaveAttribute('data-state', 'running');

    await playNote(page, 'B2');
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was A.');
    await expect(page.getByTestId('d16-explain')).toHaveText(
      'You played B2. A is at fret 5 on string 6.',
    );
    await expect(page.getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
    await expect(page.getByTestId('marker-wrong')).toHaveAttribute('data-fret', '7');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('explains a blocked microphone and tries again', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await enableMic(page);
    await focusItem(page, ITEM);
    await reachD16(page);

    await failNextStart(page, 'denied');
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByRole('alert')).toContainText('microphone access was blocked');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('d16-mic')).toHaveAttribute('data-state', 'running');
  });

  test('is never served without mic mode', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await focusItem(page, ITEM);
    const summary = page.getByTestId('session-summary');
    for (let i = 0; i < 4; i += 1) {
      await expect(drillArea(page).or(summary)).toBeVisible();
      if (await summary.isVisible()) break;
      await expect(drillArea(page)).toHaveAttribute('data-drill', 'find-the-note');
      await page.locator('svg[data-fret-from] [data-cell="s6f5"]').click();
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    expect(await micStarts(page)).toBe(0);
  });
});
