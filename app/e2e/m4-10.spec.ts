import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, freshStart } from './helpers';
import { skipInstallTip } from './helpers/install';

// "Start with sound" (design §4) and the "Ear only (no guitar)" quick drill
// (design §7 Today): an ear player's path starts with ear → fretboard, and
// Today offers a short session of the ear track alone.

const START_STEP = 'Where do you want to start?';
const EAR_ONLY = 'Ear only (no guitar)';
const EAR_DRILLS = ['ear-identify', 'hear-it-find-it'];

const choice = (page: Page) => page.getByTestId('onboarding-choice');
const quickDrills = (page: Page) => page.getByRole('region', { name: 'Quick drills' });
const earOnly = (page: Page) => quickDrills(page).getByRole('link', { name: EAR_ONLY });

/** Merge fields into the stored settings, as the Settings screen saves them, then reload. */
async function saveSettings(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (fields) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const store = () => db.transaction('settings', 'readwrite').objectStore('settings');
    const row = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const req = store().get('singleton');
      req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    });
    await new Promise<void>((resolve, reject) => {
      const req = store().put({ ...row, ...fields, key: 'singleton' });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  }, patch);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

/** Skip onboarding steps until `heading` (a step title, or Today) is on screen. */
async function skipTo(page: Page, heading: string): Promise<void> {
  const target = page.getByRole('heading', { name: heading, level: 1 });
  for (let n = 0; n < 12 && !(await target.isVisible()); n++)
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
  await expect(target).toBeVisible();
}

/** The session is planned and its first prompt is on screen. */
async function sessionReady(page: Page): Promise<void> {
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', /.+/);
}

test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M4-10 start with sound', () => {
  test('choosing "With sound" starts the path with ear → fretboard', async ({ page }, info) => {
    await firstLaunch(page);
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    await skipTo(page, START_STEP);
    await expectNoHorizontalOverflow(page);
    if (info.project.name.endsWith('landscape')) {
      // Regular-wide: the explanation on the left, the choice on the right.
      const explain = await page.getByTestId('onboarding-explanation').boundingBox();
      const pane = await choice(page).boundingBox();
      expect(pane!.x).toBeGreaterThan(explain!.x + explain!.width - 1);
    }
    const neckFirst = choice(page).getByRole('radio', { name: /With the neck/ });
    const soundFirst = choice(page).getByRole('radio', { name: /With sound/ });
    await expect(neckFirst).toBeChecked();
    for (const label of await choice(page).locator('label').all())
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await soundFirst.check();
    await choice(page).getByRole('button', { name: 'Continue' }).click();
    await skipTo(page, 'Today');

    // The ear track is open on day one, so "Ear only" is offered straight away.
    await expect(earOnly(page)).toBeVisible();

    // The daily session opens with D15 by ear: the note is heard, not named.
    await page.getByTestId('start-session').click();
    await sessionReady(page);
    await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'hear-it-find-it');
    // A new card opens with its worked example (research/02 rule 8): the first
    // ear-find card, a 4th over the open low E.
    await expect(page.getByTestId('d15-prompt')).toHaveText(
      'This is A on string 6, a perfect 4th above the open E. Listen, then tap it.',
    );
    // Re-opening onboarding shows the choice.
    await page.goto('/onboarding');
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    await skipTo(page, START_STEP);
    await expect(soundFirst).toBeChecked();
  });

  test('the neck stays first by default, and "Ear only" waits for the first session', async ({
    page,
  }) => {
    await freshStart(page);
    await expect(quickDrills(page).getByTestId('ear-only-copy')).toHaveText(
      `${EAR_ONLY} opens after your first session.`,
    );
    await expect(earOnly(page)).toHaveCount(0);
    await page.getByTestId('start-session').click();
    await sessionReady(page);
    await expect(page.locator('[data-drill]')).not.toHaveAttribute('data-drill', 'hear-it-find-it');
  });
});

test.describe('M4-10 ear only', () => {
  test('"Ear only" runs a short session of ear drills @smoke', async ({ page }) => {
    await freshStart(page);
    await saveSettings(page, { startWithSound: true });
    const link = earOnly(page);
    await expect(link).toBeVisible();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(quickDrills(page).getByTestId('ear-only-copy')).toHaveText(/nothing is due/i);
    await expectNoHorizontalOverflow(page);

    await link.click();
    await sessionReady(page);
    await expect(page).toHaveURL(/[?&]skill=I6\./);
    expect(
      new URL(page.url()).searchParams.getAll('skill').every((id) => id.startsWith('I6.')),
    ).toBe(true);
    // The ear-only time budget, not the 10-minute daily session.
    await expect(page.getByTestId('time-left')).toHaveText('3 min left');
    const drill = await page.locator('[data-drill]').getAttribute('data-drill');
    expect(EAR_DRILLS).toContain(drill);
    if (drill === 'hear-it-find-it')
      // An ear card: its worked example, or the note unnamed. Never a named find.
      await expect(page.getByTestId('d15-prompt')).toHaveText(
        /above the open [A-G]|^Find the note you hear/,
      );
  });

  test('with sound off, "Ear only" offers to turn sound on', async ({ page }) => {
    await freshStart(page);
    await saveSettings(page, { startWithSound: true, soundOn: false });
    await expect(quickDrills(page).getByTestId('ear-only-copy')).toHaveText(
      `${EAR_ONLY} needs sound.`,
    );
    await expect(earOnly(page)).toHaveCount(0);
    const turnOn = quickDrills(page).getByRole('button', { name: 'Turn sound on' });
    expect((await turnOn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await turnOn.click();
    await expect(earOnly(page)).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('checkbox', { name: 'Sound', exact: true })).toBeChecked();
  });
});
