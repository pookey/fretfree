import { defineConfig, devices } from '@playwright/test';

// E2E_PORT is set per Playwright slot by scripts/e2e-slot.sh so parallel worktrees don't collide.
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const external = Boolean(process.env.E2E_BASE_URL);

// iPad-first (design §2, §7). iPad profiles run the full suite; the iPhone
// profile is best-effort and only runs specs tagged @smoke.
// The whole matrix runs in the integration lane (`pnpm e2e`). Worker checks
// run `pnpm e2e:fast`: ipad-landscape (the primary size class) plus the phone
// smoke tests, a third of the matrix (scripts/verify-quick.sh).
export default defineConfig({
  testDir: './e2e',
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
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'] } },
    { name: 'ipad-portrait', use: { ...devices['iPad Pro 11'] } },
    { name: 'ipad-mini-landscape', use: { ...devices['iPad Mini landscape'] } },
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
