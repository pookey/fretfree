import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M5-03: the tuner (design §7 Tools, §9). A fake pitch source stands in for
// the microphone, so the specs play exact notes into it.

const FAKE_PITCH_KEY = 'fretwork.e2e.fakePitch';

interface FakePitch {
  state: string;
  startCalls: number;
  play(note: string, options?: { cents?: number }): void;
  loseInput(): void;
}
type Hooks = { fretworkFakePitch?: FakePitch; fretworkTones?: string[] };

async function useFakePitch(page: Page): Promise<void> {
  await page.addInitScript((key) => localStorage.setItem(key, '1'), FAKE_PITCH_KEY);
}

async function openTuner(page: Page): Promise<void> {
  await freshStart(page, '/tools/tuner');
  await expect(page.getByRole('heading', { name: 'Tuner', level: 1 })).toBeVisible();
  await expect(micCheck(page)).toHaveAttribute('data-state', 'off');
}

const micCheck = (page: Page) => page.getByTestId('mic-check');

async function play(page: Page, note: string, cents = 0): Promise<void> {
  await page.evaluate(
    ([n, c]) => (window as unknown as Hooks).fretworkFakePitch!.play(n, { cents: c }),
    [note, cents] as const,
  );
}

const fake = (page: Page) =>
  page.evaluate(() => {
    const f = (window as unknown as Hooks).fretworkFakePitch!;
    return { state: f.state, startCalls: f.startCalls };
  });

