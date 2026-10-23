import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';

// M8-01: the timing engine's tap-to-click calibration (design §12), in
// Settings. The onsets come from the e2e fake (timing/e2e-hook.ts), which
// echoes every click a set number of ms after it is heard, so the measured
// offset is exact; the click itself is real, on the Tone Transport.

const FAKE_ONSETS_KEY = 'fretwork.e2e.fakeOnsets';

type HookWindow = Window & { fretworkFakeOnsets?: { echo: number | null } };

const timing = (page: Page) =>
  page.getByRole('main').getByRole('group', { name: 'Guides and timing' });

async function openSettings(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((key) => localStorage.setItem(key, '1'), FAKE_ONSETS_KEY);
  await tapAudioOutput(page);
  await freshStart(page, '/settings');
  await expect(timing(page)).toBeVisible();
  return errors;
}

/** Sets the fake learner's offset; the hook exists once a run has started. */
async function echo(page: Page, ms: number | null) {
  await page.waitForFunction(() => Boolean((window as HookWindow).fretworkFakeOnsets));
  await page.evaluate((v) => {
    (window as HookWindow).fretworkFakeOnsets!.echo = v;
  }, ms);
}

/** The loudest output over `ms`, sampled faster than a click lasts. */
async function peakLevel(page: Page, ms: number): Promise<number> {
  // Let a click already sounding at the stop ring out first.
  await expect
    .poll(() => audioLevel(page), { timeout: 1_000, intervals: [20] })
    .toBeLessThan(0.001);
  return page.evaluate(async (duration) => {
    let peak = 0;
    const end = performance.now() + duration;
    while (performance.now() < end) {
      peak = Math.max(peak, window.__audioTap?.level() ?? 0);
      await new Promise((r) => setTimeout(r, 10));
    }
    return peak;
  }, ms);
}

test.describe('M8-01 timing calibration', () => {
  test('counts in, clicks, measures the offset and keeps it @smoke @layout', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await openSettings(page);
    await expect(timing(page).getByTestId('timing-offset-tap')).toHaveText('not checked');
    // Mic mode is off, so there is no guitar row.
    await expect(timing(page).getByTestId('timing-offset-mic')).toHaveCount(0);

    await timing(page).getByRole('button', { name: 'Check', exact: true }).click();
    await expect(timing(page).getByText(/A bar of four counts you in/)).toBeVisible();
    await timing(page).getByRole('button', { name: 'Start' }).click();
    await echo(page, 25);

    const pad = timing(page).getByRole('button', { name: 'Tap on each click' });
    await expect(pad).toBeVisible();
    await expect(pad).toBeFocused();
    const box = await pad.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    // The click sounds.
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [20] })
      .toBeGreaterThan(0.01);

    await expect(timing(page).getByTestId('timing-calibration-result')).toHaveText(
      /Your taps land 25 ms late on this device/,
      { timeout: 30_000 },
    );
    await expect(timing(page).getByTestId('timing-offset-tap')).toHaveText('25 ms late');
    await timing(page).getByRole('button', { name: 'Done' }).click();
    await expect(timing(page).getByRole('button', { name: 'Check again' })).toBeVisible();

    // It is saved in settings.
    await page.reload();
    await expect(timing(page).getByTestId('timing-offset-tap')).toHaveText('25 ms late');
    expect(errors).toEqual([]);
  });

  test('cancelling stops the click and saves nothing', async ({ page }) => {
    const errors = await openSettings(page);
    await timing(page).getByRole('button', { name: 'Check', exact: true }).click();
    await timing(page).getByRole('button', { name: 'Start' }).click();
    await expect(timing(page).getByText(/Get ready/)).toBeVisible();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [20] })
      .toBeGreaterThan(0.01);
    await timing(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(timing(page).getByRole('button', { name: 'Start' })).toBeVisible();
    // Silent from here: no click is left queued on the Transport. Clicks are
    // 30ms apart from 600ms of quiet, so watch the peak over a few beats.
    expect(await peakLevel(page, 1500)).toBeLessThan(0.001);
    await expect(timing(page).getByTestId('timing-offset-tap')).toHaveText('not checked');
    expect(errors).toEqual([]);
  });
});
