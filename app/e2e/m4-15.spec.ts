import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';
import { expectControlled, serviceWorkerActivated } from './helpers/sw';

// M4-15: the guitar plays recorded nylon-guitar samples, one per note of the
// neck. They load after the first tap, the service worker precaches them so
// they work offline, and a note whose sample isn't there plays synthesised.

const NOTES = 49; // E2 to E6

const sound = (page: Page) => page.getByRole('main').getByRole('group', { name: 'Sound' });

/** Count the audio the page decodes. Call before the page loads. */
async function countDecodes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __decoded: number };
    w.__decoded = 0;
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (
      this: BaseAudioContext,
      ...args: Parameters<BaseAudioContext['decodeAudioData']>
    ) {
      return decode.apply(this, args).then((buffer) => {
        w.__decoded += 1;
        return buffer;
      });
    } as BaseAudioContext['decodeAudioData'];
  });
}

const decoded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __decoded: number }).__decoded);

async function expectTestNoteSounds(page: Page) {
  await sound(page).getByRole('button', { name: 'Play a test note' }).click();
  await expect
    .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
    .toBeGreaterThan(0.01);
}

/** Settings under an activated service worker, as in production, with page errors collected. */
async function openSettingsInstalled(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await tapAudioOutput(page);
  await countDecodes(page);
  await serviceWorkerActivated(page);
  await freshStart(page, '/settings');
  await expectControlled(page);
  return errors;
}

test.describe('M4-15 nylon guitar samples', () => {
  test('the first tap loads and decodes every sample, precached @smoke', async ({ page }) => {
    const requested = new Set<string>();
    page.on('request', (r) => {
      const m = /\/samples\/nylon\/(\d+)\.mp3/.exec(r.url());
      if (m) requested.add(m[1]!);
    });
    const errors = await openSettingsInstalled(page);
    expect(requested.size).toBe(0);
    await expectTestNoteSounds(page);
    await expect.poll(() => decoded(page), { timeout: 15_000 }).toBe(NOTES);
    expect(requested.size).toBe(NOTES);
    const precached = await page.evaluate(() =>
      caches.match('/samples/nylon/40.mp3', { ignoreSearch: true }).then((r) => r?.status),
    );
    expect(precached).toBe(200);
    // Now from the samples.
    await expect.poll(() => audioLevel(page), { timeout: 5_000 }).toBeLessThan(0.001);
    await expectTestNoteSounds(page);
    expect(errors).toEqual([]);
  });

  test('the samples play offline once installed', async ({ page, context }) => {
    const errors = await openSettingsInstalled(page);
    await context.setOffline(true);
    await page.reload();
    await expectTestNoteSounds(page);
    await expect.poll(() => decoded(page), { timeout: 15_000 }).toBe(NOTES);
    expect(errors).toEqual([]);
  });

  test.describe('without the samples', () => {
    test.use({ serviceWorkers: 'block' });

    test('still sounds, on the plucked voice @smoke', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/samples/**', (route) => route.abort());
      await tapAudioOutput(page);
      await countDecodes(page);
      await freshStart(page, '/settings');
      await expectTestNoteSounds(page);
      expect(await decoded(page)).toBe(0);
      expect(errors).toEqual([]);
    });
  });
});
