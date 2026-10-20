import { readdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { focusSession } from './helpers/focus';

// M5-02: the real pitch detector. Design §9: permission is requested only when
// the learner enables mic mode, and the AudioWorklet (pitchy) must run in the
// browser we ship to, not just in Node.

/** Counts getUserMedia calls from page load on, without ever prompting. */
async function watchMicRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { micRequests: number };
    w.micRequests = 0;
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    const fake = () => {
      w.micRequests += 1;
      return Promise.reject(new DOMException('Not in this test', 'NotAllowedError'));
    };
    if (devices) devices.getUserMedia = fake;
    else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: fake } });
  });
}

const micRequests = (page: Page) =>
  page.evaluate(() => (window as unknown as { micRequests: number }).micRequests);

test('@smoke browsing and practising never asks for the microphone', async ({ page }) => {
  await watchMicRequests(page);
  await freshStart(page);
  for (const [path, heading] of [
    ['/learn', 'Learn'],
    ['/explore', 'Explore'],
    ['/progress', 'Progress'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
  await focusSession(page, 'F1.alphabet');
  // A tap is when audio unlocks; the mic must still wait for mic mode.
  await page.getByTestId('session').click({ position: { x: 5, y: 5 } });
  expect(await micRequests(page)).toBe(0);
});

/** The worklet as built, served from /assets. */
function workletPath(): string {
  const assets = new URL('../dist/assets/', import.meta.url);
  const file = readdirSync(assets).find((f) => /^pitch-processor-.+\.js$/.test(f));
  if (!file) throw new Error('No pitch-processor worklet in dist/assets: run the build first');
  return `/assets/${file}`;
}

test.describe('the built pitch worklet', () => {
  for (const [label, frequency, harmonics] of [
    ['low E, bright', 82.41, [1, 0.7, 0.5, 0.35, 0.25, 0.15]],
    ['A2, weak fundamental', 110, [0.25, 1, 0.6, 0.45, 0.3]],
    ['E4, bright', 329.63, [1, 0.7, 0.5, 0.35, 0.25, 0.15]],
  ] as const) {
    test(`hears ${label} with no octave error`, async ({ page }) => {
      await page.goto('/about');
      const frames = await page.evaluate(
        async ({ url, frequency, harmonics }) => {
          const rate = 48000;
          const context = new OfflineAudioContext(1, rate * 0.6, rate);
          await context.audioWorklet.addModule(url);
          const node = new AudioWorkletNode(context, 'fretwork-pitch', {
            outputChannelCount: [1],
          });
          const received: { frequency: number; clarity: number; time: number }[] = [];
          node.port.onmessage = (e: MessageEvent) => received.push(e.data);
          const wave = context.createPeriodicWave(
            new Float32Array(harmonics.length + 1),
            Float32Array.from([0, ...harmonics]),
          );
          const osc = context.createOscillator();
          osc.setPeriodicWave(wave);
          osc.frequency.value = frequency;
          osc.connect(node).connect(context.destination);
          osc.start();
          await context.startRendering();
          // Messages from the audio thread trail the render; wait until they stop.
          let seen = -1;
          while (seen !== received.length) {
            seen = received.length;
            await new Promise((r) => setTimeout(r, 100));
          }
          return received;
        },
        { url: workletPath(), frequency, harmonics },
      );

      // 0.6s at a 20ms hop, after the first 2048-sample window.
      expect(frames.length).toBeGreaterThanOrEqual(25);
      // WebKit sometimes starts the worklet one 128-sample render quantum late.
      const firstSample = Math.round(frames[0]!.time * 48000);
      expect([2048, 2048 + 128]).toContain(firstSample);
      for (const f of frames) {
        expect(f.clarity).toBeGreaterThan(0.9);
        expect(Math.abs(12 * Math.log2(f.frequency / frequency))).toBeLessThan(0.1);
      }
    });
  }
});
