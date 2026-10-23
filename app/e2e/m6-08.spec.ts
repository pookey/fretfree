import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';
import { focusSession } from './helpers/focus';

// M6-08: the F4 rhythm track and D20 "Tap and strum rhythm" on the M8-01
// timing engine. The click is real, on the Tone Transport; the onsets come
// from the e2e fake (timing/e2e-hook.ts), which plays an onset a set number
// of ms after every click is heard. The click runs on eighths, so the
// "eighth notes" rhythm (F4.eighths) has an onset on every one of its hits.

const FAKE_ONSETS_KEY = 'fretwork.e2e.fakeOnsets';

type HookWindow = Window & { fretworkFakeOnsets?: { echo: number | null } };

const session = (page: Page) => page.getByTestId('session');

async function openEighths(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((key) => localStorage.setItem(key, '1'), FAKE_ONSETS_KEY);
  await tapAudioOutput(page);
  await freshStart(page);
  // A focus can't unlock a skill: the pulse comes first.
  await masterSkills(page, ['F4.pulse']);
  await focusSession(page, 'F4.eighths');
  await expect(session(page).getByTestId('d20-prompt')).toContainText('Eighth notes');
  return errors;
}

/** Plays every hit `ms` after its click; the hook exists once a rep has started. */
async function echo(page: Page, ms: number | null) {
  await page.waitForFunction(() => Boolean((window as HookWindow).fretworkFakeOnsets));
  await page.evaluate((v) => {
    (window as HookWindow).fretworkFakeOnsets!.echo = v;
  }, ms);
}

/**
 * A right answer shows for well under a second before the session moves on,
 * so it is watched for on every frame rather than polled.
 */
async function expectCorrect(page: Page, text: string) {
  await page.waitForFunction(
    (t) => document.querySelector('[data-testid="feedback-correct"]')?.textContent === t,
    text,
    { timeout: 30_000, polling: 'raf' },
  );
}

test.describe('M6-08 D20 tap and strum rhythm', () => {
  test('counts in, clicks, and grades a rep in time @smoke @layout', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openEighths(page);
    const drill = session(page);
    // The worked example: the counts are shown under the one-bar grid.
    await expect(drill.getByTestId('d20-explain')).toContainText('Listen to the count-in');
    const grid = drill.getByRole('list', { name: 'The rhythm, one bar' });
    await expect(grid.getByRole('listitem')).toHaveCount(8);
    await expect(grid.getByRole('listitem').first()).toHaveAccessibleName('1: tap');
    // This device's tap timing hasn't been checked yet, and the drill says so.
    await expect(drill.getByTestId('d20-calibrate')).toContainText('hasn’t been checked');
    await expectNoHorizontalOverflow(page);

    await drill.getByRole('button', { name: 'Start' }).click();
    await echo(page, 10);
    const pad = drill.getByRole('button', { name: 'Tap the rhythm' });
    await expect(pad).toBeVisible();
    await expect(pad).toBeFocused();
    const box = await pad.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(pad).toBeInViewport();
    // The click sounds.
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [20] })
      .toBeGreaterThan(0.01);
    // The light steps along the grid on the worked example.
    await expect(grid.locator('[aria-current="step"]')).toHaveCount(1, { timeout: 10_000 });

    await expectCorrect(page, '✓ 16 of 16 on time');
    // A right answer's marks stay a while: they are the drill's feedback.
    const results = drill.getByTestId('d20-results');
    await expect(results).toBeVisible();
    await expect(
      results.getByRole('list', { name: 'Bar 2' }).getByRole('listitem').first(),
    ).toHaveAccessibleName('1: on time, 10 ms late');
    expect(errors).toEqual([]);
  });

  test('marks each late hit and asks for the rhythm again', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openEighths(page);
    const drill = session(page);
    await drill.getByRole('button', { name: 'Start' }).click();
    await echo(page, 90);

    await expect(page.getByTestId('feedback-wrong')).toContainText(
      'That was 0 of 16 on time (13 needed).',
      { timeout: 30_000 },
    );
    await expect(drill.getByTestId('d20-explain')).toHaveText(
      'Your hits were 90 ms off on average, all late. Within 80 ms counts.',
    );
    const results = drill.getByTestId('d20-results');
    for (const bar of ['Bar 1', 'Bar 2']) {
      const cells = results.getByRole('list', { name: bar }).getByRole('listitem');
      await expect(cells).toHaveCount(8);
      await expect(cells.first()).toHaveAccessibleName('1: too late, 90 ms late');
      await expect(cells.nth(1)).toHaveAccessibleName('& of 1: too late, 90 ms late');
    }
    // The timing window can be widened from here, for the reps after this one.
    const timing = drill.getByTestId('d20-window').getByRole('combobox', { name: 'Rhythm timing' });
    await expect(timing).toHaveValue('standard');
    await timing.selectOption('relaxed');
    await expect(timing).toHaveValue('relaxed');
    await expect(drill.getByTestId('d20-window')).toContainText('the widest window');
    await expectNoHorizontalOverflow(page);

    // Continue goes on to the next rep, ready to start.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(drill.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(drill.getByTestId('d20-results')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('checks the tap timing in place, then drops the reminder', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openEighths(page);
    const note = session(page).getByTestId('d20-calibrate');
    await note.getByRole('button', { name: 'Check it (10 seconds)' }).click();
    await note.getByRole('button', { name: 'Start' }).click();
    await echo(page, 20);
    await expect(note.getByTestId('timing-calibration-result')).toHaveText(
      /Your taps land 20 ms late on this device/,
      { timeout: 30_000 },
    );
    await note.getByRole('button', { name: 'Done' }).click();
    await expect(session(page).getByTestId('d20-calibrate')).toHaveCount(0);

    // The rep takes the offset off: a learner 20 ms behind the click is on it.
    await echo(page, 20);
    await session(page).getByRole('button', { name: 'Start' }).click();
    await expectCorrect(page, '✓ 16 of 16 on time');
    expect(errors).toEqual([]);
  });
});
