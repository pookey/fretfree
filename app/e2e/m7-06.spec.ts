import { expect, test, type Page, type Route } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { API_URL, CODE, mockAuth, seedFinishedSessions } from './helpers/account';

// M7-06: deleting the account, and the privacy copy for the optional account.
// Sign-in is mocked as in M7-04, and the sync and delete endpoints here. The
// service worker is blocked so every request reaches the mocks.
test.use({ serviceWorkers: 'block' });

const EMAIL = 'learner@example.com';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
};

/**
 * The M7-03 API's `DELETE /account`, plus a sync API that holds nothing.
 * `failNext` answers that many deletes with a 503, and `down` makes the API
 * unreachable, as a partial or interrupted server delete would look.
 */
class AccountServer {
  deletes = 0;
  deleted = false;
  failNext = 0;
  down = false;
  pushes = 0;

  async attach(page: Page): Promise<void> {
    // Registered after mockAuth's, so they answer these routes first.
    await page.route(`${API_URL}/sync/**`, (route) => this.sync(route));
    await page.route(`${API_URL}/account`, (route) => this.account(route));
  }

  private reply(route: Route, status: number, body: unknown) {
    return route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async sync(route: Route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (this.down) return route.abort('internetdisconnected');
    if (this.deleted) return this.reply(route, 410, { error: 'account-closing' });
    if (req.method() === 'POST') {
      this.pushes++;
      return this.reply(route, 200, { ok: true });
    }
    return this.reply(route, 200, { records: [], cursor: '0', more: false });
  }

  private async account(route: Route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (this.down) return route.abort('internetdisconnected');
    if (req.method() !== 'DELETE') return this.reply(route, 404, { error: 'not-found' });
    if (req.headers().authorization !== 'Bearer e2e-access') return this.reply(route, 401, {});
    this.deletes++;
    if (this.failNext > 0) {
      this.failNext--;
      return this.reply(route, 503, { error: 'busy' });
    }
    this.deleted = true;
    return this.reply(route, 200, { ok: true });
  }
}

async function setUp(page: Page): Promise<AccountServer> {
  await mockAuth(page);
  const server = new AccountServer();
  await server.attach(page);
  await freshStart(page);
  return server;
}

async function signIn(page: Page) {
  await page.goto('/progress');
  await page.getByLabel('Email address').fill(EMAIL);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('6-digit code').fill(CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('region', { name: 'Your account' })).toContainText(
    `Signed in as ${EMAIL}.`,
  );
}

const deletePanel = (page: Page) => page.getByTestId('manage-account');

async function openDelete(page: Page) {
  await page.getByRole('button', { name: 'Delete account…' }).click();
  await expect(
    page.getByRole('heading', { name: `Delete the account for ${EMAIL}?` }),
  ).toBeFocused();
}

/** Finished sessions in this browser's IndexedDB. */
async function sessionCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      if (!db.objectStoreNames.contains('sessionLogs')) return resolve(0);
      const req = db.transaction('sessionLogs').objectStore('sessionLogs').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return count;
  });
}

