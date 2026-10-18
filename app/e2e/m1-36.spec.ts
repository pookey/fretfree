import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { focusSession } from './helpers/focus';

// M1-36: a developer-only "unlock every skill" switch. It exists only in
// development builds, so the flow runs against a Vite dev server this spec
// starts itself; the production build (what the suite serves) must have no
// trace of it.

const APP = fileURLToPath(new URL('..', import.meta.url));
const BADGE = 'Developer: all skills unlocked';
// Strings only the switch's code contains: its copy and its storage key.
const TRACES = [BADGE, 'Unlock every skill', 'fretwork.dev.unlockAll', 'dev-unlock-badge'];
const external = Boolean(process.env.E2E_BASE_URL);

const toggle = (page: Page) => page.getByRole('checkbox', { name: 'Unlock every skill' });

async function setUnlockAll(page: Page, on: boolean): Promise<void> {
  await page.goto('/settings');
  const card = page.getByRole('group', { name: 'Developer' });
  await expect(card).toBeVisible();
  await toggle(page).setChecked(on);
  await expect(page.getByText(BADGE)).toHaveCount(on ? 1 : 0);
}

async function openChords(page: Page): Promise<void> {
  await page.goto('/learn?module=chords');
  await expect(page.getByTestId('module-detail')).toBeVisible();
}

test.describe('production build', () => {
  test.skip(external, 'checks the local build');

  test('has no developer switch in Settings @smoke', async ({ page }) => {
    await freshStart(page, '/settings');
    await expect(page.getByRole('group', { name: 'Guides and timing' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Developer' })).toHaveCount(0);
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.getByText(BADGE)).toHaveCount(0);
  });

  test('ships no trace of the switch: not in its code, not in its sourcemaps', async () => {
    test.skip(test.info().project.name !== 'ipad-landscape', 'one file check is enough');
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    })(join(APP, 'dist'));
    const code = files.filter((f) => /\.(js|css|html)$/.test(f));
    const maps = files.filter((f) => f.endsWith('.map'));
    expect(code.some((f) => f.endsWith('.js'))).toBe(true);
    expect(maps.length).toBeGreaterThan(0);
    for (const file of code) {
      const text = readFileSync(file, 'utf8');
      for (const trace of TRACES) expect(text.includes(trace), `${trace} in ${file}`).toBe(false);
    }
    // The module itself is dropped whole: no source of it ships, even for debugging.
    for (const file of maps) {
      const { sources } = JSON.parse(readFileSync(file, 'utf8')) as { sources: string[] };
      expect(
        sources.filter((s) => s.includes('DeveloperTools')),
        file,
      ).toEqual([]);
    }
  });
});

test.describe('development build', () => {
  test.skip(external, 'needs a local dev server');
  test.describe.configure({ mode: 'serial' });

  // A port of its own, next to the slot's preview port, so parallel slots don't collide.
  const port = Number(process.env.E2E_PORT ?? 4173) + 100;
  const devURL = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined;

  test.use({ baseURL: devURL });

  test.beforeAll(async () => {
    if (test.info().project.name !== 'ipad-landscape') return;
    test.setTimeout(120_000);
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { cwd: APP, stdio: 'ignore', env: { ...process.env, PORT: String(port) } },
    );
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(devURL)).ok;
          } catch {
            return false;
          }
        },
        { timeout: 60_000 },
      )
      .toBe(true);
  });

  test.afterAll(() => {
    server?.kill();
  });

  test('unlocks Chords for a focus session, and locks it again when off', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-landscape', 'the dev server runs once, on iPad');
    test.setTimeout(180_000);
    // The first loads compile on demand; let Vite settle before asserting.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await freshStart(page);

    // Off: Chords is locked, and a Chords session has nothing to serve.
    await openChords(page);
    const triads = page.getByTestId('skill-C5.triads');
    await expect(triads).toHaveAttribute('data-status', 'locked');
    await expect(triads.getByRole('link', { name: 'Practise this now' })).toHaveCount(0);

    // On: the badge shows on every screen, and Chords is on the frontier.
    await setUnlockAll(page, true);
    await openChords(page);
    await expect(page.getByText(BADGE)).toBeVisible();
    await expect(triads).toHaveAttribute('data-status', 'unlocked');
    await expect(page.getByTestId('module-chords')).toHaveAttribute('data-state', 'open');
    await expect(triads.getByRole('link', { name: 'Practise this now' })).toHaveAttribute(
      'href',
      '/session?skill=C5.triads',
    );
    await focusSession(page, 'C5.triads');
    await expect(page.getByTestId('d7-subject')).toBeVisible();
    await expect(page.getByText(BADGE)).toBeVisible();

    // Off again: Chords is locked, exactly as before.
    await setUnlockAll(page, false);
    await openChords(page);
    await expect(triads).toHaveAttribute('data-status', 'locked');
    await expect(page.getByTestId('module-chords')).toHaveAttribute('data-state', 'locked');
    await expect(triads.getByRole('link', { name: 'Practise this now' })).toHaveCount(0);
    await expect(triads.getByTestId('skill-progress')).toHaveText(/^0 learning · 0 stable of \d+$/);
    await page.goto('/session?skill=C5.triads');
    await expect(page.getByTestId('session-empty')).toBeVisible();
  });
});
