# Progress

## Current status

**Third shift, first report (2026-10-18, 20:15). 49 work packages live. 9 shipped this shift, plus the infra session's domain retirement and new pages. Production at https://fretfree.app is healthy: smoke passed after every ship.**

Shipped this shift: M2-09 (placement test), **M1-28** (hotfix, user-reported: feedback and Continue always on screen), M3-02 (C4 key spelling + D7 "Spell it"), **M1-29** (user request: "Add to Home Screen" onboarding step and Today card), M3-03 (C5 chord-construction skills), M3-07 (chord-diagram component), M1-24 (**M1 milestone QA**: a first-week e2e on a mocked clock, a streak-repair e2e, and a 96-shot screenshot pass on production; the M1 definition of done is checked off below) and M3-05 (C6 CAGED skills + D9 "Build the shape at a root"). From the infra session: **guitar.dwellsee.com retired** (alias, certificate SAN and records removed; the certificate was replaced), Settings as its own `/settings` page, and a new `/privacy` page.

In flight: **M1-34** (user feedback: after a full first day every Learn ring read 0%, because the ring counts only items stable for 7+ days). It is approved and in pre-flight. PM decision from its review: the ring's centre shows the *learning* share with a visible "learning" caption, switching to the stable share once anything is stable, so a glance never reads learning as done.

**New work filed this shift:** M1-30 to M1-33 from the M1 QA: a visible streak-repair card, fretboard contrast (light-theme inactive frets and SVG nut labels, which axe doesn't check), the iPad-portrait mastery map clipping fret 12, and the summary's Done below the fold on phones held sideways. From user feedback (filed by another session): M1-34 to M1-36 and M2-15/16 (learning vs stable progress, retaking the placement test, testing out of a locked module, and a dev-only unlock).

**Parallelism (168 samples, 18:00–20:15):** average 3.0 in flight (counting queued WPs), peak 5. The ceiling ran 1 → 3 → 1, driven by load (load1 8–35).

**Incidents:** no stop-the-line events and no usage-limit pauses. One lane verify failure (M3-02) was a race in M2-09's PlacementTest focus assertion under load. It was fixed on main (`6808cfe`) and not counted against M3-02. Pre-flight rebases before queuing (M3-02, M1-28, M3-03, M1-24, M3-07, M3-05) caught drift from new onboarding steps and shared e2e helpers before the lane, with no further lane failures. Orchestrator fixes: `place_pane` now reads the Herdr workspace from the tab ID (a fresh PM in a new workspace couldn't spawn reviewers), and the first push of that fix failed silently after a 5-minute pre-push verify (an idle SSH connection); the retry reused the verified stamp.

---

**Second shift, final report (2026-10-18, 18:00, written by the third-shift PM). 41 work packages live, 18 of them shipped in the second shift. Production at https://fretfree.app is healthy: smoke passed after every ship.**

Shipped in the second shift: M2-02, M2-04, M9-01, M1-15, **M1-27** (user feedback), M2-07, M1-17, M1-20, M1-22 (all in the 14:05 report below), then M2-03 (D4 octave finder), M2-05 (D5 name the interval), M2-06 (D6 tap the interval), M2-08 (learned confusion matrix), M2-10 (daily quests), M2-11 (focused sessions, `focusSession`), M2-12 (Explore v2), M2-13 (per-user FSRS refit) and M1-18 (Today quick drills). Alongside them: the `engine/config/` split, the move to fretfree.app and the **FretFree rebrand** (palette, Clear Sans, mark, copy), plus the FretworkEmail (SES, `no-reply@fretfree.app`) and FretworkBrand (brand.fretfree.app) stacks, all landed from the infra session.

In flight at the handover: M2-09 (placement test; re-verifying after drift from D5/D6), M3-02 (C4 + D7 "Spell it"; fix round 1), **M1-28** (hotfix, user-reported: the feedback and Continue button must always be on screen; fix round 1, a dark-mode contrast issue) and **M1-29** (user request: an "Add to Home Screen" onboarding step and Today card, because an iOS Home Screen app doesn't share Safari's storage).

