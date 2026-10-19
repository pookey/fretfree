import { defineConfig, devices } from '@playwright/test';

// E2E_PORT is set per Playwright slot by scripts/e2e-slot.sh so parallel worktrees don't collide.
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const external = Boolean(process.env.E2E_BASE_URL);

// iPad-first (design §2, §7). iPad profiles run the full suite; the iPhone
// profile is best-effort and only runs specs tagged @smoke.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Two e2e slots (plus the lane's) run at once; cap browsers per run so they
  // share the machine. The integration lane raises it.
  workers: Number(process.env.PW_WORKERS ?? 4),
  retries: process.env.CI ? 2 : 0,
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
