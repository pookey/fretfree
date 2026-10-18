import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, freshStart } from './helpers';

// Latency calibration (design §3.2, §4 step 5): tap the lit dot, and the
// trimmed median tap time becomes the baseline for every speed target.

const TRIALS = 16;
const ONBOARDING_STEPS = 6;

// A human-ish pause before each tap: an instant scripted tap would count as an
// anticipation and be trimmed.
const REACTION_MS = 250;

/** Tap every dot as it lights, and return the stored tap time from the result. */
async function runCalibration(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'Start' }).click();
  const dot = page.getByTestId('marker-target');
  for (let n = 1; n <= TRIALS; n++) {
    await expect(dot).toBeVisible();
    const cell = `s${await dot.getAttribute('data-string')}f${await dot.getAttribute('data-fret')}`;
    await page.waitForTimeout(REACTION_MS);
    await page.locator(`[data-cell="${cell}"]`).click();
    if (n < TRIALS) await expect(page.getByTestId('calibration-count')).toHaveText(`${n} of 16`);
  }
  const result = page.getByTestId('calibration-result');
  await expect(result).toHaveText(/Your tap time is \d+ ms/);
  const ms = Number(/(\d+) ms/.exec((await result.textContent())!)![1]);
  expect(ms).toBeGreaterThanOrEqual(REACTION_MS);
  expect(ms).toBeLessThan(2500);
  return ms;
}

async function expectStoredBaseline(page: Page, text: string) {
  await page.goto('/progress');
  await expect(
    page.getByRole('region', { name: 'Settings' }).getByTestId('latency-baseline'),
  ).toHaveText(text);
}

test.describe('M1-07 latency calibration', () => {
  test.describe.configure({ timeout: 90_000 });

  test('onboarding ends with a calibration that sets the tap time @smoke', async ({
    page,
  }, info) => {
    await firstLaunch(page);
    await page.getByRole('button', { name: 'Get started' }).click();
    for (let n = 1; n < ONBOARDING_STEPS; n++)
      await page.getByRole('button', { name: 'Skip this step' }).click();

    await expect(page.getByRole('heading', { name: 'Tap the lit dots', level: 1 })).toBeVisible();
    await expect(page.getByTestId('onboarding-progress')).toHaveText('Step 6 of 6');
    await expect(page.getByText(/Tap each dot as soon as it lights up: 16 dots/)).toBeVisible();
    await expect(page.getByTestId('marker-target')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // Regular-wide: the neck sits in the choice pane, beside the explanation,
    // and its cells stay at least 44pt.
    const choice = page.getByTestId('onboarding-choice');
    const neck = choice.getByRole('group', { name: 'Calibration neck' });
    await expect(neck).toBeVisible();
    if (info.project.name !== 'iphone-smoke') {
      const cell = await neck.locator('[data-cell="s1f5"]').boundingBox();
      expect(cell!.width).toBeGreaterThanOrEqual(44);
      expect(cell!.height).toBeGreaterThanOrEqual(44);
    }

    const ms = await runCalibration(page);
    await expectNoHorizontalOverflow(page);
    await choice.getByRole('button', { name: 'Continue' }).click();
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
    await expect(page.getByRole('group', { name: 'Calibration neck' })).toHaveCount(0);

    // The new tap time survives a relaunch.
    await page.reload();
    await expect(settings.getByTestId('latency-baseline')).toHaveText(`${ms} ms`);
  });
});