test.describe('M7-06 delete account', () => {
  test('deletes the account and keeps this device’s progress, retrying until the server is done', async ({
    page,
  }) => {
    const server = await setUp(page);
    await seedFinishedSessions(page, 3);
    await signIn(page);
    const panel = page.getByRole('region', { name: 'Delete account' });
    await expect(panel).toContainText('removes your email address and the copy of your progress');
    await openDelete(page);
    await expect(page.getByRole('radio', { name: /Keep it on this device/ })).toBeChecked();

    server.failNext = 1;
    await page.getByRole('button', { name: 'Delete my account' }).click();
    // Signed out at once: the sign-in panel steps aside while the delete runs.
    await expect(page.getByRole('region', { name: 'Your account' })).toHaveCount(0);
    await expect(page.getByTestId('deletion-status')).toContainText('hasn’t finished yet');
    await expect(page.getByRole('heading', { name: 'Account deleted' })).toBeFocused({
      timeout: 15_000,
    });
    expect(server.deletes).toBe(2);
    await expect(deletePanel(page)).toContainText('Your progress is still here on this device');
    expect(await sessionCount(page)).toBe(3);
    expect(await page.evaluate(() => localStorage.getItem('fretwork.account'))).toBeNull();

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(
      page.getByRole('region', { name: 'Save your progress across devices' }),
    ).toBeVisible();
    await expect(deletePanel(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // Signing in again without a reload syncs the new account (a new
    // partition on the server), with a status of its own.
    server.deleted = false;
    const pushes = server.pushes;
    await signIn(page);
    await expect(page.getByTestId('sync-status')).toHaveText('Last synced just now.');
    expect(server.pushes).toBeGreaterThan(pushes);
  });

  test('deletes this device’s progress too when asked, and starts again', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const server = await setUp(page);
    await seedFinishedSessions(page, 2);
    await signIn(page);
    await openDelete(page);
    await page.getByRole('radio', { name: /Delete it from this device too/ }).check();
    await page.getByRole('button', { name: 'Delete my account' }).click();

    await expect(deletePanel(page)).toContainText('The progress on this device is deleted too');
    expect(server.deleted).toBe(true);
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fretwork'))),
    ).toEqual([]);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    expect(await sessionCount(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('a delete interrupted by a reload finishes after it', async ({ page }) => {
    const server = await setUp(page);
    await signIn(page);
    await openDelete(page);
    server.down = true;
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('deletion-status')).toContainText('You’re offline');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Deleting the account' })).toBeVisible();
    // Still signed out, and the sign-in offer stays away until the delete is done.
    await expect(
      page.getByRole('region', { name: 'Save your progress across devices' }),
    ).toHaveCount(0);

    server.down = false;
    await expect(page.getByRole('heading', { name: 'Account deleted' })).toBeVisible({
      timeout: 15_000,
    });
    expect(server.deleted).toBe(true);
  });

  test('a delete waiting after a reload finishes from Today, without opening Progress', async ({
    page,
  }) => {
    const server = await setUp(page);
    await seedFinishedSessions(page, 3);
    await signIn(page);
    await openDelete(page);
    server.down = true;
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('deletion-status')).toContainText('You’re offline');

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    // Signed out, but no offer to sign in while the delete is waiting.
    await expect(page.getByRole('link', { name: 'Save my progress' })).toHaveCount(0);
    server.down = false;
    await expect.poll(() => server.deleted, { timeout: 15_000 }).toBe(true);
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => localStorage.getItem('fretwork.account.deleting'))).toBeNull();
    // Done: the offer comes back on its own.
    await expect(page.getByRole('link', { name: 'Save my progress' })).toBeVisible();
    expect(await sessionCount(page)).toBe(3);
  });

  test('cancel keeps the account, and export works from the delete step and from Settings', async ({
    page,
  }) => {
    const server = await setUp(page);
    await signIn(page);
    await openDelete(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export a backup' }).click();
    expect((await download).suggestedFilename()).toMatch(/^fretfree-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(deletePanel(page)).toContainText('Backup saved');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Delete account…' })).toBeFocused();
    expect(server.deletes).toBe(0);

    await page.goto('/settings');
    const fromSettings = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export data' }).click();
    expect((await fromSettings).suggestedFilename()).toMatch(/\.json$/);
    await page.goto('/progress');
    await expect(page.getByRole('region', { name: 'Your account' })).toContainText(EMAIL);
  });

  test('deletes the account on a phone @smoke @phone', async ({ page }) => {
    const server = await setUp(page);
    await signIn(page);
    await openDelete(page);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('heading', { name: 'Account deleted' })).toBeVisible();
    expect(server.deleted).toBe(true);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('M7-06 privacy copy', () => {
  test('Privacy and About say what the optional account stores, where and why @smoke', async ({
    page,
  }) => {
    await freshStart(page, '/privacy');
    const account = page.getByRole('region', { name: 'If you sign in (optional)' });
    await expect(account).toContainText('Your email address, used only to sign you in');
    await expect(account).toContainText('us-east-1');
    await expect(account).toContainText('eu-west-1');
    await expect(account).toContainText('an anonymous marker');
    await expect(page.getByText('No cookies, no analytics, no ads.')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/about');
    const privacy = page.getByRole('region', { name: 'Privacy' });
    await expect(privacy.getByText('An account is optional.')).toBeVisible();
    await expect(privacy.getByText('No analytics.')).toBeVisible();
  });
});
