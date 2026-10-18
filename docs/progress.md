# Progress

## Current status

**M0 Foundations: done (2026-10-18).**

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

## Questions for the user

1. **Name.** "Fretwork" is still a working title, but it's now in the PWA manifest, the README and the home-screen label. Keep it?
2. **Dependency approvals.** Workers propose new dependencies instead of adding them. The orchestrator adds licence-compatible ones (MIT/ISC/BSD/Apache/0BSD) itself, e.g. chords-db in M3-09. Say if you'd rather approve each one.

## Parallelism log

(Filled in by the orchestrator from `.orchestrator/state.json`.)
