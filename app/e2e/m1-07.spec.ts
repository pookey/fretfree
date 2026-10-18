import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, freshStart } from './helpers';

// Latency calibration (design §3.2, §4 step 5): tap the lit dot, and the
// trimmed median tap time becomes the baseline for every speed target.

const TRIALS = 16;
const ONBOARDING_STEPS = 7;
// Calibration is step 6; the placement test (M2-09) follows it.
const CALIBRATION_STEP = 6;

// The page clock is paused during a run, so tap times don't depend on how busy
// the machine is. Each dot lights within the longest pause (foreperiodMs.max),
// and the tap comes REACTION_MS after that pause ends.
const MAX_PAUSE_MS = 1000;
const REACTION_MS = 300;

const calibrationNeck = (page: Page) => page.getByRole('group', { name: 'Calibration neck' });

/** Tap every dot as it lights, and return the stored tap time from the result. */
async function runCalibration(page: Page): Promise<number> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.getByRole('button', { name: 'Start' }).click();
  // Other necks (e.g. the Progress heatmap) render cells too.
  const neck = calibrationNeck(page);
  const dot = neck.getByTestId('marker-target');
  for (let n = 1; n <= TRIALS; n++) {
    await expect(dot).toHaveCount(0);
    await page.clock.runFor(MAX_PAUSE_MS);
    await expect(dot).toBeVisible();
    const cell = await dot.evaluate((g) => `s${g.dataset.string}f${g.dataset.fret}`);
    await page.clock.runFor(REACTION_MS);
    await neck.locator(`[data-cell="${cell}"]`).click();
  }
  const result = page.getByTestId('calibration-result');
  await expect(result).toHaveText(/Your tap time is \d+ ms/);
  await page.clock.resume();
  const ms = Number(/(\d+) ms/.exec((await result.textContent())!)![1]);
  expect(ms).toBeGreaterThanOrEqual(REACTION_MS);
  expect(ms).toBeLessThanOrEqual(MAX_PAUSE_MS + REACTION_MS);
  return ms;
}

async function expectStoredBaseline(page: Page, text: string) {
  await page.goto('/progress');
  await expect(
    page.getByRole('region', { name: 'Settings' }).getByTestId('latency-baseline'),
  ).toHaveText(text);
}

test.describe('M1-07 latency calibration', () => {
  // A 16-dot run is many steps; leave room for a loaded machine.
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test('onboarding ends with a calibration that sets the tap time @smoke', async ({
    page,
  }, info) => {
    await firstLaunch(page);
    await page.getByRole('button', { name: 'Get started' }).click();
    for (let n = 1; n < CALIBRATION_STEP; n++)
      await page.getByRole('button', { name: 'Skip this step' }).click();

    await expect(page.getByRole('heading', { name: 'Tap the lit dots', level: 1 })).toBeVisible();
    await expect(page.getByTestId('onboarding-progress')).toHaveText(
      `Step ${CALIBRATION_STEP} of ${ONBOARDING_STEPS}`,
    );
    await expect(page.getByText(/Tap each dot as soon as it lights up: 16 dots/)).toBeVisible();
    await expect(calibrationNeck(page).getByTestId('marker-target')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // Regular-wide: the neck sits in the choice pane, beside the explanation,
    // and its cells stay at least 44pt.
    const choice = page.getByTestId('onboarding-choice');
    const neck = calibrationNeck(page);
    await expect(neck).toBeVisible();
    if (info.project.name !== 'iphone-smoke') {
      const cell = await neck.locator('[data-cell="s1f5"]').boundingBox();
      expect(cell!.width).toBeGreaterThanOrEqual(44);
      expect(cell!.height).toBeGreaterThanOrEqual(44);
    }

    const ms = await runCalibration(page);
    await expectNoHorizontalOverflow(page);
    await choice.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip this step' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    await expectStoredBaseline(page, `${ms} ms`);
  });

  test('skipping calibration keeps the default timing', async ({ page }) => {
    await firstLaunch(page);
    await page.getByRole('button', { name: 'Get started' }).click();
    for (let n = 1; n <= ONBOARDING_STEPS; n++)
      await page.getByRole('button', { name: 'Skip this step' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expectStoredBaseline(page, 'not measured');
  });

  test('Progress → Settings re-runs the calibration', async ({ page }) => {
    await freshStart(page, '/progress');
    const settings = page.getByRole('region', { name: 'Settings' });
    await expect(settings.getByTestId('latency-baseline')).toHaveText('not measured');
    await settings.getByRole('button', { name: 'Measure' }).click();
    await expect(settings.getByRole('button', { name: 'Close' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expectNoHorizontalOverflow(page);

    const ms = await runCalibration(page);
    await expect(settings.getByTestId('latency-baseline')).toHaveText(`${ms} ms`);
    await settings.getByRole('button', { name: 'Done' }).click();
    await expect(settings.getByRole('button', { name: 'Recalibrate' })).toBeVisible();
    await expect(calibrationNeck(page)).toHaveCount(0);

    // The new tap time survives a relaunch.
    await page.reload();
    await expect(settings.getByTestId('latency-baseline')).toHaveText(`${ms} ms`);
  });
});
