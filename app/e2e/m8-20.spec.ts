import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { tapAudioOutput } from './helpers/audio';

// M8-20: the Tools metronome (design §7 Tools), on the M8-01 timing engine's
// real click. The audio tap hears it; the beat light carries each pulse's
// audio-clock time (`data-at`), so the tempo can be read off exactly.

async function openMetronome(page: Page): Promise<void> {
  await tapAudioOutput(page);
  await freshStart(page, '/tools/metronome');
  await expect(page.getByRole('heading', { name: 'Metronome', level: 1 })).toBeVisible();
}

const beats = (page: Page) => page.getByTestId('metronome-beats');
const mini = (page: Page) => page.getByRole('region', { name: 'Metronome' });

/** The loudest output over `ms`, sampled faster than a click lasts. */
function peakLevel(page: Page, ms: number): Promise<number> {
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

async function expectClicking(page: Page): Promise<void> {
  await expect.poll(() => peakLevel(page, 1_200), { timeout: 10_000 }).toBeGreaterThan(0.01);
}

async function expectSilent(page: Page): Promise<void> {
  await expect.poll(() => peakLevel(page, 1_200), { timeout: 5_000 }).toBeLessThan(0.001);
}

/**
 * The shortest gap between pulses lit over `ms`, in audio-clock ms. A busy
 * machine may skip a frame, which only lengthens a gap, so the shortest is
 * the tempo's.
 */
function pulseGapMs(page: Page, ms: number): Promise<number> {
  return beats(page).evaluate(async (el, duration) => {
    const times: number[] = [];
    const observer = new MutationObserver(() => {
      const at = Number(el.getAttribute('data-at'));
      if (at && at !== times.at(-1)) times.push(at);
    });
    observer.observe(el, { attributes: true, attributeFilter: ['data-at'] });
    await new Promise((r) => setTimeout(r, duration));
    observer.disconnect();
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    return gaps.length ? Math.min(...gaps) : Number.NaN;
  }, ms);
}

/** Within a ms or two: the Transport schedules on whole ticks. */
function expectGap(gapMs: number, wantMs: number): void {
  expect(Math.abs(gapMs - wantMs)).toBeLessThan(2);
}

test.describe('the metronome', () => {
  test('starts, changes tempo and stops', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openMetronome(page);
    await expect(page.locator('[data-layout="split"]')).toBeVisible();
    await expect(page.getByTestId('metronome-bpm')).toHaveText('100');

    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    // A bar of count-in, lit as such, then the bar.
    await expect(beats(page)).toHaveAttribute('data-count-in', 'true');
    await expect(beats(page)).toHaveAttribute('data-count-in', 'false', { timeout: 5_000 });
    await expectClicking(page);
    expectGap(await pulseGapMs(page, 2_000), 600);

    // The tempo changes in place, without a restart.
    await page.getByRole('slider', { name: 'Tempo' }).fill('180');
    await page.getByRole('button', { name: '+5 BPM' }).click();
    await expect(page.getByTestId('metronome-bpm')).toHaveText('185');
    await page.waitForTimeout(300);
    expectGap(await pulseGapMs(page, 1_500), 60_000 / 185);
    await expect(beats(page)).toHaveAttribute('data-count-in', 'false');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await expect(beats(page)).toHaveAttribute('data-pulse', '');
    await expectSilent(page);
    expect(errors).toEqual([]);
  });

  test('sets the tempo by tapping, and clicks an odd meter', async ({ page }) => {
    await openMetronome(page);
    // Tap from inside the page: under load, Playwright's own click latency
    // stretched the gaps (the lane once read under 110 BPM).
    await page.getByRole('button', { name: 'Tap tempo' }).evaluate(async (button: HTMLElement) => {
      for (let i = 0; i < 4; i += 1) {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    });
    // 400 ms apart, plus timer slack: about 140–150 BPM.
    const bpm = Number(await page.getByTestId('metronome-bpm').textContent());
    expect(bpm).toBeGreaterThan(110);
    expect(bpm).toBeLessThanOrEqual(150);

    await page.getByRole('radio', { name: '7/8 (2+2+3)' }).check();
    await expect(page.getByRole('radio', { name: 'Felt beats (2+2+3)' })).toBeChecked();
    await expect(beats(page).locator('[data-accent]')).toHaveCount(7);
    await expect(beats(page).locator('[data-accent="group"]')).toHaveCount(2);
    await page.getByRole('radio', { name: 'Off' }).check();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    // Six eighth-note pulses after the audio starts; under lane load that can pass 5 s.
    await expect(beats(page)).toHaveAttribute('data-pulse', '6', { timeout: 15_000 });
    await expect(beats(page)).toHaveAttribute('data-count-in', 'false');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  });

  test('keeps time around Tools and stops on leaving', async ({ page }) => {
    await openMetronome(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expectClicking(page);

    await page.getByRole('link', { name: '← All tools' }).click();
    await page.getByRole('list', { name: 'Tools' }).getByRole('link', { name: /Tuner/ }).click();
    await expect(page.getByRole('heading', { name: 'Tuner', level: 1 })).toBeVisible();
    await expect(mini(page)).toContainText('100 BPM');
    await expectClicking(page);

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Today' })
      .click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(mini(page)).toHaveCount(0);
    await expectSilent(page);
  });

  test('pinned on, it clicks outside Tools until stopped', async ({ page }) => {
    await openMetronome(page);
    await page.getByRole('checkbox', { name: /Keep clicking outside Tools/ }).check();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Progress' })
      .click();
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await expectClicking(page);

    await expect(mini(page)).toBeVisible();
    await mini(page).getByRole('button', { name: 'Stop metronome' }).click();
    await expect(mini(page)).toHaveCount(0);
    await expectSilent(page);
  });

  test('starts, changes tempo and stops on a phone @smoke @layout @phone', async ({ page }) => {
    await openMetronome(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expectClicking(page);
    await page.getByRole('button', { name: '−5 BPM' }).click();
    await expect(page.getByTestId('metronome-bpm')).toHaveText('95');
    for (const name of ['Start', 'Stop', 'Tap tempo', '+1 BPM']) {
      const button = page.getByRole('button', { name, exact: true });
      if ((await button.count()) === 0) continue;
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expectSilent(page);
  });
});
