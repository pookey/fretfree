import type { Page } from '@playwright/test';

/**
 * What the page's microphone does, from page load on:
 * - `tone`: grants it, and "hears" a steady sine at `frequency` Hz (default
 *   A2), so the shipped pitch worklet runs for real on a known pitch;
 * - `denied` / `no-device`: rejects as Safari does for a refusal / no input;
 * - `unsupported`: the browser has no getUserMedia at all.
 * `window.micRequests` counts getUserMedia calls, so specs can check the
 * prompt waits for the learner's tap (design §9).
 */
export type FakeMic =
  | { kind: 'tone'; frequency?: number }
  | { kind: 'denied' }
  | { kind: 'no-device' }
  | { kind: 'unsupported' };

export async function fakeMic(page: Page, mic: FakeMic): Promise<void> {
  await page.addInitScript((mic: FakeMic) => {
    const w = window as unknown as { micRequests: number };
    w.micRequests = 0;
    if (mic.kind === 'unsupported') {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      return;
    }
    const getUserMedia = (): Promise<MediaStream> => {
      w.micRequests += 1;
      if (mic.kind === 'denied')
        return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      if (mic.kind === 'no-device')
        return Promise.reject(new DOMException('No input device', 'NotFoundError'));
      // Built inside the tap, like the real request, so the context may run.
      const context = new AudioContext();
      const osc = context.createOscillator();
      osc.frequency.value = mic.frequency ?? 110;
      const out = context.createMediaStreamDestination();
      osc.connect(out);
      osc.start();
      return context.resume().then(() => out.stream);
    };
    // On the prototype: WebKit ignores the same assignment on the instance.
    if (typeof MediaDevices !== 'undefined')
      Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
        value: getUserMedia,
        configurable: true,
        writable: true,
      });
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
      });
  }, mic);
}

export const micRequests = (page: Page) =>
  page.evaluate(() => (window as unknown as { micRequests: number }).micRequests);