**User requests logged in the second shift:** chord lessons (M3-04 widened, M3-13 to M3-15), M7 accounts and sync (blocked, see the questions), M1-28 and M1-29. From the infra session, still to land: retiring the previous domain, a `/privacy` page, and Settings as its own `/settings` page.

**Parallelism (292 samples, 14:05–18:00):** average 5.3 active workers, peak 7, idle-slot share 0.02. The ceiling stepped 6 → 7 → 1 (15 changes), driven by load from concurrent verifies and the infra session's Lighthouse runs. It's at 1 now and `health.sh` suggests 2.

**Incidents:** no stop-the-line events and no usage-limit pauses. There were four lane verify failures, all with `main` reset and nothing broken shipped: two load timeouts (M1-17, M1-20, fixed by raising timeouts), one in M2-05, and drift in M2-09 (D5/D6 made the placement test probe C3 intervals). Three rebase conflicts (M1-20, M1-17, M1-18) were each resolved by the worker. The lane was paused once for the rebrand to land. Drift from new drills was the top cause of failures, so specs now have to start sessions with `focusSession`.

**DNS rule:** confirmed by the user (2026-10-18 evening): only `fretfree.app` and `www.fretfree.app` (plus ACM validation).

---

**Site moved to https://fretfree.app (2026-10-18).** The infra session deployed it, and the PM landed it (`dc40c1e`..`a7868e4`). www.fretfree.app 301s to the apex, and smoke checks both. The previous domain had only one user (the owner), so it was retired outright the same day, with no redirect. **Incident during the move:** for about 15–20 minutes production served an `index.html` that pointed to a deleted bundle. `deploy.sh`'s `s3 sync` skipped a same-size entry file whose bucket copy was newer, and the `--delete` pass then removed the bundle it referenced. Fixed in `a7868e4` (entry files are always copied).

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

- Live at https://fretfree.app. `scripts/smoke.sh` passes, and so does the Playwright `@smoke` suite against production on all four profiles.
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

## M1 definition of done (M1-24 QA, 2026-10-18)

**M1 is done.** Design §11: "A real learner can do daily sessions on iPad (landscape and portrait), offline, as an installed PWA. The iPhone smoke flow passes." Every M1 package is live, M1-29 (Add to Home Screen) included. The final pass ran on `origin/main` at 57c946d. Production served the same bundle.

The evidence is `app/e2e/m1-24.spec.ts`. It runs on all four Playwright profiles, both locally in `pnpm verify` and against https://fretfree.app (`E2E_BASE_URL=https://fretfree.app ../scripts/e2e-slot.sh playwright test e2e/m1-24.spec.ts`). It covers:
- **The first week**, on a mocked clock (Europe/London, starting Wednesday). Onboarding with a 5-minute goal, then sessions on three days in a row: the streak reaches 3, and the heatmap fills in each answered cell. On Thursday, Today's 2-minute warm-up reviews every due card, and the due count drops to 0. Answers are graded on real (quick) response times, so recall rates Good or Easy. On Friday, Settings switches to a 10-minute goal with the weekend amulet on. Monday opens with the streak still at 3 and no freeze held, and its 10-minute session takes the streak to 4.
- **Streak repair.** A missed weekday breaks a 2-day streak, and a double session the next day restores it to 3. Until now repair was only unit-tested.
- **A screen walk.** Every M1 screen (onboarding, Today before and after practice, a session prompt, the summary, Learn, Explore, Progress, Settings, About and Privacy) is checked for horizontal overflow. With `SCREENSHOTS=1` and `--grep @screens`, it also saves each screen in dark and light. This is on demand, not part of `pnpm verify`. The command is in the spec header.

