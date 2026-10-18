# Progress

## Current status

**Second shift, first report (2026-10-18, 14:05). 32 work packages live. 9 shipped this shift. Production healthy: smoke passes after every ship.**

Shipped this shift: M2-02 (C1 octave skills), M2-04 (C3 interval-shape skills, with C1 as a soft prerequisite), M9-01 (tab model and `<TabStaff>`), M1-15 (guide fading in-session, blind mode), **M1-27 (user feedback: D3 says "note", and answers by tapping the neck)**, M2-07 (worked-example framework, G–B shift content), M1-17 (multi-drill sessions, in-session learning steps), M1-20 (compact polish: wider neck on short landscape, help as a sheet), M1-22 (settings, sound and About).

In flight: M2-03 (D4 octave finder), M2-05 (D5 name the interval), M2-06 (D6 tap the interval).

**From user feedback (2026-10-18, second shift):**
- **M1-27 (live):** "why 'letter' rather than 'note'?" and "clicking the fretboard should be the same as pressing the letters". F1 prompts now read "The note before C in the musical alphabet?". D3's neck is an answer surface with the same grading path as the buttons.
- **Chord lessons logged (M3-04 widened, M3-13 to M3-15):** finding the root first, then the 3rd, 5th and 7th, in both directions (D8). Also D36 "What chord is this?", D37 chord tones across the neck (multi-target; "highlight all notes in a C chord"), and D38 "Build the chord". Explore v2 and the C4–C6 worked examples gain matching hooks.

**Process changes:**
- `engine/config.ts` is split into `engine/config/<area>.ts`, auto-collected with `EngineConfig` declaration merging. Workers add an area file instead of appending to a hub.
- The shared e2e files (`helpers.ts`, `d1-session.spec.ts`, `smoke.spec.ts`) are orchestrator-owned. New helpers go in `e2e/helpers/<topic>.ts`. M2-11 owns the shared specs and will pin them to a skill with `focusSession`.
- A new `queued` worker status counts as in flight. Without it, `refill.sh` re-planned M9-01 while it waited in the lane and tried to spawn a second worker into its worktree (the agent never started; the pane was closed).
- Unit-test timeouts are raised for verify under load: Vitest `testTimeout` 20 s, Testing Library `asyncUtilTimeout` 5 s.

**Parallelism (107 samples since 12:43):** average 5.5 active workers, peak 7, idle-slot share 0.28. The ceiling ran 2 → 7 → 4. Load from concurrent worktree verifies (load1 35–57, up to 85 Playwright processes) kept `health.sh` stepping it down.

**Incidents:** no stop-the-line events and no usage-limit pauses.
- Two verify failures in the lane were load timeouts in healthy tests (M1-17: heatmap `waitFor`; M1-20: arpeggios, LearnScreen, WorkedExample). `main` was reset each time and nothing broken shipped. Fixed by the timeout change above.
- Two rebase conflicts (M1-20 in D1View/D3View, M1-17 in `runner.ts`) came after M1-15 and M1-27 landed. Both workers resolved them.
- One reviewer brief was lost under load (M1-22) and was re-sent.

---

**First fan-out shift (2026-10-18).**

23 work packages live in production at the end of the first shift. The build is handed to a fresh PM (`docs/handoff/03-pm-handoff.md`) after moving the repo to `guitar.nosync`, so iCloud stops syncing it.

Shipped by the builder (each through worker, then fresh reviewer, then the integration lane, then `pnpm ship`, then push):

| Milestone | Live |
|---|---|
| M1 | M1-03 (F1/F3 skills, bidirectional F2/C2), M1-04 (D2 find the note), M1-05 (D3 note wheel), M1-06 (onboarding shell), M1-07 (latency calibration), M1-08 (XP engine), M1-09, M1-10 (session ↔ gamification bridge), M1-11, M1-12 (session celebrations), M1-13, M1-14 (Progress heatmap), M1-16 (Learn screen), M1-19 (PWA, offline, bundle budget, Lighthouse gate), **M1-25 (hotfix: recall prompts showed their answer)**, **M1-26 (reading question: "can read" / "want to learn")** |
| M2 | M2-01 (interval and octave theory) |
| M3 | M3-01 (chord and scale theory) |
| M4 | M4-01 (harmony theory) |
| M5 | M5-01 (mic pitch-source contract) |
| M6 | M6-01 (intermediate contract) |

In flight: none. All work in progress was drained before the handoff.

**Production:** healthy. `scripts/smoke.sh` passes after every ship. The M1-25 and M1-26 specs were also run against production on iPad landscape and pass.

