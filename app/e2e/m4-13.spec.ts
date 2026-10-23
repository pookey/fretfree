import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { audioContexts, audioLevel, refuseAudioWorklets, tapAudioOutput } from './helpers/audio';
import { expectControlled, serviceWorkerActivated } from './helpers/sw';

// M4-13: sound on iPhone and iPad. The plucked guitar plays rendered buffers
// on native nodes, with no AudioWorklet (iOS Safari can refuse the blob URL a
// worklet loads from), and the first tap starts the context in its gesture.

const sound = (page: Page) => page.getByRole('main').getByRole('group', { name: 'Sound' });

/** Settings, served by the service worker as in production, with page errors collected. */
async function openSettingsOffline(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await tapAudioOutput(page);
  await serviceWorkerActivated(page);
  await freshStart(page, '/settings');
  await expectControlled(page);
  await expect(sound(page)).toBeVisible();
  return errors;
}

async function expectTestNoteSounds(page: Page) {
  await sound(page).getByRole('button', { name: 'Play a test note' }).click();
  await expect
    .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
    .toBeGreaterThan(0.01);
}

test.describe('M4-13 sound on iOS', () => {
  test('the first tap on the test note sounds, under the service worker @smoke', async ({
    page,
  }) => {
    const errors = await openSettingsOffline(page);
    await expectTestNoteSounds(page);
    // One live context: the one the tap started, which Tone adopted.
    await expect.poll(() => audioContexts(page)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('still sounds when the browser refuses worklet modules', async ({ page }) => {
    await refuseAudioWorklets(page);
    const errors = await openSettingsOffline(page);
    await expectTestNoteSounds(page);
    expect(errors).toEqual([]);
  });

  test('sounds again after the system suspends the context', async ({ page }) => {
    const errors = await openSettingsOffline(page);
    await expectTestNoteSounds(page);
    await expect.poll(() => audioLevel(page), { timeout: 5_000 }).toBeLessThan(0.001);
    // iOS suspends the context when the app goes to the background.
    await page.evaluate(() => window.__audioTap!.suspend());
    await expectTestNoteSounds(page);
    expect(errors).toEqual([]);
  });
});