| §11 scope or criterion | Status | Evidence |
|---|---|---|
| Onboarding: handedness, goals, daily goal, latency calibration | ✅ | `m1-06`, `m1-07`, `m1-26`, `m1-24` |
| F1–F3 and C2 through D1, D2 and D3 | ✅ | `d1-session`, `m1-04`, `m1-05`, `m1-27` |
| Full session loop (multi-drill, learning steps, time budget) | ✅ | `m1-17`, `m1-24` |
| Today (hero, quests, quick drills) | ✅ | `m1-11`, `m1-18`, `m2-10` |
| Progress heatmap | ✅ | `m1-14`, `m1-24` (fills in from real sessions) |
| Guide fading and blind mode | ✅ | `m1-15`, `m1-25` |
| Daily goal and XP | ✅ | `m1-10`, `m1-24` |
| Streak, freezes, weekend amulet, repair | ✅ | `m1-10` (freezes), `m1-24` (amulet, repair) |
| Session celebrations and first achievements | ✅ | `m1-12`, `m1-13` |
| Daily sessions on iPad landscape and portrait | ✅ | `m1-24` first week on `ipad-landscape`, `ipad-portrait` and `ipad-mini-landscape`, locally and on production |
| Offline | ✅ | `m1-19` (a full session offline; every section reopens offline) |
| Installed PWA | ✅ | the `pnpm lighthouse` installability, manifest and offline checks (all screens at 100 for accessibility, both themes); `m1-19` (install hint, standalone mode); M1-29 (an Add to Home Screen onboarding step and Today card) |
| iPhone smoke flow | ✅ | the `iphone-smoke` project (every `@smoke` spec, including the `m1-24` first week), locally and on production |

**Not verified:** installing on a physical iPad. The gate uses Chrome's installability check plus emulated WebKit. The design says reminders ship with sync (M7), so they aren't part of M1.

**Screenshot findings** (production, all four profiles). None of these blocks M1:
1. **Streak repair is invisible.** It works, but Today never says a double session would restore a broken streak, so learners can't know to try. Design §3.7 presents repair as something the learner does.
2. **Light theme, session neck:** the inactive frets (13–15 at regular-wide) get a pale grey wash, where the dark theme darkens them, so they read as highlighted rather than dimmed.
3. **The nut's string names** (E B G D A E) have low contrast on the wood in both themes, and are nearly invisible in light. Lighthouse passes because the neck is SVG.
4. **iPad portrait, Progress:** the mastery map's 12th fret is cut off at the right edge, label included.
5. **iPhone landscape:** the session summary's Done link sits below the fold. The page scrolls to it.

**Planner finding** (found while fixing the M1-24 review). `interleave` in `app/src/engine/session.ts` spaces reviews with `gap = floor(reviews / (blocks + 1))`. With fewer due reviews than new blocks + 1, the gap is 0 and every review goes after every new block, despite the doc comment's "short warm-up of reviews". In the first week, Thursday's 3 overdue learning cards were planned behind 3 new blocks (48 prompts). A 10-minute session at a minute per answer never reached them, and a learner who ends a session early skips their due reviews. Design §3.3 puts due reviews first (step 1), and says new items interleave with reviews after their block. A session "the learner can stop at any point" shouldn't hold its reviews back to the very end. The Today warm-up (review-only) isn't affected. Proposed fix: at least one warm-up review when any are due, and reviews spread among blocks with a minimum gap of 1.

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
- **DNS.** Besides the site's A/AAAA aliases, CDK creates only the ACM DNS-validation CNAMEs. No other records are touched.
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

**M7 accounts and sync (filed 2026-10-18; unblocked 2026-10-18 evening):**
1. ~~**New AWS services.**~~ **Answered (user, 2026-10-18 evening): "Approved: build the FretworkSync stack (Cognito, API/Lambda, DynamoDB)."** It sends through the existing FretworkEmail SES setup. Accounts stay optional (design §1 principle 8). M7 is unblocked.
2. ~~**Email sender.**~~ **Answered (2026-10-18, via the infra session):** `no-reply@fretfree.app` ("Fret Free"), from the separate `FretworkEmail` stack, which owns the fretfree.app SES identity, DKIM, MAIL FROM and DMARC. SES production access is granted in eu-west-1.
3. **Privacy.** Emails and progress would be stored in AWS us-east-1. Is a short privacy note on the About page enough, or do you want a separate privacy policy page? *Partly answered: the infra session is adding a `/privacy` page (linked from About and Settings), and M7-06 would extend it to cover sync.*

~~**DNS safety rule.**~~ **Answered (user, 2026-10-18 evening):** "fretfree.app and www.fretfree.app are the only DNS entries we need." SKILL §7 lists exactly those (plus their ACM validation records).

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
