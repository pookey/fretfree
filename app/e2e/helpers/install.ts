import type { Page } from '@playwright/test';

/**
 * Every Playwright project is an iPad or iPhone Safari, so a first launch opens
 * onboarding at the install step (M1-29). Specs about the later steps call this
 * before navigating: it says "Not now" to the install tip on this device, which
 * leaves the step out of onboarding and the card off Today.
 */
export async function skipInstallTip(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('fretwork.installHint.dismissed', '1');
    } catch {
      // about:blank has no storage.
    }
  });
}

/** A Home Screen launch on iPadOS sets navigator.standalone. */
export async function emulateStandalone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
  });
}
