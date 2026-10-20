import { expect, type Page } from '@playwright/test';

/** The page's service-worker registration and whether it controls the page, as JSON. */
export function swState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return JSON.stringify({
      installing: r?.installing?.state,
      waiting: r?.waiting?.state,
      active: r?.active?.state,
      controlled: navigator.serviceWorker.controller !== null,
    });
  });
}

/**
 * The first visit: the service worker installs (precaching every asset) and
 * activates. Call it before any other navigation, because WebKit can leave an
 * install stuck when its page navigates mid-precache (see m1-19).
 */
export async function serviceWorkerActivated(page: Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => swState(page), { timeout: 20_000 }).toContain('"active":"activated"');
}

/** Reload so the activated worker controls the page, as it does in production. */
export async function expectControlled(page: Page): Promise<void> {
  await page.reload();
  await expect.poll(() => swState(page)).toContain('"controlled":true');
}
