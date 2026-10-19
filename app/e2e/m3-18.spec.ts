import { expect, test, type Page } from '@playwright/test';
import { freshStart, wipeData } from './helpers';
import { focusSession } from './helpers/focus';
import { seedDueItems } from './helpers/octaves';

// Drill views and the run-once onboarding and placement screens load on demand
// (design §10 first-load budget). A session prefetches its drill views, so a
// drill switch never shows a loading state, and the service worker's precache
// covers every chunk, so all of it still works offline.

const VIEW_CHUNK = /\/assets\/(?:D\d+View|ContextPanel)-[^/]+\.js$/;
const RUN_ONCE_CHUNK = /\/assets\/(?:OnboardingScreen|RetakeScreen)-[^/]+\.js$/;
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const swState = (page: Page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return JSON.stringify({
      active: r?.active?.state,
      controlled: navigator.serviceWorker.controller !== null,
    });
  });

/** Counts every time a drill's loading state appears, from page load on. */
async function watchDrillLoading(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { drillLoadingSeen: number };
    w.drillLoadingSeen = 0;
    let shown = false;
    new MutationObserver(() => {
      const now = document.querySelector('[data-testid="drill-loading"]') !== null;
      if (now && !shown) w.drillLoadingSeen++;
      shown = now;
    }).observe(document, { subtree: true, childList: true });
  });
}

const drillLoadingSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { drillLoadingSeen: number }).drillLoadingSeen);

/**
 * Answers the prompt on screen by key, trying each natural until one is
 * taken (D1 and D3 both answer by letter), then moves on.
 */
async function answerByKey(page: Page): Promise<void> {
  const bar = page.getByTestId('feedback-bar');
  for (const note of NATURALS) {
    await page.keyboard.press(note.toLowerCase());
    // A letter that isn't among the choices is ignored; one that is answers.
    const answered = await expect(bar)
      .toHaveAttribute('data-state', /./, { timeout: 1000 })
      .then(
        () => true,
        () => false,
      );
    if (answered) break;
  }
  if ((await bar.getAttribute('data-state')) === 'wrong')
    await page.getByRole('button', { name: 'Continue' }).click();
  await expect(bar).not.toHaveAttribute('data-state', /./);
}

/** The drill on screen once its prompt is up. */
async function drillOnScreen(page: Page): Promise<string> {
  const area = page.locator('[data-drill]');
  await expect(area).toHaveAttribute('data-drill', /./);
  await expect(page.getByTestId('feedback-bar')).not.toHaveAttribute('data-state', /./);
  return (await area.getAttribute('data-drill'))!;
}

test.describe('M3-18 lazy drill views and run-once routes', () => {
  test('a multi-drill session switches drills without a loading state @smoke', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (VIEW_CHUNK.test(new URL(r.url()).pathname)) chunks.push(r.url());
    });
    await watchDrillLoading(page);
    await freshStart(page);
    // Today, before any session: no drill view has downloaded.
    expect(chunks).toEqual([]);

    // Reviews due in two skills: F1 is served by D3 (note wheel), F2 by D1
    // (name the note). Whichever comes first, the session switches drills.
    await seedDueItems(
      page,
      [
        ...['letter:+1@C', 'letter:+1@F', 'letter:-1@A'].map((itemId) => ({
          itemId,
          skillId: 'F1.alphabet',
        })),
        ...['note@s6f0', 'note@s6f3', 'note@s6f5'].map((itemId) => ({
          itemId,
          skillId: 'F2.string6-naturals',
        })),
      ],
      2,
    );
    await focusSession(page, ['F1.alphabet', 'F2.string6-naturals']);
    const seen: string[] = [await drillOnScreen(page)];
    for (let n = 0; n < 6 && new Set(seen).size < 2; n++) {
      await answerByKey(page);
      seen.push(await drillOnScreen(page));
    }
    expect(new Set(seen)).toEqual(new Set(['note-wheel', 'name-the-note']));
    expect(await drillLoadingSeen(page)).toBe(0);
    expect(chunks.some((u) => /\/D1View-/.test(u))).toBe(true);
    expect(chunks.some((u) => /\/D3View-/.test(u))).toBe(true);
  });

  test('a returning learner never downloads onboarding or placement', async ({ page }) => {
    await freshStart(page);
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (RUN_ONCE_CHUNK.test(new URL(r.url()).pathname)) chunks.push(r.url());
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
    expect(chunks).toEqual([]);
  });

  test('onboarding, placement, About, Privacy and a session work offline after a first load', async ({
    page,
    context,
  }) => {
    // The first visit installs the service worker, precaching every chunk.
    await page.goto('/');
    await expect.poll(() => swState(page), { timeout: 20_000 }).toContain('"active":"activated"');
    await page.reload();
    await expect.poll(() => swState(page)).toContain('"controlled":true');

    await context.setOffline(true);
    // A first launch offline: onboarding's chunk can only come from the precache.
    await wipeData(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    await page.goto('/placement');
    await expect(
      page.getByRole('heading', { name: 'Retake the placement test', level: 1 }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Start the test' }).click();
    const dialog = page.getByRole('dialog', { name: 'Placement test' });
    await expect(dialog.getByTestId('placement-probe')).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect(dialog.getByRole('group').first()).toBeVisible();

    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'About FretFree', level: 1 })).toBeVisible();
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();

    await focusSession(page, 'F2.string6-naturals');
    await expect(page.locator('[data-drill="name-the-note"]')).toBeVisible();
    await expect(page.getByRole('group', { name: /highlighted|this is/i }).first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