**From user feedback (2026-10-18):**
- **M1-25 (hotfix, live):** at guide level 3, which new learners start at, `<Fretboard>` labelled the queried cell, so "Name the highlighted note" showed the answer. Now a `target` marker is only labelled through `forceLabel` (worked example, feedback). The nut's string name is also hidden for fret-0 and fret-12 targets.
- **M1-26 (live):** onboarding asks "What can you already read?" and "What would you like to learn to read?" (tab and/or standard, both multi-select). `Settings.notation` became `reading.{reads,learn}.{tab,staff}`, and legacy values are mapped on read.
- **New milestone M9 (tab reading):** the user chose to back "learn to read tab" with a real track: a tab model and component, D33 (tab to neck), D34 (neck to tab), D35 (read a phrase), frontier promotion and QA. It's in normal priority order, ahead of the deferred M8.

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

## Fan-out incidents and fixes (2026-10-18)

- **Stale Vitest module cache (fixed, a53c400).** Vitest 5's `fsModuleCache` reused a cached `import.meta.glob` expansion in the long-lived main checkout, so `pnpm verify` on main lost M1-03's new skill files while fresh worktrees passed. The quality gate now runs with `fsModuleCache: false`.
- **Load spikes (load average up to ~340 on 10 cores).** These came from five or more worktree `pnpm verify` runs at once (typecheck, build, Vitest and Playwright WebKit). The e2e semaphore only bounds Playwright. The ceiling followed `health.sh` between 5 and 8, and the lane only ships when load1 is ≤ 45. The two verify failures caused by load timeouts were reset by the lane, and nothing broken shipped.
- **`getcwd` EINTR ("Interrupted system call") from git, node and pnpm.** It recurs under heavy file churn. The lane now retries automatically when a failure is clearly EINTR. See the open question below.
- **macOS Keychain prompt blocked new agents** (`SecItemCopyMatching` waiting on `SecurityAgent`) for about 5 minutes. Spawns were paused, and the user cleared it.
- **Prompts not submitted under load.** `prompt_agent` (common.sh) now checks the agent left idle and presses Enter if not (4d5072d). `spawn.sh` retries a start that times out (7c4dc1b).
- **Drift: D3 changed the first prompt of a fresh session** (F1 note wheel before D1). Specs written earlier timed out in `answer()`. Fixed per WP with `masterSkills(page, F1_SKILLS)`. Queued WPs pre-flighted against main in parallel, rather than failing one by one in the serial lane.
- **Lane hazard: workers rebasing onto local `main` mid-integration.** `integrate.sh` fast-forwards `main` before verify. M1-16 rebased in that window and picked up M1-10's unshipped commits. Briefs now say `git rebase origin/main` (6b364b7, e9404e7).
- **No stop-the-line events.** Every failure was caught at verify (main reset, nothing deployed).

**Backlog-shape observations (applied in the second shift):**
- `app/src/engine/config.ts` ("every tunable threshold") is a de facto hotspot. Almost every WP appends a block to it, causing repeated rebase conflicts (M1-12 three times). Proposal: one config file per area (`engine/config/<area>.ts`, auto-merged, as the registries are), so WPs add files instead of editing a hub. **Done:** `engine/config/` is auto-collected by `import.meta.glob`, with each area typed through `EngineConfig` declaration merging.
- Shared e2e specs (`d1-session.spec.ts`, `smoke.spec.ts`) and `e2e/helpers.ts` are owned by no WP but get edited whenever a drill changes the session flow. Proposal: make them orchestrator-owned and have WPs add helpers in new files. **Done:** the worker brief now says so. M2-11 (focused sessions) will add a `focusSession(page, skillId)` helper so specs pin a skill instead of depending on what a fresh session serves.

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
- **"Learn to read" scope:** add a small tab-reading track (M9) so "learn tab" is a real option (user, 2026-10-18).
- **iCloud:** `~/Documents` is iCloud-synced, and `fileproviderd` was the top CPU user. iCloud only skips names that *end* in `.nosync`, and `Projects.nosync.noindex` ends in `.noindex`. The repo was renamed to `guitar.nosync` (user, 2026-10-18).

## Parallelism log

| Period | Phase | Ceiling | Avg active | Peak | Notes |
|---|---|---|---|---|---|
| Dry run (M1-01, M1-02) | serial | 2 | 1.6 | 2 | 16 samples. Idle time was spent in review rounds on M1-02 |

| Fan-out, 09:24–11:47 UTC | fanout | 5–8 (one hotfix burst to 10) | 7.3 | 10 | 155 samples, 4% idle slots. The serial ship lane (≈5–10 min per ship) was the bottleneck, not workers. Reviewers ran in parallel throughout |
| Drain, 11:47–handoff | fanout → paused | 2–5 (load-driven, iCloud) | ≈4 | 6 | No new spawns after the user asked for the handoff. M1-12, M1-07, M6-01 and M1-19 drained through the lane |

From here on, the builder appends rows from `.orchestrator/state.json` → `parallelism`.
