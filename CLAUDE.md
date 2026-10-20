# Fretwork: agent guide

An iPad-first guitar-learning PWA (iPhone is best-effort). It is public and MIT-licensed. Read `docs/design/app-design.md` before changing behaviour.

## Non-negotiables

- **The design rules in `docs/research/02-learning-science.md` are normative.** If a task conflicts with them, the rules win. Note the deviation in `docs/progress.md`.
- **iPad first.** Design at regular-wide (≥1024pt) first, then degrade (design §7). Size classes are width-based (`app/src/shell/size-class.ts`). Neck cells stay ≥44pt on iPad.
- **Never commit** AWS account IDs, hosted-zone IDs, ARNs, credentials or `.env` files. `pnpm secret-scan` and the pre-push hook enforce this. Domain and profile names are config with env overrides (`scripts/lib.sh`).
- **No GitHub Actions.** GitHub is only a git remote. Everything (verify, build, deploy) runs locally.
- Dependencies must be MIT/ISC/BSD/Apache-2.0/0BSD. No GPL.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server (`PORT=5xxx pnpm dev` for a custom port) |
| `pnpm verify` | **The quality gate**: typecheck, lint, prettier check, unit tests with coverage thresholds, infra tests, build, first-load JS budget (`scripts/check-bundle.mjs`, ≤250 KB gzip), Playwright e2e |
| `pnpm verify:quick` | Work-package check: every static gate (in a CPU slot, `scripts/cpu-slot.sh`), then Playwright on the branch's own specs, or the full suite when the change reaches shared code or adds a drill (`scripts/verify-quick.sh`) |
| `pnpm test` / `pnpm --filter app test:watch` | Unit tests only |
| `pnpm lighthouse` | Build, then the local PWA + accessibility gate (`scripts/lighthouse.mjs`): Chrome installability, manifest and offline checks, then Lighthouse a11y (must be 100) and best practices on every screen, dark and light. Fetches a pinned Lighthouse via `pnpm dlx` |
| `pnpm e2e` | Build, then run Playwright through the machine-wide e2e semaphore (`scripts/e2e-slot.sh`, 2 slots, port per slot) |
| `pnpm ship` | On a clean `main`: secret scan → verify → deploy (`scripts/deploy.sh`) → smoke test production (`scripts/smoke.sh`) |
| `pnpm secret-scan [range]` | Scan a git range for account IDs, zone IDs and keys |

Playwright projects: `ipad-landscape`, `ipad-portrait` and `ipad-mini-landscape` run everything. `iphone-smoke` runs only tests tagged `@smoke`.

## Architecture (`app/src`)

- `theory/`: pure music theory and fretboard model, built on tonal. Strings are numbered 1 (high E) to 6 (low E). Exhaustively tested.
- `engine/`: the learning engine. Pure TS, no React. It contains `config/` (**every tunable threshold**, one file per area, auto-collected), `grading.ts` (correctness + RT → FSRS rating), `scheduler.ts` (ts-fsrs wrapper), `session.ts` (session builder), `adaptive.ts` (80–90% band), `mastery.ts` (mastery, unlocking, guide fading) and `skills/` (**one file per topic**, auto-registered).
- `storage/`: Dexie schema (`db.ts` `SCHEMA_VERSIONS`: append a version, never edit one), repository functions and JSON export/import. Gamification tables (§3.7) are in the schema.
- `drills/`: the plugin interface (`types.ts`, design §6). **One folder per drill**. `<drill>/drill.ts` default-exports the plugin and is auto-registered. Keep the pure logic in `logic.ts` (unit-tested) and the view in a `.tsx`. Only `meta.ts` (ID, scope, `canTest`, `conceptOf`) is first-load: `drill.ts` takes its logic from `lazyLogic` and its views from `lazyParts`, and never imports `logic.ts` or a view (`lazy-view.test.tsx` fails if it does). D1 (`d1-name-the-note/`) is the reference implementation.
- `session/`: `runner.ts` (plan → prompt → grade → FSRS → persist, tested against fake-indexeddb) and `SessionScreen.tsx`.
- `components/fretboard/`: the `<Fretboard>` SVG (design §8). Its geometry lives in `geometry.ts`.
- `shell/`: the app shell (sidebar / tab bar), `ScreenLayout` (context panel), size classes and the PWA update toast.
- `screens/`: Today / Learn / Explore / Progress.
- `audio/`: Tone.js, lazy-loaded and unlocked on first tap.

`infra/` is the CDK stack (S3 + CloudFront OAC + ACM + Route53, us-east-1). The zone is looked up by name, and `cdk.context.json` is git-ignored.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`. Keep theory and engine pure and deterministic: pass `now` and `rng` in, and never read the clock inside them.
- Coverage thresholds apply to `theory`, `engine`, `storage` and `drills` logic (90% lines). New pure modules need tests. UI gets RTL and Playwright tests.
- Add things by adding files: a new skill topic → `engine/skills/<topic>.ts`, a new drill → `drills/<id>/drill.ts`. Avoid editing shared hubs when a new file will do.
- A skill may name only drills that are registered, or that are listed in `PENDING` in `drills/registry.test.ts` with the open backlog WP that builds them. Otherwise its lesson opens to an empty session.
- CSS Modules plus the tokens in `styles/tokens.css`. Dark-first. Use the Okabe–Ito colours for highlights, and distinguish markers by shape as well as colour. Use rem units and respect `prefers-reduced-motion`.
- E2E selectors: roles and names first, `data-testid` where needed. Tag phone-relevant specs `@smoke`.
- Commit messages: imperative subject, with a body explaining why. Small logical commits.

## Orchestration

Multi-agent builds use the `fretwork-orchestrator` skill (`.claude/skills/fretwork-orchestrator/`) with Herdr. Work packages live in `docs/backlog.md`, and status summaries in `docs/progress.md`.