test.describe('the tuner', () => {
  test('reads the needle, the note and the nearest string, and marks in tune', async ({ page }) => {
    await useFakePitch(page);
    await openTuner(page);
    expect((await fake(page)).startCalls).toBe(0);
    await expect(page.locator('[data-layout="split"]')).toBeVisible();

    await page.getByRole('button', { name: 'Start tuner' }).click();
    await expect(micCheck(page)).toHaveAttribute('data-state', 'listening');
    await expect(page.getByRole('status')).toHaveText('Listening. Play an open string.');

    await play(page, 'A2', -12);
    await expect(micCheck(page)).toHaveAttribute('data-state', 'working');
    await expect(page.getByRole('status')).toContainText('Mic is working.');
    const needle = page.getByRole('meter', { name: 'Tuning needle' });
    await expect(needle).toHaveAttribute('aria-valuenow', '-12');
    await expect(page.getByTestId('tuner-note')).toHaveText('A2');
    await expect(page.getByTestId('tuner-cents')).toHaveText('−12 cents');
    await expect(page.getByTestId('tuner-advice')).toContainText('Flat: tune up');
    await expect(page.getByTestId('tuner-string')).toHaveText('5th string · nearest');
    await expect(page.getByTestId('tuner-heard')).toHaveText('Heard A2');
    await expect(page.getByTestId('in-tune-mark')).toHaveCount(0);

    // A string a semitone flat is never "in tune", though G#2 itself is.
    await play(page, 'G#2');
    await expect(page.getByTestId('tuner-note')).toHaveText('A2');
    await expect(page.getByTestId('tuner-advice')).toContainText('Flat: tune up about 1 semitone');
    await expect(page.getByTestId('in-tune-mark')).toHaveCount(0);
    await expect(page.getByTestId('tuner-heard')).toHaveText('Heard G#2');

    await play(page, 'E2', 3);
    await expect(page.getByTestId('tuner-advice')).toContainText('In tune');
    await expect(page.getByTestId('in-tune-mark')).toBeVisible();
    await expect(page.getByRole('button', { name: 'E2, 6th string' })).toHaveAttribute(
      'data-in-tune',
      'true',
    );
    await expectNoHorizontalOverflow(page);

    // Leaving the tool releases the mic.
    await page.getByRole('link', { name: '← All tools' }).click();
    await expect(page.getByRole('link', { name: /Tuner/ })).toBeVisible();
    expect((await fake(page)).state).toBe('idle');
  });

  test('plays reference tones without a mic, and pauses the needle while one sounds', async ({
    page,
  }) => {
    await useFakePitch(page);
    await openTuner(page);
    const strings = page.getByRole('region', { name: 'Reference tones' }).getByRole('button');
    await expect(strings).toHaveText([/^E/, /^A/, /^D/, /^G/, /^B/, /^E/]);
    for (const button of await strings.all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole('button', { name: 'A2, 5th string' }).click();
    expect(await page.evaluate(() => (window as unknown as Hooks).fretworkTones)).toEqual(['A2']);
    expect((await fake(page)).startCalls).toBe(0);

    await page.getByRole('button', { name: 'Start tuner' }).click();
    await expect(micCheck(page)).toHaveAttribute('data-state', 'listening');
    await page.getByRole('button', { name: 'D3, 4th string' }).click();
    await expect(page.getByTestId('tuner-advice')).toContainText('Playing D3.');
    await play(page, 'D3');
    await expect(page.getByRole('meter')).toHaveCount(0);
    await expect(micCheck(page)).toHaveAttribute('data-state', 'listening');
    // The tapped string stays the one being tuned.
    await expect(page.getByTestId('tuner-note')).toHaveText('D3');
    await expect(page.getByRole('button', { name: 'D3, 4th string' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Tune the nearest string' }).click();
    await expect(page.getByTestId('tuner-string')).toHaveText('Standard tuning: E A D G B E');
  });

  test('tells the learner when the mic stops, and restarts it', async ({ page }) => {
    await useFakePitch(page);
    await openTuner(page);
    await page.getByRole('button', { name: 'Start tuner' }).click();
    await play(page, 'G3');
    await expect(page.getByTestId('tuner-note')).toHaveText('G3');
    await page.evaluate(() => (window as unknown as Hooks).fretworkFakePitch!.loseInput());
    await expect(page.getByRole('alert')).toContainText('The mic stopped.');
    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(micCheck(page)).toHaveAttribute('data-state', 'listening');
    expect((await fake(page)).startCalls).toBe(2);
  });

  test('keeps the needle still under reduced motion', async ({ page }) => {
    await useFakePitch(page);
    await openTuner(page);
    const transition = () =>
      page
        .getByTestId('tuner-needle')
        .locator('g[data-idle]')
        .evaluate((g) => getComputedStyle(g).transitionDuration);
    expect(await transition()).toBe('0.09s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // No transition: 0s here, or the global 0.01ms reduced-motion override.
    expect(parseFloat(await transition())).toBeLessThan(0.001);
  });
});

test.describe('the tuner on the real detector', () => {
  /**
   * Counts getUserMedia calls and refuses them, as a learner tapping Don’t
   * Allow. Installed on the loaded page (WebKit can skip init scripts on a
   * navigation the service worker answers), on both the prototype and the
   * instance, and checked, so a stub that didn't take fails loudly.
   */
  async function refuseMic(page: Page): Promise<void> {
    const installed = await page.evaluate(() => {
      const w = window as unknown as { micRequests: number };
      w.micRequests = 0;
      const refuse = () => {
        w.micRequests += 1;
        return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      };
      const stub = { value: refuse, configurable: true, writable: true };
      if (typeof MediaDevices !== 'undefined') {
        Object.defineProperty(MediaDevices.prototype, 'getUserMedia', stub);
      }
      const devices = navigator.mediaDevices as MediaDevices | undefined;
      if (devices) Object.defineProperty(devices, 'getUserMedia', stub);
      else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: refuse } });
      return navigator.mediaDevices.getUserMedia === refuse;
    });
    expect(installed).toBe(true);
  }

  const micRequests = (page: Page) =>
    page.evaluate(() => (window as unknown as { micRequests?: number }).micRequests ?? 'reloaded');

  test('@smoke opens from Tools without asking for the mic, and explains a refusal', async ({
    page,
  }) => {
    await freshStart(page, '/tools');
    await refuseMic(page);
    // Opened in-app, so the page (and its refusing mic) stays loaded.
    await page.getByRole('link', { name: /Tuner/ }).click();
    await expect(page.getByRole('heading', { name: 'Tuner', level: 1 })).toBeVisible();
    await expect(micCheck(page)).toHaveAttribute('data-state', 'off');
    expect(await micRequests(page)).toBe(0);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Start tuner' }).click();
    // A browser without AudioWorklet never prompts; this one must.
    await expect(micCheck(page)).toHaveAttribute('data-state', 'denied');
    await expect(page.getByRole('alert')).toContainText('isn’t allowed to use the microphone');
    expect(await micRequests(page)).toBe(1);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    // The reference tones still work without the mic.
    await expect(page.getByRole('button', { name: 'E4, 1st string' })).toBeEnabled();
  });
});

test('@smoke stacks on a phone and reads a note', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useFakePitch(page);
  await openTuner(page);
  await expect(page.locator('[data-layout="stack"]')).toBeVisible();
  await page.getByRole('button', { name: 'Start tuner' }).click();
  await play(page, 'B3', 20);
  await expect(page.getByTestId('tuner-note')).toHaveText('B3');
  await expect(page.getByTestId('tuner-advice')).toContainText('Sharp: tune down');
  await expectNoHorizontalOverflow(page);
});
