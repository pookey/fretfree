import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Request } from '@playwright/test';
import { freshStart } from './helpers';

// M11-09: "Share my guitar" (design §3.8 sharing). The Garage draws a PNG
// card on the device. Playwright's WebKit has no share sheet (its
// `navigator.share` resolves without one), so each test stubs `canShare`:
// false for the download path, true with a recording `share` for the share
// path. Nothing goes over the network either way.

/** A browser that can't share files, as desktop browsers can't: the card downloads. */
async function withoutFileSharing(page: Page): Promise<void> {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }),
  );
}

/** Unlock achievements as earlier sessions would have. */
async function seedBadges(page: Page, ids: readonly string[]): Promise<void> {
  await page.evaluate(async (badgeIds) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('achievements', 'readwrite');
      for (const id of badgeIds) tx.objectStore('achievements').put({ id, unlockedAt: new Date() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, ids);
}

async function openGarage(page: Page, badges: readonly string[] = []): Promise<void> {
  await freshStart(page);
  if (badges.length > 0) await seedBadges(page, badges);
  await page.goto('/progress/garage');
  await expect(page.getByRole('heading', { name: 'Garage', level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: /^My guitar: Stratocaster guitar, / })).toBeVisible();
  // The first tap after a load fetches the audio engine (Tone.js): get it out of the way.
  await page.getByRole('heading', { name: 'Garage', level: 1 }).click();
  await page.waitForLoadState('networkidle');
}

/** Every http(s) request from now on: the card must make none. */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r: Request) => {
    if (/^https?:/.test(r.url())) urls.push(`${r.method()} ${r.url()}`);
  });
  return urls;
}

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const shareButton = (page: Page) => page.getByRole('button', { name: 'Share my guitar' });

test.describe('M11-09 share my guitar', () => {
  test('downloads the card as a PNG, with no network request @smoke', async ({ page }) => {
    await withoutFileSharing(page);
    await openGarage(page);
    const requests = recordRequests(page);

    const download = page.waitForEvent('download');
    await shareButton(page).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('fretfree-my-guitar.png');
    const bytes = await readFile((await file.path())!);
    expect(pngSize(bytes)).toEqual({ width: 1080, height: 1350 });
    // A drawn guitar, not a blank canvas.
    expect(bytes.length).toBeGreaterThan(50_000);
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(
      'Saved fretfree-my-guitar.png.',
    );

    // No badges yet, so there is nothing to add.
    await expect(page.getByRole('checkbox', { name: 'Add my badges' })).toHaveCount(0);
    expect(requests).toEqual([]);
  });

  test('offers the badges line off by default, and names the file after the guitar', async ({
    page,
  }) => {
    await withoutFileSharing(page);
    await openGarage(page, ['whole-neck', 'speed-demon']);
    const name = page.getByLabel('Guitar name');
    await name.fill('Blue Moon');
    await name.blur();
    const badges = page.getByRole('checkbox', { name: 'Add my badges' });
    await expect(badges).not.toBeChecked();
    await badges.check();
    const requests = recordRequests(page);

    const download = page.waitForEvent('download');
    await shareButton(page).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('fretfree-blue-moon.png');
    expect(pngSize(await readFile((await file.path())!))).toEqual({ width: 1080, height: 1350 });
    expect(requests).toEqual([]);
  });

  test('hands the PNG to the share sheet where files can be shared, and a cancel is quiet', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shared: unknown[]; cancelNext: boolean };
      w.shared = [];
      w.cancelNext = false;
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: (data: { files?: File[] }) => (data.files?.length ?? 0) > 0,
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: { files: File[]; title: string; text: string }) => {
          if (w.cancelNext) {
            w.cancelNext = false;
            throw new DOMException('Share cancelled', 'AbortError');
          }
          const [file] = data.files;
          w.shared.push({ name: file!.name, type: file!.type, title: data.title, text: data.text });
        },
      });
    });
    await openGarage(page);
    const requests = recordRequests(page);
    let downloads = 0;
    page.on('download', () => downloads++);

    await shareButton(page).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared))
      .toEqual([
        {
          name: 'fretfree-my-guitar.png',
          type: 'image/png',
          title: 'My guitar',
          text: expect.stringMatching(/^My guitar, built in FretFree\. http/),
        },
      ]);

    await page.evaluate(() => ((window as unknown as { cancelNext: boolean }).cancelNext = true));
    await shareButton(page).click();
    await expect(shareButton(page)).toBeEnabled();
    await expect(page.getByText(/Couldn’t make the picture/)).toHaveCount(0);
    expect(downloads).toBe(0);
    expect(requests).toEqual([]);
  });
});
