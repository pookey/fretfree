import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// E2E_PORT is set per Playwright slot by scripts/e2e-slot.sh so parallel worktrees don't collide.
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const external = Boolean(process.env.E2E_BASE_URL);

// The remote test runner (scripts/e2e-slot.sh with E2E_QUIET_WORKERS) runs in
// two passes: PW_QUIET_PHASE=main runs every spec but the "quiet" ones at full
// parallelism, then PW_QUIET_PHASE=quiet runs only those on a few workers.
// Quiet specs measure real audio output (they import ./helpers/audio): under
// heavy CPU load WebKit's audio rendering can stay silent for seconds.
const quietPhase = process.env.PW_QUIET_PHASE;
const quietSpecs = quietPhase
  ? readdirSync(new URL('./e2e/', import.meta.url)).filter(
      (f) =>
        f.endsWith('.spec.ts') &&
        /from '\.\/helpers\/audio'/.test(
          readFileSync(new URL(`./e2e/${f}`, import.meta.url), 'utf8'),
        ),
    )
  : [];
const quiet = new RegExp(
  quietSpecs.length ? `/(${quietSpecs.map((f) => f.replace(/\./g, '\\.')).join('|')})$` : '(?!)',
);

// iPad-first (design §2, §7). All four profiles are WebKit and differ only
// in viewport, so a test runs at a size only where the size can change it:
// - ipad-landscape (the primary size class) runs every test but @phone ones;
// - ipad-portrait and ipad-mini-landscape run @layout tests: those that
//   measure, scroll, branch on the project or take screenshots
//   (e2e/meta/tags.ts says which, and `tags.test.ts` fails on a test that
//   needs the tag and lacks it), plus layout-sweep.spec.ts;
// - iphone-smoke, best-effort, runs @smoke tests; @phone ones run only there.
// PW_FULL_MATRIX=1 runs every test on all three iPads, as the whole matrix
// did before (`pnpm e2e:full`, the scheduled safety net). Worker checks run
// `pnpm e2e:fast`: ipad-landscape plus the phone (scripts/verify-quick.sh).
const fullMatrix = process.env.PW_FULL_MATRIX === '1';
const extraIpad = fullMatrix ? { grepInvert: /@phone/ } : { grep: /@layout/, grepInvert: /@phone/ };
export default defineConfig({
  testDir: './e2e',
  // e2e/meta holds Vitest tests about the specs, not Playwright tests.
  testMatch: quietPhase === 'quiet' ? quiet : '**/*.spec.ts',
  ...(quietPhase === 'main' && { testIgnore: quiet }),
  fullyParallel: true,
  // Two e2e slots (plus the lane's) run at once; cap browsers per run so they
  // share the machine. The integration lane raises it.
  workers: Number(process.env.PW_WORKERS ?? 4),
  // The integration lane retries a failed test once: one load-induced timeout
  // used to fail a whole batch (a 35-minute verify, then every WP again, one
  // at a time). integrate.sh records the tests that passed on retry in
  // .orchestrator/flaky.log so they get fixed. Worker runs keep 0 retries so a
  // new spec can't hide its own flakiness.
  retries: Number(process.env.PW_RETRIES ?? (process.env.FRETWORK_LANE === '1' ? 1 : 0)),
  reporter: [['list']],
  use: {
    baseURL,
    // The remote runner turns tracing off (PW_TRACE=off): its traces never
    // come back to the Mac, and recording them tripled WebKit's CPU time there.
    trace: (process.env.PW_TRACE as 'off' | undefined) ?? 'retain-on-failure',
  },
  projects: [
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'] }, grepInvert: /@phone/ },
    { name: 'ipad-portrait', use: { ...devices['iPad Pro 11'] }, ...extraIpad },
    { name: 'ipad-mini-landscape', use: { ...devices['iPad Mini landscape'] }, ...extraIpad },
    { name: 'iphone-smoke', use: { ...devices['iPhone 15 landscape'] }, grep: /@smoke/ },
  ],
  webServer: external
    ? undefined
    : {
        // Run vite directly (no pnpm wrapper) so Playwright can stop it cleanly.
        // `pnpm e2e` builds first.
        command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
