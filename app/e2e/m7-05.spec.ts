import { expect, test, type Page, type Route } from '@playwright/test';
import { answer, freshStart, targetNote } from './helpers';
import { API_URL, CODE, mockAuth } from './helpers/account';
import { focusSession } from './helpers/focus';

/** A record as it crosses the wire (app/src/storage/sync/model.ts `SyncRecord`, dates tagged). */
interface WireRecord {
  table: string;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

// M7-05: the client sync engine against a fake sync API, with sign-in mocked
// as in M7-04. The service worker is blocked so every request reaches the mocks.
test.use({ serviceWorkers: 'block' });

const EMAIL = 'learner@example.com';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/**
 * The M7-03 sync API in memory, shared by every page given it: one user's
 * records, each change taking the next sequence number. The merge is a plain
 * "later `updatedAt` wins", enough for these specs; the real merge rules are
 * unit-tested (sync/merge.test.ts, sync/engine.test.ts). `down` makes the API
 * unreachable, and `failNext` answers that many requests with a 500.
 */
class SyncServer {
  seq = 0;
  readonly records = new Map<string, { seq: number; record: WireRecord }>();
  down = false;
  failNext = 0;
  pushes = 0;

  store(records: readonly WireRecord[]): void {
    for (const incoming of records) {
      const key = `${incoming.table}#${incoming.id}`;
      const stored = this.records.get(key);
      if (stored && stored.record.updatedAt >= incoming.updatedAt) continue;
      this.records.set(key, { seq: ++this.seq, record: incoming });
    }
  }

  live(table: string): WireRecord[] {
    return [...this.records.values()]
      .map((r) => r.record)
      .filter((r) => r.table === table && !r.deleted);
  }

  async attach(page: Page): Promise<void> {
    // Registered after mockAuth's, so it answers the sync routes first.
    await page.route(`${API_URL}/sync/**`, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (this.down) return route.abort('internetdisconnected');
    const reply = (status: number, body: unknown) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (this.failNext > 0) {
      this.failNext--;
      return reply(500, { error: 'internal' });
    }
    if (req.headers().authorization !== 'Bearer e2e-access') return reply(401, {});
    const url = new URL(req.url());
    if (url.pathname === '/sync/push' && req.method() === 'POST') {
      const { records } = req.postDataJSON() as { records: WireRecord[] };
      this.store(records);
      this.pushes++;
      return reply(200, { ok: true });
    }
    if (url.pathname === '/sync/pull' && req.method() === 'GET') {
      const cursor = Number(url.searchParams.get('cursor') || 0);
      const after = cursor > this.seq ? 0 : cursor;
      const page = [...this.records.values()]
        .filter((r) => r.seq > after)
        .sort((a, b) => a.seq - b.seq);
      return reply(200, {
        records: page.map((r) => r.record),
        cursor: String(page.at(-1)?.seq ?? after),
        more: false,
      });
    }
    return reply(404, { error: 'not-found' });
  }
}

/** A review log another device pushed, as the server holds it. */
function otherDevicesLog(uid: string): WireRecord {
  return {
    table: 'reviewLogs',
    id: uid,
    updatedAt: Date.parse('2026-10-01T09:00:00Z'),
    deleted: false,
    data: {
      itemId: 'note@s6f3',
      skillId: 'F2.string6-naturals',
      drillType: 'name-the-note',
      correct: true,
      responseMs: 1500,
      rating: 3,
      hintUsed: false,
      answerGiven: 'G',
      at: { $date: '2026-10-01T09:00:00.000Z' },
    },
  };
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

const status = (page: Page) => page.getByTestId('sync-status');

/** Review logs in this browser's IndexedDB, by uid. */
async function localLogUids(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ uid: string }[]>((resolve, reject) => {
      const req = db.transaction('reviewLogs').objectStore('reviewLogs').getAll();
      req.onsuccess = () => resolve(req.result as { uid: string }[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.map((r) => r.uid).sort();
  });
}

/** Answer `count` D1 prompts correctly, then end the session. */
async function practise(page: Page, count: number) {
  await focusSession(page, 'F2.string6-naturals');
  for (let i = 0; i < count; i++) {
    await answer(page, await targetNote(page));
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  }
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByTestId('session-summary')).toBeVisible();
}

/** Ask for a round, as returning to the app does. */
const refocus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

test.describe('M7-05 sync engine', () => {
  test('first sign-in uploads this device’s progress and merges the account’s @smoke', async ({
    page,
  }) => {
    await mockAuth(page);
    const server = new SyncServer();
    server.store([otherDevicesLog('other-device-log')]);
    await server.attach(page);
    await freshStart(page);
    // Signed out, nothing goes to the sync API.
    await page.waitForTimeout(1500);
    expect(server.pushes).toBe(0);

    await signIn(page);
    await expect(status(page)).toHaveText('Last synced just now.');
    // This device's progress is on the server: onboarding's settings and goal.
    expect(server.live('settings')).toHaveLength(1);
    expect(server.live('gamification')).toHaveLength(1);
    // And the other device's review log is here.
    expect(await localLogUids(page)).toEqual(['other-device-log']);

    await page.reload();
    await expect(status(page)).toHaveText('Last synced just now.');
  });

  test('syncs after a session, and says when it is offline or failing', async ({ page }) => {
    await mockAuth(page);
    const server = new SyncServer();
    await server.attach(page);
    await freshStart(page);
    await signIn(page);
    await expect(status(page)).toHaveText('Last synced just now.');

    await practise(page, 2);
    await expect.poll(() => server.live('reviewLogs').length).toBe(2);
    expect(server.live('sessionLogs')).toHaveLength(1);

    await page.goto('/progress');
    await expect(status(page)).toHaveText('Last synced just now.');
    server.down = true;
    await refocus(page);
    await expect(status(page)).toHaveText(
      'Offline. Your progress is saved on this device and syncs when you’re back online. Last synced just now.',
    );

    server.down = false;
    server.failNext = 1;
    await refocus(page);
    await expect(status(page)).toContainText(
      'Couldn’t sync just now. FretFree will try again soon.',
    );

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(status(page)).toHaveText('Last synced just now.');
  });

  test('two devices that practised apart end up with every review log', async ({
    page,
    browser,
  }) => {
    const server = new SyncServer();
    const ready = async (p: Page) => {
      await mockAuth(p);
      await server.attach(p);
      await freshStart(p);
    };
    // A second browser profile is a second device: its own IndexedDB.
    const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
      test.info().project.use;
    const other = await browser.newContext({
      baseURL,
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      serviceWorkers: 'block',
    });
    const a = { page };
    const b = { page: await other.newPage() };
    await ready(a.page);
    await ready(b.page);
    await practise(a.page, 2);
    await practise(b.page, 1);

    await signIn(a.page);
    await expect(status(a.page)).toHaveText('Last synced just now.');
    await signIn(b.page);
    await expect(status(b.page)).toHaveText('Last synced just now.');
    expect(await localLogUids(b.page)).toHaveLength(3);

    await refocus(a.page);
    await expect.poll(() => localLogUids(a.page)).toEqual(await localLogUids(b.page));
    await other.close();
  });
});
