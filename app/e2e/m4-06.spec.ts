import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { audioContexts, audioLevel, tapAudioOutput } from './helpers/audio';

// M4-06: audio engine v2 (design §9). A plucked guitar, loaded lazily on the
// first tap, behind a master volume and silent mode.

const sound = (page: Page) => page.getByRole('main').getByRole('group', { name: 'Sound' });

async function openSettings(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await tapAudioOutput(page);
  await freshStart(page, '/settings');
  await expect(sound(page)).toBeVisible();
  return errors;
}

test.describe('M4-06 audio engine', () => {
  test('stays unloaded until a tap, then the test note sounds @smoke', async ({ page }) => {
    const errors = await openSettings(page);
    // Nothing has touched the speakers on a fresh load.
    expect(await audioContexts(page)).toBe(0);

    await sound(page).getByRole('button', { name: 'Play a test note' }).click();
    await expect.poll(() => audioContexts(page), { timeout: 10_000 }).toBe(1);
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);
    expect(errors).toEqual([]);
  });

  test('silent mode cuts a ringing note at once', async ({ page }) => {
    const errors = await openSettings(page);
    await sound(page).getByRole('button', { name: 'Play a test note' }).click();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);

    // The plucked note would ring for over a second; silent mode stops it now.
    await sound(page).getByRole('checkbox', { name: 'Sound' }).click();
    await expect(sound(page).getByRole('checkbox', { name: 'Sound' })).not.toBeChecked();
    await expect
      .poll(() => audioLevel(page), { timeout: 500, intervals: [50] })
      .toBeLessThan(0.001);
    expect(errors).toEqual([]);
  });
});
