#!/usr/bin/env node
// Local Lighthouse PWA and accessibility gate (design §10). Run `pnpm lighthouse`
// (it builds first). Needs network once, to fetch the pinned Lighthouse.
//
// 1. PWA: Lighthouse 12 dropped its PWA category, so this checks what it used
//    to: Chrome's own installability verdict (CDP Page.getInstallabilityErrors),
//    the manifest and iOS home-screen tags, and an offline reload served by the
//    service worker.
// 2. Lighthouse accessibility and best practices on every screen, at iPad Pro
//    11 landscape, in the dark (default) and light colour schemes.
//    Accessibility must score 100 everywhere.
//
// It drives Playwright's Chromium (already installed for e2e) with a remote
// debugging port, so Lighthouse audits the same profile that skipped
// onboarding. Lighthouse runs through `pnpm dlx` and is not a project
// dependency: it bundles axe-core (MPL-2.0), which the licence policy keeps
// out of the lockfile.
//
// Env: LH_PORT (preview, default 5421), LH_DEBUG_PORT (default 5422).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIGHTHOUSE = 'lighthouse@13.5.0';
const MIN_SCORES = { accessibility: 1, 'best-practices': 0.9 };
// Onboarding is audited first, on a fresh profile; the rest after skipping it.
const FRESH_ROUTES = ['/onboarding'];
const ROUTES = [
  '/',
  '/learn',
  '/explore',
  '/progress',
  '/settings',
  '/privacy',
  '/about',
  '/account/verify',
  '/session',
];
const IPAD = { width: 1194, height: 834, deviceScaleFactor: 2 };
const RUN_TIMEOUT_MS = 120_000;
// Blink's preferredColorScheme setting: 0 is dark, 1 is light.
const SCHEMES = { dark: 0, light: 1 };
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const port = Number(process.env.LH_PORT ?? 5421);
const debugPort = Number(process.env.LH_DEBUG_PORT ?? 5422);
const base = `http://127.0.0.1:${port}`;
const { chromium } = createRequire(join(app, 'package.json'))('@playwright/test');

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

if (!existsSync(join(app, 'dist', 'index.html'))) {
  console.error('lighthouse: app/dist is missing. Run `pnpm build` first.');
  process.exit(1);
}

const preview = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { cwd: app, stdio: 'ignore' },
);
const reports = mkdtempSync(join(tmpdir(), 'fretwork-lh-reports-'));

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not start on ${base}`);
}

async function checkPwa(page) {
  console.log('PWA');
  await page.goto(base);
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
    null,
    { timeout: 20_000 },
  );
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check(
    installabilityErrors.length === 0,
    `Chrome finds the app installable${installabilityErrors.length ? `: ${installabilityErrors.map((e) => e.errorId).join(', ')}` : ''}`,
  );

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await fetch(new URL(href, base))).json();
  check(manifest.display === 'standalone', 'manifest display is standalone');
  check(Boolean(manifest.name && manifest.short_name), 'manifest has name and short_name');
  check(manifest.start_url === '/' && manifest.scope === '/', 'manifest start_url and scope are /');
  check(
    Boolean(manifest.theme_color && manifest.background_color),
    'manifest has theme and background colours',
  );
  const sizes = manifest.icons.map((i) => i.sizes);
  check(sizes.includes('192x192') && sizes.includes('512x512'), 'manifest has 192 and 512 icons');
  check(
    manifest.icons.some((i) => i.purpose?.includes('maskable')),
    'manifest has a maskable icon',
  );
  for (const icon of manifest.icons) {
    check((await fetch(new URL(icon.src, base))).ok, `icon ${icon.src} is served`);
  }
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  check(
    Boolean(touchIcon) && (await fetch(new URL(touchIcon, base))).ok,
    'apple-touch-icon is served',
  );
  check(
    (await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')) ===
      'yes',
    'iOS standalone meta tag is set',
  );

  // Pages loaded after activation are controlled. Chromium can take a moment
  // to route navigations to a just-activated worker, so retry briefly.
  let controlled = false;
  for (let i = 0; i < 20 && !controlled; i++) {
    await page.goto(`${base}/learn`);
    controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
    if (!controlled) await page.waitForTimeout(250);
  }
  check(controlled, 'the service worker controls the page');
  await page.context().setOffline(true);
  await page.goto(`${base}/onboarding`);
  // Onboarding is a lazy chunk: its heading renders a moment after load.
  const served = await page
    .getByRole('heading', { level: 1 })
    .first()
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false,
    );
  check(served, 'offline, the service worker serves the app');
  await page.context().setOffline(false);
}

// Run a child without blocking the event loop: Playwright must keep draining
// its pipe to the browser while Lighthouse drives it.
function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), RUN_TIMEOUT_MS);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function lighthouse(route, scheme) {
  const name = route === '/' ? 'today' : route.slice(1).replaceAll('/', '-');
  const out = join(reports, `${scheme}-${name}.json`);
  // With nothing on --port, Lighthouse would launch a Chrome of its own.
  try {
    await fetch(`http://127.0.0.1:${debugPort}/json/version`);
  } catch {
    check(false, `the audited browser is listening on port ${debugPort}`);
    return;
  }
  const status = await run('pnpm', [
    'dlx',
    LIGHTHOUSE,
    `${base}${route}`,
    `--port=${debugPort}`,
    '--only-categories=accessibility,best-practices',
    '--disable-storage-reset',
    '--throttling-method=provided',
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    `--screenEmulation.width=${IPAD.width}`,
    `--screenEmulation.height=${IPAD.height}`,
    `--screenEmulation.deviceScaleFactor=${IPAD.deviceScaleFactor}`,
    `--emulatedUserAgent=${IPAD_UA}`,
    '--output=json',
    `--output-path=${out}`,
    '--quiet',
  ]);
  if (status !== 0) {
    check(false, `Lighthouse ran on ${route}`);
    return;
  }
  const report = JSON.parse(readFileSync(out, 'utf8'));
  for (const [id, min] of Object.entries(MIN_SCORES)) {
    const category = report.categories[id];
    const score = category.score ?? 0;
    const label = `${route} ${category.title} ${Math.round(score * 100)} (min ${min * 100})`;
    check(score >= min, `${scheme} ${label}`);
    if (score < min) {
      for (const { id: audit } of category.auditRefs) {
        const a = report.audits[audit];
        if (a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative') {
          console.log(`      - ${a.id}: ${a.title}`);
        }
      }
    }
  }
}

/** A fresh profile per scheme, so onboarding is audited before it is skipped. */
async function auditScheme(scheme, withPwa) {
  const profile = mkdtempSync(join(tmpdir(), 'fretwork-lh-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: IPAD.width, height: IPAD.height },
    args: [
      `--remote-debugging-port=${debugPort}`,
      `--blink-settings=preferredColorScheme=${SCHEMES[scheme]}`,
    ],
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    if (withPwa) await checkPwa(page);

    console.log(`Lighthouse (iPad Pro 11 landscape, ${scheme})`);
    for (const route of FRESH_ROUTES) await lighthouse(route, scheme);
    await page.goto(`${base}/onboarding`);
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await page.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
    for (const route of ROUTES) await lighthouse(route, scheme);
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

try {
  await waitForServer();
  await auditScheme('dark', true);
  await auditScheme('light', false);
} catch (error) {
  failures.push(String(error));
  console.error(error);
} finally {
  preview.kill();
  console.log(`Lighthouse JSON reports: ${reports}`);
}

if (failures.length > 0) {
  console.error(`lighthouse: ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('lighthouse: OK');
