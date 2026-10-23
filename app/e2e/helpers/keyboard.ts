import type { Page } from '@playwright/test';

/**
 * Wait until the screen's key handlers are listening (M1-45).
 *
 * Drills (and the session's Space/Enter to continue) attach their `keydown`
 * listeners in a `useEffect`, which React runs after the commit that put the
 * prompt on screen, as a scheduler task (a `MessageChannel` post) queued
 * during that commit. Every later React task flushes pending effects first.
 * A key Playwright presses as soon as the prompt is visible can land before
 * that task under load and is dropped. So once the prompt is on screen, post
 * our own messages and wait for them: React's task was queued first. Two hops,
 * because WebKit may deliver one batch of port messages in any order.
 *
 * Call it after the prompt is visible; `press` does.
 */
export async function keysReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i++)
      await new Promise<void>((resolve) => {
        const { port1, port2 } = new MessageChannel();
        port1.onmessage = () => {
          port1.close();
          resolve();
        };
        port2.postMessage(null);
      });
  });
}

/**
 * Opt-in proof for `keysReady`: with `PW_DELAY_EFFECTS=<ms>` set, delay every
 * `MessagePort.postMessage` in the page by that long, so React's effects (and
 * the key listeners they attach) run late, as on a loaded machine. A spec that
 * presses keys without `press` then drops them. Call it before the test's
 * first navigation; it does nothing without the variable.
 */
export async function delayEffectsIfAsked(page: Page): Promise<void> {
  const ms = Number(process.env.PW_DELAY_EFFECTS ?? 0);
  if (!ms) return;
  await page.addInitScript((delay) => {
    const post = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (this: MessagePort, ...args: unknown[]) {
      setTimeout(() => (post as (...a: unknown[]) => void).apply(this, args), delay);
    } as typeof post;
  }, ms);
}

/** Press each key once the screen listens for it (see `keysReady`). */
export async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    await keysReady(page);
    await page.keyboard.press(key);
  }
}
