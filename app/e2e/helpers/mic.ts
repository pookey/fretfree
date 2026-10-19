import { expect, type Page } from '@playwright/test';

/**
 * The fake mic (M5-01's `createFakePitchSource`). `main.tsx` installs it in
 * place of the real detector when a spec sets `window.__fretworkFakeMic`
 * before the app loads, and hands it back on the same property. Shared by the
 * mic drill specs (D16, D17).
 */

interface FakeMic {
  state: string;
  startCalls: number;
  play(note: number | string, options?: { durationMs?: number }): void;
  silence(durationMs: number): void;
  failNextStart(reason: string): void;
}

type FakeMicWindow = Window & { __fretworkFakeMic?: true | FakeMic };

/** Every page load from now on gets the fake mic. Call before the first `goto`. */
export async function useFakeMic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as FakeMicWindow).__fretworkFakeMic = true;
  });
}

/** Waits until the fake is installed (it loads lazily). */
export async function fakeMicReady(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as FakeMicWindow).__fretworkFakeMic === 'object');
}

/** Turns mic mode on (`settings.micEnabled`, as M5-04's setting will), then reloads. */
export async function enableMicMode(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const store = () => db.transaction('settings', 'readwrite').objectStore('settings');
    const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = store().get('singleton');
      req.onsuccess = () => resolve(req.result as Record<string, unknown>);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const req = store().put({ ...row, micEnabled: true });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  });
  await page.reload();
}

/**
 * Plays notes into the fake mic, each followed by a short mute, as a learner
 * picks them one by one. The fake reports a note at once, so first wait out
 * the 80ms stability hold: no real note can be heard sooner after a prompt
 * appears, and the drill ignores notes that started before it did.
 */
export async function playNotes(page: Page, notes: readonly (number | string)[]): Promise<void> {
  await fakeMicReady(page);
  await page.evaluate(async (notes) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const fake = (window as FakeMicWindow).__fretworkFakeMic as FakeMic;
    for (const n of notes) {
      fake.play(n);
      fake.silence(200);
    }
  }, notes);
}

/** Makes the fake refuse the next start, as a learner denying the permission prompt would. */
export async function failNextMicStart(page: Page, reason: string): Promise<void> {
  await fakeMicReady(page);
  await page.evaluate((reason) => {
    ((window as FakeMicWindow).__fretworkFakeMic as FakeMic).failNextStart(reason);
  }, reason);
}

/** Taps the drill's "Start listening" and waits for the mic to run. */
export async function startListening(page: Page): Promise<void> {
  await fakeMicReady(page);
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Listening…' })).toBeVisible();
}
