import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';
import { focusSession } from './helpers/focus';

// M8-13: R4 rhythm-cell skills and D27 "Rhythm reading" on the M8-01 timing
// engine. The click is real, on the Tone Transport; the onsets come from the
// e2e fake (timing/e2e-hook.ts), which plays an onset a set number of ms
// after every click. R4.eighths opens on "a quarter" (`rhythm:quarter`), a
// blocked bar of four quarters at scope 0, whose click is on every note, so
// every note gets an onset.

const FAKE_ONSETS_KEY = 'fretwork.e2e.fakeOnsets';

type HookWindow = Window & { fretworkFakeOnsets?: { echo: number | null } };

const session = (page: Page) => page.getByTestId('session');

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((key) => localStorage.setItem(key, '1'), FAKE_ONSETS_KEY);
  await tapAudioOutput(page);
  await freshStart(page);
  // A focus can't unlock a skill: reading a bar comes after the meter and the eighths.
  await masterSkills(page, ['F4.pulse', 'F4.eighths', 'T1.simple-meters']);
  await focusSession(page, 'R4.eighths');
  await expect(session(page).getByTestId('d27-prompt')).toContainText('Tap quarter in 4/4');
  return errors;
}

/** Plays every note `ms` after its click; the hook exists once a rep has started. */
async function echo(page: Page, ms: number) {
  await page.waitForFunction(() => Boolean((window as HookWindow).fretworkFakeOnsets));
  await page.evaluate((v) => {
    (window as HookWindow).fretworkFakeOnsets!.echo = v;
  }, ms);
}

/** The first exposure: hear the bar, and only then see it. */
async function hearFirst(page: Page) {
  const drill = session(page);
  await expect(drill.getByTestId('d27-explain')).toContainText('Listen first');
  await expect(drill.getByTestId('d27-listen')).toBeVisible();
  await expect(drill.getByRole('group', { name: /The bar to read/ })).toHaveCount(0);
  await expect(drill.getByRole('button', { name: 'Start' })).toHaveCount(0);
  await drill.getByRole('button', { name: 'Hear the rhythm' }).click();
  await expect
    .poll(() => audioLevel(page), { timeout: 10_000, intervals: [20] })
    .toBeGreaterThan(0.01);
  // A bar of count-in and the bar at 60–72 BPM: well under 10 s.
  await expect(drill.getByRole('group', { name: 'The bar to read, in 4 4 time' })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * A right answer shows for a few seconds before the session moves on, so it
 * is watched for on every frame rather than polled.
 */
async function expectCorrect(page: Page, text: string) {
  await page.waitForFunction(
    (t) => document.querySelector('[data-testid="feedback-correct"]')?.textContent === t,
    text,
    { timeout: 40_000, polling: 'raf' },
  );
}

test.describe('M8-13 D27 rhythm reading', () => {
  test('hears a new cell first, then reads it and taps it in time @smoke @layout', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = await open(page);
    const drill = session(page);
    await hearFirst(page);
    // Every guide on the worked example: the count under the notes.
    await expect(drill.getByTestId('d27-count')).toHaveText(['1', '2', '3', '4']);
    await expect(drill.getByTestId('d27-explain')).toContainText('Now read it');
    await expectNoHorizontalOverflow(page);

    await drill.getByRole('button', { name: 'Start' }).click();
    await echo(page, 10);
    const pad = drill.getByRole('button', { name: 'Tap the rhythm' });
    await expect(pad).toBeFocused();
    await expect(pad).toBeInViewport();
    const box = await pad.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    // The staff stays in view above the pad while tapping.
    await expect(drill.getByRole('group', { name: /The bar to read/ })).toBeInViewport();

    await expectCorrect(page, '✓ 8 of 8 on time');
    expect(errors).toEqual([]);
  });

  test('marks a late rep note by note and offers a wider window @layout', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page);
    const drill = session(page);
    await hearFirst(page);
    await drill.getByRole('button', { name: 'Start' }).click();
    await echo(page, 90);

    await expect(page.getByTestId('feedback-wrong')).toContainText('0 of 8 on time', {
      timeout: 40_000,
    });
    await expect(drill.getByTestId('d27-explain')).toContainText('ms off on average');
    const results = drill.getByTestId('d27-results');
    const first = results.getByRole('list', { name: 'Time 1' }).getByRole('listitem');
    await expect(first).toHaveCount(4);
    await expect(first.first()).toHaveAccessibleName(/^1: too late, \d+ ms late$/);
    await expect(results.getByRole('list', { name: 'Time 2' })).toBeVisible();
    await expect(drill.getByTestId('d27-window')).toContainText('Taps count within 80 ms');
    // The bar can be heard again beside the marks.
    await expect(drill.getByRole('button', { name: 'Hear the bar' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(drill.getByTestId('d27-results')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
