import { expect, type Page } from '@playwright/test';

// An independent note table (deliberately not imported from app code) so the
// e2e suite cross-checks the theory module.
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN: Record<number, number> = { 1: 4, 2: 11, 3: 7, 4: 2, 5: 9, 6: 4 };

export function noteName(string: number, fret: number): string {
  return CHROMATIC[(OPEN[string]! + fret) % 12]!;
}

export async function targetNote(page: Page): Promise<string> {
  const marker = page.getByTestId('marker-target');
  await expect(marker).toBeVisible();
  const string = Number(await marker.getAttribute('data-string'));
  const fret = Number(await marker.getAttribute('data-fret'));
  return noteName(string, fret);
}

export async function answer(page: Page, note: string): Promise<void> {
  await page
    .getByRole('group', { name: /highlighted|this is/i })
    .getByRole('button', { name: note, exact: true })
    .click();
}

export async function wrongNote(note: string): Promise<string> {
  return note === 'C' ? 'D' : 'C';
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Delete every IndexedDB database on the page's origin. */
export async function wipeData(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(d.name!);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }),
      ),
    );
  });
}

/** A first launch with no data. Onboarding opens at `/`. */
export async function firstLaunch(page: Page): Promise<void> {
  await page.goto('/');
  await wipeData(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
}

/** A first launch with onboarding skipped, then `path`. */
export async function freshStart(page: Page, path = '/'): Promise<void> {
  await firstLaunch(page);
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  if (path !== '/') await page.goto(path);
}
