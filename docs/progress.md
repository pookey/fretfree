# Progress

## Current status

**M0 Foundations: done. Orchestration dry run: done. Build handed to the `builder` agent (2026-10-18).**

- M1-01 (route/card/panel/view/onboarding registries) and M1-02 (gamification contracts) went through the full pipeline: worker, then fresh reviewer, then integration lane, then `pnpm ship`, then push. Both are live.
- The `builder` agent runs `docs/handoff/02-build-brief.md` in a sibling Herdr pane and fans out across M1–M6, pulling M8 forward when slots are idle.

**M0 foundations (2026-10-18).**

- Live at https://guitar.dwellsee.com. `scripts/smoke.sh` passes, and so does the Playwright `@smoke` suite against production on all four profiles.
- `pnpm verify` is green on `main`: 148 unit tests (≈99% line coverage on theory, engine, storage, drills and session), 5 infra tests and 20 e2e tests.

What exists:

- **App shell:**
  - iPad-first, with width-based size classes (sidebar plus context panel at regular-wide, icon sidebar at regular, tab bar at compact);
  - dark-first tokens and safe areas;
  - PWA offline precache and an update toast.
- **Theory:** `theory/` covers fretboard ↔ note, positions, octaves and the G–B shift, major CAGED shapes and chain, and triads on string sets.
- **Engine:** `engine/` covers:
  - the ts-fsrs wrapper;
  - speed-aware grading;
  - the session builder (due reviews, blocked new items, interleaving, confusable pairing, retries);
  - adaptive scope;
  - mastery and soft unlocking;
  - guide fading;
  - skills, one file per topic.
- **Storage:** a Dexie schema v1 (including the §3.7 gamification tables), plus migrations and export/import.
- **Drills:** the plugin interface, with D1 "Name the highlighted note" working end to end (real FSRS scheduling, persistence, worked examples, retries, keyboard answers).
- **Infra:** CDK (S3 + CloudFront OAC + ACM + Route53) in us-east-1. Local delivery through `pnpm ship`, a pre-push hook (isolated verify of the pushed SHA plus a secret scan) and a machine-wide e2e semaphore.
- **Orchestration:** `docs/backlog.md` has 77 work packages (M1–M6), shaped for parallelism. The `fretwork-orchestrator` skill drives Herdr workers.

## Decisions and deviations (foundations)

- **Compact also means short.** Size classes are width-based as designed, but any window under 500pt tall counts as compact. Without this, an iPhone in landscape (852pt wide) would get the regular layout. It's still not device-based.
- **iPhone landscape neck.** The neck is letterboxed to fit the short screen, so its cells fall below 44pt there. That's acceptable for best-effort phone support because D1 answers with buttons. M1-20 adds a wider compact window.
- **Session layout on iPad landscape.** The context panel sits beside the prompt and answer buttons, and the 15-fret neck spans the full width below them. With the panel alongside the neck instead, the cells shrank to about 37pt; e2e caught this.
- **TypeScript 6.0, not 7.0.** typescript-eslint doesn't support TS 7 yet.
- **DNS.** Besides the `guitar` A/AAAA aliases, CDK created the ACM DNS-validation CNAME (`_….guitar.dwellsee.com`). No other records in the zone were touched.
- **The S3 bucket is `RETAIN`ed** if the stack is deleted, so production content can't vanish by accident.
- **Backlog statuses in git move only `todo → done/blocked`.** In-flight states live in `.orchestrator/state.json`, so `main` stays clean for `pnpm ship`.
- **The pre-push hook** verifies the pushed SHA in a temporary clean worktree. It skips docs-only pushes and reuses SHAs that `pnpm ship` has already verified.

## Orchestration dry run (M1-01, M1-02)

Two workers ran in parallel in an orchestrator-created tab (serial phase, ceiling 2).

| WP | Worker | Review rounds | Integration | Result |
|---|---|---|---|---|
| M1-01 | about 18 min | 1 (approved; its should-fix became an M1-06 backlog change: route guard) | 44 s: rebase, ff, ship, push | live |
| M1-02 | about 6 min, plus 3 fix rounds | 4 (each round found a real forgiveness bug in the streak contract) | 44 s | live |

Rough edges found and fixed in the skill:

- `health.sh` died under `pipefail` when `pgrep` matched nothing.
- `poll.sh` now suggests each package's next pipeline step.
- Old reviews are archived before a fix round, so the next reviewer starts fresh.
- Review rounds and integration failures are capped separately, at 3 each.
- `ship.sh` writes its phase, so the lane can tell a failed verify (reset `main`, nothing shipped) from a failed deploy (stop the line).
- Re-reviews are scoped to earlier must-fixes plus regressions. Issues that belong to later packages go under "Downstream notes", which `cleanup.sh` forwards into those workers' briefs. The first notes are already queued for M1-09 and M1-10.

The trust-folder prompt never appeared, because worktrees under the trusted repo inherit trust. `ensure-ready.sh` still handles it, accepting only for `.orchestrator/worktrees/*`.

## Questions for the user

None open.

### Answered

- **Name:** keep "Fretwork" (user, 2026-10-18).
- **Dependencies:** the orchestrator may add licence-compatible dependencies (MIT/ISC/BSD/Apache-2.0/0BSD) itself, without asking each time (user, 2026-10-18).

## Parallelism log

| Period | Phase | Ceiling | Avg active | Peak | Notes |
|---|---|---|---|---|---|
| Dry run (M1-01, M1-02) | serial | 2 | 1.6 | 2 | 16 samples. Idle time was spent in review rounds on M1-02 |

From here on, the builder appends rows from `.orchestrator/state.json` → `parallelism`.
