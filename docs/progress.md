# Progress

## Current status

**Sixth shift report (2026-10-20 16:15 → 2026-10-21 handover, PM session guitar-nosync-14). 119 work packages done, 23 shipped this shift. Every package in flight was drained to production before the handover. Production = origin/main = the handoff docs commit after `61738133`.** The next PM starts on **M10**, the learning-path fixes (see below and `docs/handoff/08-pm-handoff.md`).

Shipped this shift:

- **Sound and Tools (user priorities):**
  - **M4-13:** sound on iPhone and iPad. The guitar voice is our own pluck renderer, with no AudioWorklet in the audio path, and audio unlocks inside the tap. Still to be confirmed on the user's real devices.
  - **M8-01:** the timing engine (tap-to-click calibration, metronome core). **M8-20:** the metronome in Tools.
- **Accounts and sync (M7):** **M7-02** the FretworkSync stack (Cognito, HTTP API with Lambda, DynamoDB) at `api.fretfree.app`; **M7-03** the sync API (push, pull, delete account); **M7-04** the sign-in UI.
- **Drills and skills:** I1 triad inversions (**M6-03**, D18) and voice leading (**M6-04**, D19); I2 7th-chord arpeggios (**M6-05**); I4/I5 minor harmony and function (**M6-06**, d-function); I6 ear training (**M4-07**, D14 "Hear it → identify"; **M4-08**, D15 "Hear it → find it" with its own `I6.ear-find` skill); I7 major scale in five positions (**M6-07**, on the pentatonic-box drill); F4 rhythm (**M6-08**, D20); D21 visualise (**M6-09**); the progression player (**M4-09**); notation (**M8-02** staff, **M8-03** theory).
- **Mic and quests:** **M5-07** mic quests and badges; **M5-08** the M5 QA walk (definition of done below).
- **Contracts and platform:**
  - **M1-43:** one file per item kind (`engine/items/`), which ended the `model.ts` conflicts between drills.
  - **M1-44:** first-load JS in one chunk, with theory split per declaration at build time: 249.2 → 238.8 KB on main (budget 250). The bundle check fails if first load splits again.
  - **M3-12:** the M3 QA. The e2e skill lists are now derived from the skill files (M6-06), so a new skill needs no hand edit in the e2e helpers.

**M10, the learning-path fixes (filed 2026-10-20).** A review session audited FretFree as a learning product (`docs/review/`); every finding was re-checked against main (`docs/handoff/08-review-verification.md`) and filed as M10-01 to M10-17. M10-01 to M10-06 are `Priority: high`: soft prerequisites per skill, the songs on-ramp, session lanes, concept intros, and teaching on a miss in D1, D3, D5 and D39. **The user delegated every curriculum decision to the PM** (see "Decisions and deviations").

Effective parallelism (556 samples): average 7.4 active workers, peak 11 (user-priority and unblocking WPs went over the ceiling), 13% of slots idle; the ceiling moved 6 → 8.

Incidents:

- **Stop the line, M7-02:** the first FretworkSync deploy failed one smoke check, a TLS name mismatch on `api.fretfree.app` while the new API custom domain propagated. A smoke re-run about 6 minutes later passed; nothing was reverted.
- **First-load budget:** M6-06 measured 251.9 KB against 250, and three more drills followed. Rather than raise the budget, the PM filed M1-44 (high), which won back 11 KB.
- **Batch verify failures (2):** two jsdom unit tests timed out under lane load (fixed in a51dd715), and a semantic clash between M4-07's tests and M4-08's new I6 skill (fixed in M4-08). The lane re-ran each batch one WP at a time, as designed.
- **Flaky tests fixed between ships:** `m3-13.spec.ts:141`, `m3-05.spec.ts:241` (`test.slow()`), `m5-02.spec.ts:94` (one render quantum of slack), `m8-20.spec.ts:96` (15 s).
- **Usage limit:** one pause, 17:46–18:40; every agent resumed by itself.

**Pipeline changes (2026-10-20, between the fifth and sixth PM shifts).** The user found delivery had stalled: 8 Playwright runs were queued on 2 slots, the load average sat at 45–80 on 10 cores, and a single load timeout (`page.evaluate` at 30 s) failed a 5-WP lane batch, which then re-ran every WP one at a time. Measured from the lane log: the whole matrix is 988 test runs (303 tests × 3 iPad projects + 65 phone smoke), about 1,700 s of test time per iPad project, 25–35 min wall under that load; unit tests 431 s. Each WP ran the whole matrix up to three times (report, preflight, lane). The fixes:

- **Only the lane runs the whole matrix.** `pnpm verify:quick` now has three levels: own specs (every project), `e2e:fast` (`ipad-landscape` + `iphone-smoke`, a third of the matrix) when the change reaches shared code or adds a drill, and `--full` on request. `--preflight` (after the post-review rebase) drops to own specs when `origin/main` hasn't moved since the worktree's last passing fast run.
- **The lane retries a failed test once** (`PW_RETRIES`, default 1 under `FRETWORK_LANE=1`), and `integrate.sh` appends tests that passed on retry to `.orchestrator/flaky.log` with a `flaky` event, so flakes get fixed instead of costing batches.
- **Unit tests run in node unless they need the DOM.** Vitest now has two projects: `.test.tsx` files get jsdom, `.test.ts` files run in node, and a `.ts` test that needs the DOM starts with `// @vitest-environment jsdom` (six did). Starting jsdom was 43% of a run; measured in the same worktree at 3 workers under the same load, `vitest run --coverage` went from 592 s to 194 s.
- The orchestrator skill, briefs and `CLAUDE.md` say so. The three-project iPad matrix itself was kept: layout assertions (overflow, bounding boxes, size-class branches) are spread through most specs, so the overlap was in how often the matrix ran, not in the specs.

**Fourth shift report (2026-10-19 07:55 → 2026-10-20 handover, PM session guitar-nosync-45). 96 work packages done, 19 shipped this shift. Every package in flight was drained to production before the handover. Production at https://fretfree.app is healthy: smoke passed after every ship.**

Shipped this shift:

- **Tools and the tuner (user priority):**
  - **M4-12:** a Tools section (sixth nav section, auto-registered tools).
  - **M5-02:** the AudioWorklet pitch detector.
  - **M5-03:** the tuner: string-aware flat/sharp guidance, reference tones, a mic check, and handling for a lost mic.
- **Audio and mic:**
  - **M4-06:** audio engine v2: guitar pluck voice, strums, progression playback, volume and silent mode.
  - **M5-06:** D17, plus a generic `requiresMic` gate and a fake-mic e2e hook.
  - **M5-05:** D16 "Play the note".
  - **M5-04:** mic onboarding and settings.
- **Drills:**
  - **M3-13:** D36 "What chord is this?".
  - **M3-14:** D37 chord tones across the neck.
  - **M3-15:** D38 build the chord.
  - **M3-17:** chord tones in stages (user request).
  - **M4-02:** D11 Roman numerals. It took three review rounds; the reviewers' guessing strategies are now unit tests.
  - **M4-03:** D12 progression builder.
  - **M4-04:** D13 capo calculator.
  - **M4-05:** I3 plus D40 "Key-signature cards" (user decision) and the circle of fifths.
  - **M6-02:** C7 pentatonic boxes.
- **Fixes:**
  - **M1-41:** D39's neck on iPad mini.
  - **M2-22:** D5's widest scope on iPad mini.
- **M1-42:** drill logic out of first-load JS. First-load fell from 261.3 to 233.5 KB, and the budget is back to 250 KB (it was raised to 280 temporarily; see Decisions).

**Pipeline changes this shift** (the user said rebasing and testing had slowed development to a crawl):

- **Test load is gated by machine-wide slots** (`scripts/cpu-slot.sh`, `e2e-slot.sh`, `slot-lib.sh`). The lane gets priority. The agent count no longer follows load1.
- **Workers run `pnpm verify:quick`.** It runs the static gates plus their own specs, or the full suite when shared code changes.
- **The lane ships batches**, one verify per batch, and bisects on failure. Its verify is the only full verify.
- **`Priority: high` in the backlog** brings work forward. It was used for the tuner path, M1-42 and M1-43.
- **New high-priority work filed:** M1-42 (done) and **M1-43**: one file per item kind, because every drill collided in `engine/model.ts`.
- **An experimental remote test runner** (`scripts/remote-run.sh`, user-provided box, unprivileged `ipc-freefret` account) is built but **off**: Playwright's WebKit crashes there under load. See `docs/handoff/06-pm-handoff.md`.

**Incidents:**

- **M1-41's first lane run** failed on timeouts caused by a reserved third e2e slot (since removed).
- **Flakes:** M5-06 (M2-14 on portrait) and M5-04 (M4-06's console-error check on iPad mini) failed in the lane, then passed 3/3 and 5/5 at the merge SHA, and were re-queued.
- **M4-02 hit the first-load budget** (250.5 KB). See Decisions.
- No stop-the-line events.

**Parallelism (740 samples):** average 7.6 in flight, peak 12, ceiling 5–8, idle slots 19% (mostly during the drain).

**Third shift, overnight report (2026-10-19, 04:10). 69 work packages live. 10 shipped since the 23:40 report. Production at https://fretfree.app is healthy: smoke passed after every ship.**

Shipped overnight:

- **User feedback:**
  - **M2-15:** retake the placement test from Settings. A retake uses the learner's refit FSRS weights and never lowers an existing card (deviation recorded below).
  - **M2-16:** "Already know this? Test out" on a locked module. Weak existing cards are probed first and must be fluent; "Test out again" retries what's left (deviation recorded below).
- **From the M2 QA:**
  - **M2-17:** near-tie due reviews interleave across skills and drills.
  - **M2-18:** drills can supply their own context panel; D4 shows octave shapes.
  - **M2-19:** a Progress "Topics" panel; the tile is now "Items in rotation".
  - **M2-20:** D5/D6 stack as one column on iPad portrait.
  - **M1-38:** clearer Learn prerequisites (with list semantics for VoiceOver) and summary tiles.
  - **M1-40:** D1/D2 stack from the top on iPad portrait.
- **M1-39:** the dev unlock applies in Explore's "Quiz me"; LAN testing documented in the README.
- **M3-04:** D8 "Find the chord tone in a shape", the first chord-lesson drill. Its tone skills are kept out of onboarding placement to fit the time budget.

In flight: M2-21 (every drill's help panel on `contextPanel`; in the lane), M3-08 (CAGED visualiser), M3-06 (D10).

**New work filed overnight:**

- **M3-16 (high priority):** lazy-load Explore views. First-load JS is about 245 KB of the 250 KB budget. M3-09 now waits for it.
- **M3-17:** chord tones in stages (root → 3rd → 5th → 7th), matching the original chord-lesson request.
- **M2-22:** D5 at its widest scope on iPad mini.
- **M1-41:** D39's neck clears the feedback bar on iPad mini.

**Parallelism (301 samples, 23:40–04:10):** average 3.6 in flight, peak 5. The ceiling ran 1–4, held down by load from concurrent verifies.

**Incidents:** no stop-the-line events and no usage-limit pauses. Two lane verify failures, neither caused by the WP being shipped:

- **M2-19:** M2-03's D4 spec waited 5 s for a prompt under load. The spec now opens a session focused on the seeded item and waits for it to start.
- **M2-16:** an M2-09 assertion expected one probe per _drill_, which random drill choice breaks about once in a thousand runs; it now asserts coverage per _topic_. Also a session-start race in M1-30's spec.

The session-start race (a spec stepping the fake clock before the runner has started) also hit M1-24. It is now fixed once in the shared `focusSession` helper, which waits for "Preparing your session…" to clear.

**Process fixes:**

- **Branch base:** `spawn.sh` cut new branches from local `main`, which the lane temporarily fast-forwards to a WP's unshipped commits. Two branches inherited M2-16's old commits, including its backlog done-marker. The reviewer caught it, both were rebased, and branches now come from `origin/main`.
- **Retake and test-out deviations:** recorded below under "Decisions and deviations".

---

**Third shift, second report (2026-10-18, 23:40). 59 work packages live. 10 shipped since the 20:15 report. Production at https://fretfree.app is healthy: smoke passed after every ship.**

Shipped since 20:15:

- **User feedback:**
  - **M1-34:** Learn rings show learning and stable separately. The centre number is always captioned.
  - **M1-35:** the session summary shows learning and stable, keeps "come back tomorrow" primary, and scopes the review forecast to today's items.
  - **M1-37:** hotfix, built by another session at the user's request. Adds D39 "Fret landmarks", so the F3 lessons no longer open to an empty session, plus an empty-lesson guard and a registry rule tying pending drills to open WPs.
  - **M1-36:** a dev-build-only "unlock every skill" switch that never touches real progress.
- **M1 QA follow-ups:**
  - **M1-30:** a visible streak-repair card.
  - **M1-31:** fretboard contrast in the light theme and for the nut labels.
  - **M1-32:** the iPad-portrait mastery map no longer clips fret 12.
  - **M1-33:** the summary's Done stays on screen on phones held sideways.
- **M7-01:** the sync model and merge rules, the first M7 package. Stable IDs for legacy rows, so syncing can't duplicate history. Schema v2 with change tracking. The protocol in `docs/design/sync.md`, with atomic sequencing and consistent pulls.
- **M2-14:** the **M2 milestone QA**. M2's definition of done is checked off below.

**User decisions this evening:** M7 approved (the FretworkSync stack: Cognito, HTTP API with Lambda, DynamoDB). The DNS names are confirmed as only fretfree.app and www.fretfree.app. The M1 definition-of-done table was corrected: F3 wasn't actually served until M1-37.

**New work filed:** M1-38 (copy polish), M1-39 (dev unlock in Explore, plus LAN testing docs), and M2-17 to M2-20 from the M2 QA (interleaving near-tie reviews, per-drill context panels starting with D4, Progress for interval and octave work, D5/D6 iPad-portrait layout). In flight: M2-17.

**Parallelism (251 samples, 20:15–23:40):** average 2.8 in flight, peak 4. The ceiling ran 1–3, held down by load from verifies (load1 3–60).

**Incidents:** no stop-the-line events and no usage-limit pauses. One lane verify failure (M1-36) was a race that was already in the M1-24 first-week spec. It moved the mocked clock before the session had started, so under load one minute went uncounted, right at the 10-minute goal edge. The spec now waits for the first prompt (fixed inside M1-36). Reviews caught several issues before they shipped: sync IDs that would have duplicated history across devices, a database upgrade that would abort on a corrupt date, a mis-scoped CSS block and missing keyboard and screen-reader access in D39, and copy that implied skipping days was fine.

**Process:** the PM now keeps durable notes in `.orchestrator/pm-notes.md` and relies on auto-compaction overnight (SKILL §0 and §9). Other sessions hand work to the PM as branches, and M1-37 went through review and the lane as an out-of-band WP.

---

**Third shift, first report (2026-10-18, 20:15). 49 work packages live. 9 shipped this shift, plus the infra session's domain retirement and new pages. Production at https://fretfree.app is healthy: smoke passed after every ship.**

Shipped this shift: M2-09 (placement test), **M1-28** (hotfix, user-reported: feedback and Continue always on screen), M3-02 (C4 key spelling + D7 "Spell it"), **M1-29** (user request: "Add to Home Screen" onboarding step and Today card), M3-03 (C5 chord-construction skills), M3-07 (chord-diagram component), M1-24 (**M1 milestone QA**: a first-week e2e on a mocked clock, a streak-repair e2e, and a 96-shot screenshot pass on production; the M1 definition of done is checked off below) and M3-05 (C6 CAGED skills + D9 "Build the shape at a root"). From the infra session: **guitar.dwellsee.com retired** (alias, certificate SAN and records removed; the certificate was replaced), Settings as its own `/settings` page, and a new `/privacy` page.

In flight: **M1-34** (user feedback: after a full first day every Learn ring read 0%, because the ring counts only items stable for 7+ days). It is approved and in pre-flight. PM decision from its review: the ring's centre shows the _learning_ share with a visible "learning" caption, switching to the stable share once anything is stable, so a glance never reads learning as done.

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

| Milestone | Live                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | M1-03 (F1/F3 skills, bidirectional F2/C2), M1-04 (D2 find the note), M1-05 (D3 note wheel), M1-06 (onboarding shell), M1-07 (latency calibration), M1-08 (XP engine), M1-09, M1-10 (session ↔ gamification bridge), M1-11, M1-12 (session celebrations), M1-13, M1-14 (Progress heatmap), M1-16 (Learn screen), M1-19 (PWA, offline, bundle budget, Lighthouse gate), **M1-25 (hotfix: recall prompts showed their answer)**, **M1-26 (reading question: "can read" / "want to learn")** |
| M2        | M2-01 (interval and octave theory)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M3        | M3-01 (chord and scale theory)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| M4        | M4-01 (harmony theory)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M5        | M5-01 (mic pitch-source contract)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M6        | M6-01 (intermediate contract)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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

| §11 scope or criterion                                         | Status | Evidence                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding: handedness, goals, daily goal, latency calibration | ✅     | `m1-06`, `m1-07`, `m1-26`, `m1-24`                                                                                                                                                                                           |
| F1, F2 and C2 through D1, D2 and D3                            | ✅     | `d1-session`, `m1-04`, `m1-05`, `m1-27`                                                                                                                                                                                      |
| F3 (fret markers, the 12th-fret repeat)                        | ❌     | Corrected 2026-10-18: no drill served F3, so its lessons opened to an empty "Session complete". Fixed by M1-37 (D39).                                                                                                        |
| Full session loop (multi-drill, learning steps, time budget)   | ✅     | `m1-17`, `m1-24`                                                                                                                                                                                                             |
| Today (hero, quests, quick drills)                             | ✅     | `m1-11`, `m1-18`, `m2-10`                                                                                                                                                                                                    |
| Progress heatmap                                               | ✅     | `m1-14`, `m1-24` (fills in from real sessions)                                                                                                                                                                               |
| Guide fading and blind mode                                    | ✅     | `m1-15`, `m1-25`                                                                                                                                                                                                             |
| Daily goal and XP                                              | ✅     | `m1-10`, `m1-24`                                                                                                                                                                                                             |
| Streak, freezes, weekend amulet, repair                        | ✅     | `m1-10` (freezes), `m1-24` (amulet, repair)                                                                                                                                                                                  |
| Session celebrations and first achievements                    | ✅     | `m1-12`, `m1-13`                                                                                                                                                                                                             |
| Daily sessions on iPad landscape and portrait                  | ✅     | `m1-24` first week on `ipad-landscape`, `ipad-portrait` and `ipad-mini-landscape`, locally and on production                                                                                                                 |
| Offline                                                        | ✅     | `m1-19` (a full session offline; every section reopens offline)                                                                                                                                                              |
| Installed PWA                                                  | ✅     | the `pnpm lighthouse` installability, manifest and offline checks (all screens at 100 for accessibility, both themes); `m1-19` (install hint, standalone mode); M1-29 (an Add to Home Screen onboarding step and Today card) |
| iPhone smoke flow                                              | ✅     | the `iphone-smoke` project (every `@smoke` spec, including the `m1-24` first week), locally and on production                                                                                                                |

**Not verified:** installing on a physical iPad. The gate uses Chrome's installability check plus emulated WebKit. The design says reminders ship with sync (M7), so they aren't part of M1.

**Screenshot findings** (production, all four profiles). None of these blocks M1:

1. **Streak repair is invisible.** It works, but Today never says a double session would restore a broken streak, so learners can't know to try. Design §3.7 presents repair as something the learner does.
2. **Light theme, session neck:** the inactive frets (13–15 at regular-wide) get a pale grey wash, where the dark theme darkens them, so they read as highlighted rather than dimmed.
3. **The nut's string names** (E B G D A E) have low contrast on the wood in both themes, and are nearly invisible in light. Lighthouse passes because the neck is SVG.
4. **iPad portrait, Progress:** the mastery map's 12th fret is cut off at the right edge, label included.
5. **iPhone landscape:** the session summary's Done link sits below the fold. The page scrolls to it.

**Planner finding** (found while fixing the M1-24 review). `interleave` in `app/src/engine/session.ts` spaces reviews with `gap = floor(reviews / (blocks + 1))`. With fewer due reviews than new blocks + 1, the gap is 0 and every review goes after every new block, despite the doc comment's "short warm-up of reviews". In the first week, Thursday's 3 overdue learning cards were planned behind 3 new blocks (48 prompts). A 10-minute session at a minute per answer never reached them, and a learner who ends a session early skips their due reviews. Design §3.3 puts due reviews first (step 1), and says new items interleave with reviews after their block. A session "the learner can stop at any point" shouldn't hold its reviews back to the very end. The Today warm-up (review-only) isn't affected. Proposed fix: at least one warm-up review when any are due, and reviews spread among blocks with a minimum gap of 1.

## M2 definition of done (M2-14 QA, 2026-10-18)

**M2 is done for its §11 scope.** Design §11 gives M2 no separate definition of done, so this checks its scope: "C1, C3 via D4–D6, G–B shift content, confusable pairing, placement test". Every package M2-01 to M2-13 is live. The final pass ran on `origin/main` at e166173, and production served the same bundle (`index-PSh1y10I.js`). M1-37 (D39 fret landmarks and the empty-lesson guard) and M1-34/35 (learning vs stable) landed earlier today, so a fresh learner's first sessions now include F3 before C1 and C3 open.

The evidence is `app/e2e/m2-14.spec.ts`. It runs on all four Playwright profiles, both locally in `pnpm verify` and against https://fretfree.app (`E2E_BASE_URL=https://fretfree.app pnpm e2e:only e2e/m2-14.spec.ts`, run from `app/`; 11 of 11 passed). It covers:

- **A cross-drill session.** Seven due reviews (single octaves with and without the G–B shift, "tap every G", D5 names and D6 taps) run in one session focused on the M2 skills. All three drills serve their own items, mixed in FSRS order rather than grouped by drill, and each item is logged once, under the right drill. On the phone the "every G" item runs region by region. Today's due count then drops to 0.
- **A G–B shift slip across drills.** On iPad, a D6 major 3rd from G to B tapped one fret short is named as the G–B slip. It comes back three prompts later, after D4 and D5 prompts, and is then right. The logs read `[false, true]` for that item.
- **A screen walk.** It covers the placement test (intro and first probe), Today with its quests, the Whole neck and Intervals modules with their worked examples, Explore's G7 chord view, the first prompt of each M2 drill, the summary and Progress. Each screen is checked for horizontal overflow. With `SCREENSHOTS=1` and `--grep @screens`, the walk also saves each screen in dark and light: 104 shots from production, on all four profiles. The command is in the spec header.

| §11 scope                                                          | Status     | Evidence                                                                                                                                   |
| ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 octave skills (shapes, G–B shift, double octaves, every octave) | ✅         | `c1.test.ts`, `c1-every-octave.test.ts`; `m2-03`, `m2-14`                                                                                  |
| C3 interval-shape skills (3rds to 7ths, G–B shift items)           | ✅         | `c3.test.ts`; `m2-05`, `m2-06`, `m2-14`                                                                                                    |
| D4 octave finder: whole neck on iPad, region by region on compact  | ✅         | `m2-03` (≥44pt cells, per-target feedback, a phone in portrait), `m2-14` (all four profiles)                                               |
| D5 names the interval from two dots                                | ✅         | `m2-05` (distractors by scope, a legend that fades), `m2-14`                                                                               |
| D6 taps the interval from a root                                   | ✅         | `m2-06` (any right position once widened), `m2-14`                                                                                         |
| G–B shift content                                                  | ✅         | `m2-07` (worked → faded → independent; C1, C2 and C3 G–B examples), `m2-03` and `m2-06` (the slip is named), `m2-14` (the slip comes back) |
| Confusable pairing (seed and learned, with decay)                  | ✅         | `confusions.test.ts`, `session.test.ts` (unit). No e2e: pairing moves a review at most 2 slots                                             |
| Placement test                                                     | ✅         | `m2-09` (F1, F2, C2 and C3 probes, known items seeded at ≈10 days, skippable), `m2-14` (screens)                                           |
| Also in M2: quests, focused sessions, Explore v2, FSRS refit       | ✅         | `m2-10`, `m2-11`, `m2-12`, `refit.test.ts`                                                                                                 |
| Retake the placement test from Settings                            | ⏳ pending | **M2-15** (filed today from user feedback, not built)                                                                                      |
| "Test out" of a locked module                                      | ⏳ pending | **M2-16** (filed today from user feedback, not built)                                                                                      |

**Not covered by placement:** C1 isn't in `placement.topics` (design §3.4 lists F1, F2, C2, C3, C5 and C8), so an experienced player meets octave shapes as new items. C1 is soft-unlocked, so this costs time but never blocks. M2-16 already adds C4.

**Findings** (from the QA run and the production screenshots). None blocks M2:

1. **Placement-seeded reviews come back grouped by drill (research/02 rule 6).** `dueReviews` in `app/src/engine/session.ts` orders reviews by retrievability, then by item ID. `save.ts` seeds every known item with the same `now` and stability, so all of them reach the same retrievability. Ten days after a placement test, the first review session is sorted by item ID: every `find:` (D2), then every `interval-name:` (D5), every `interval:` (D6), `letter:`, `note@` and `step:`. That is fully blocked, by drill and by skill. The cross-drill e2e reproduced this: seven reviews with the same history came out in three blocks. Learned confusions can't fix it, because pairing moves a review at most 2 slots. Proposed fix: break near-ties (say, retrievability within 0.02) with a round-robin over skill or drill, or a shuffle seeded from the session `rng`, rather than by item ID.
2. **D4 shows the wrong help panel.** D4 has no context panel of its own, so its sessions fall back to the generic "Musical alphabet" panel (`SessionScreen.tsx`). D5 and D6 show interval legends and the G–B tip. D4 should show octave shapes: 2 strings up, 2 frets higher, or 3 across the G–B pair, plus the double octave.
3. **Learn: a run-on prerequisite list.** A locked skill reads "It joins your sessions once you're practising Half steps: sharps and flats and Whole steps and Octave shapes" (C3.thirds). The skill titles have their own colons and "and"s, so the list needs commas, or one item per line.
4. **iPad portrait, D5 and D6:** the neck is centred in a tall empty band, with the help panel pinned at the very bottom, away from the prompt. Nothing is cut off or overlaps. Cosmetic.
5. **The summary after a review-only session** reads "Learning 7 · Became stable 7" for 7 items. That is by design (M1-35: learning includes stable), but side by side the tiles can read as 14 items. Consider "7 learning (7 stable)" or hiding Learning when it equals Became stable.

6. **Progress has nothing to show for M2.** After a session of octave and interval reviews, the mastery map is still blank: it maps note cells only. The retention forecast still says "Practise a session and you'll see…", and the stats tile says "Notes in rotation: 7" although none of the 7 is a note (`panels/stats.tsx` counts every card). Proposed: label the tile "Items in rotation", and add a per-topic view (C1 and C3 skills with their learning and stable shares, as on Learn) so octave and interval work is visible on Progress.

The production screenshots also confirm the M1 QA fixes: inactive frets recede in light theme and the nut's string names are legible (M1-31), the iPad-portrait mastery map shows fret 12 (M1-32), and Done stays in view on a sideways phone's summary (M1-33).

## M3 definition of done (M3-12 QA, 2026-10-20)

**M3 is done for its §11 scope.** Design §11 gives M3 no separate definition of done, so this checks its scope: "C4, C5, C6 via D7–D10, Explore (CAGED visualiser, chord finder), worked examples". Every M3 package (M3-01 to M3-18) is live, including D36–D38 and the staged chord tones (M3-17), which came from user requests. The pass ran on `origin/main` at f28b252, and production served `index-oxSeeCam.js`.

The evidence is `app/e2e/m3-12.spec.ts`. Its screen walk is tagged `@smoke`, so it runs on all four Playwright profiles, both locally and against https://fretfree.app (4 of 4 passed on production). The walk opens:

- the Keys, Chords and CAGED modules, with five C4–C6 worked examples;
- the CAGED visualiser (C, then G's chain) and the chord finder (tapped C7, then F#m7's voicings);
- the first prompt of D7 (key and chord), D8, D9, D36, D37 and D38, each with its context panel;
- a D10 answer and its feedback, then the summary and Progress.

Each screen is checked for horizontal overflow. With `SCREENSHOTS=1` and `--grep @screens`, the walk also saves each screen in dark and light: 184 shots from production. The command is in the spec header. A second test aborts the CAGED chunk and checks that Explore's Reload button is a full 44pt tap target. It was 28px tall; fixed in this package, from the M3-16 review.

| §11 scope                                                                            | Status | Evidence                                            |
| ------------------------------------------------------------------------------------ | ------ | --------------------------------------------------- |
| C4 key spelling and scale degrees through D7 (enharmonics enforced)                  | ✅     | `c4.test.ts`; `m3-02`, `m3-12`                      |
| C5 chord construction, triads → 7ths → sus/add, with the 7 vs maj7 pairing           | ✅     | `c5.test.ts`; `m3-03`, `m3-12`                      |
| D8 chord tones in a shape, root first, both directions                               | ✅     | `c5-chord-tones.test.ts`; `m3-04`, `m3-17`, `m3-12` |
| C6 CAGED through D9 (triad cores first, whole neck on iPad) and D10                  | ✅     | `c6.test.ts`; `m3-05`, `m3-06`, `m3-12`             |
| Also in M3: D36 name the chord, D37 chord tones across the neck, D38 build the chord | ✅     | `m3-13`, `m3-14`, `m3-15`, `m3-12`                  |
| Chord-diagram component and drill context panels                                     | ✅     | `ChordDiagram.test.tsx`; `m3-09`, `m3-11`, `m3-12`  |
| Explore: CAGED visualiser (respects reduced motion, Quiz me)                         | ✅     | `m3-08`, `m3-12`                                    |
| Explore: chord finder (`Chord.detect`, voicings from MIT chords-db)                  | ✅     | `m3-09`, `m3-12`                                    |
| Worked examples for C4–C6 ("CAGED is a map", "find the root first")                  | ✅     | `m3-10`, `m3-12` (but see finding 1)                |
| Explore views and drill views lazy, first-load JS ≤ 250 KB                           | ✅     | `m3-16`, `m3-18`, M1-42; `scripts/check-bundle.mjs` |

**Findings** (production screenshots, four profiles). None blocks M3; 1 and 2 are the ones to fix first:

1. **"Find the root first" cuts off the note it asks for, on iPad portrait and iPad mini.** The Learn card shows frets 1–5 of the example's 1–7 window. The C# on fret 6 ("Tap the highlighted C# to go on") is off the card, along with the right edge of the shape outline. It's fine on iPad landscape. Every worked-example neck also runs to the card's right edge with no padding: on iPad mini, C5's seventh-shapes example clips its "8" fret label, and the CAGED example clips a marker.
2. **Guided prompts lose the degree shapes.** On a first-exposure prompt, D8, D9, D37 and D38 draw every chord tone as the same blue circle, labelled R, 3 or 5. The context panel's legend on the same screen draws the root as a square and the 5th as a triangle. D9 says "The square is the root", yet its second root is a circle. Feedback and D36 use the shapes correctly. This breaks the "shape as well as colour" rule (CLAUDE.md, design §8).
3. **D10 and D36 show the generic "Musical alphabet" panel** (they declare no `contextPanel`). M3-11 rightly keeps the CAGED chain away from D10, since it would give the answer away, but the alphabet is noise there. D36 could show the triad formulas and the rule that the 3rd decides the quality, without naming the chord.
4. **D36 on iPad mini scrolls.** The 12 root chips wrap 10 + 2 and the 8 qualities 7 + 1. That pushes the neck's bottom string to the fold, and its fret numbers below it (a 910pt page on a 768pt screen). D38 there scrolls through about 93pt of empty padding. On iPad Pro landscape, D36 and D38 scroll by 17–38pt.
5. **iPad portrait: D9, D37 and D38 centre the neck in a tall empty band.** The context panel is pinned at the bottom. This is the same pattern M2-20 fixed for D5 and D6.
6. **D10 at guide level 1** shows no fret numbers or string names. Its 5ths are drawn as circles, the same as the 3rd, until feedback turns them into triangles. Yet the explanation talks about frets and "back toward the nut". On a sideways phone the explanation doesn't appear at all, only the bar's "That was the A shape of A".
7. **Copy:**
   - D9 and D10: "Both root on string 5" should read "Both have the root on string 5". D9's wrong-shape explanation (`d9-build-caged/logic.ts`) builds the same sentence as D10's, and both drills' logic tests pin it, so fix them together.
   - The summary says "Those notes come back sooner" after a chord or CAGED session; it should say "items". It also says "come back tomorrow" twice.
   - The "Already know this? Test out" offer runs skill titles together: "a short test of Interval shapes: 3rds, Interval shapes: 4ths, 5ths and the tritone, Spell the sharp keys and Spell the flat keys". M1-38 fixed the prerequisite list, but not this sentence.
   - D7 and D37 repeat their hint word for word under the prompt and in the panel.
8. **D7's note picker has holes.** Spelling-only distractors (C♭, B♯) sit alone in their columns, so the grid looks like it's missing buttons.
9. **Small panel diagrams.** The context-panel chord diagrams (D8) and the CAGED-chain mini-map (D9) are about 75pt wide, with about 5pt labels. In light theme the mini-map's yellow 5th triangles nearly vanish on its white neck.
10. **Sideways phone (best effort):** the CAGED visualiser's neck sits below the fold under its controls. The pinned feedback bar covers the session header (✕ and help) until Continue.

**Not findings:** the walk's seeding masters the F2 skills, so "String 6 master" and "String 5 master" unlock on Progress, and the seeded CAGED reviews count as learning there while the summary says 0. The yellow 5th triangles are `--chord-fifth` (Okabe–Ito #f0e442), not the sunflower brand colour.

## M5 definition of done (M5-08 QA, 2026-10-20)

**M5 is done for its §11 scope, in software. Real-guitar tuning is still open.** Design §11 gives M5 no separate definition of done, so this checks its scope: "Tuner, D16 and D17, mic onboarding". Every M5 package (M5-01 to M5-07) is live. The pass ran on `origin/main` at e17426d, and production served `index-iGD_NodS.js`. Everything here was checked with a fake mic: a fake pitch source, or a sine wave fed to the shipped worklet. No real guitar or real iPad microphone was used. The hardware checks are listed after the table.

The evidence is `app/e2e/m5-08.spec.ts`. Its four walks are tagged `@smoke`, so they run on all four Playwright profiles, both locally and against https://fretfree.app (16 of 16 passed on production). The walks cover:

- **Mic setup:** the welcome screen, then the onboarding mic step. Here a 110 Hz sine runs through the shipped pitch worklet ("Mic is working. Heard A2."), and the same check runs again from Settings.
- **The tuner:** the Tools list, then the tuner idle, flat (A2 −18 cents) and in tune (E2 +2).
- **A refused mic:** the explanations on the onboarding step and in the tuner.
- **The mic drills:**
  - a day whose quests include "Play 3 answers on your guitar";
  - D16's prompt, listening state and wrong-note feedback;
  - D17's G major scale: the prompt, a partial run, and a wrong third note;
  - the quest at 2 of 3 on Today, then Progress and its achievements.

Each screen is checked for horizontal overflow. With `SCREENSHOTS=1` and `--grep @screens`, the walks also save each screen in dark and light: 168 shots from production. The command is in the spec header. Four reviewers went through the shots, one per profile, and I checked the main findings myself.

| §11 scope                                                                                                                                  | Status     | Evidence                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Pitch input: `PitchSource` contract, notes stable for ≥80ms, a fake source                                                                 | ✅         | `mic/index.test.ts` (glitches, dropouts, serialised starts, `lost`)                                                  |
| AudioWorklet detector (pitchy); the mic is asked for only on the learner's tap                                                             | ✅         | `detector.test.ts` (synthetic signals, octave errors, start timeout); `m5-02`                                        |
| Tuner, which doubles as the mic check (§7 Tools, §9)                                                                                       | ✅         | `tuner/logic.test.ts`, `Tuner.test.tsx`; `m5-03`, `m5-08`                                                            |
| Mic onboarding step and Settings card                                                                                                      | ✅         | `mic.test.tsx`; `m5-04`, `m5-08` (but see findings 6 and 7)                                                          |
| D16 "Play the note": any position, region, or pitch class                                                                                  | ✅         | `d16-play-note/*.test.ts*`; `m5-05`, `m5-08` (but see findings 1, 2 and 4)                                           |
| D17 "Play the interval, arpeggio or scale"                                                                                                 | ✅         | `d17-play-sequence/*.test.ts*`; `m5-06`, `m5-08` (but see finding 3)                                                 |
| Mic drills served only in mic mode (`requiresMic`)                                                                                         | ✅         | `drill-picker` tests; `m5-05`, `m5-06` ("never served without mic mode")                                             |
| Mic quest: counts tries on due cards, right or wrong (not give-ups), target 3, paid once a day. Mic badges: earned by accuracy, not volume | ✅         | `try-mic.test.ts`, `achievements/mic-drills.test.ts`; `m5-07` ("many answers at low accuracy earn nothing"), `m5-08` |
| Tuned against a real guitar and a real iPad mic                                                                                            | ⏳ pending | Needs the user's hardware; see below                                                                                 |
| I2 arpeggios in D17                                                                                                                        | ⏳ pending | No I2 skill yet (M6)                                                                                                 |

**Checks the brief asked for:**

- **D17 "Show me" against the mic quest: fixed.** Commit 8a866bc leaves give-ups out (`isGiveUp`), and `m5-07`'s "a D17 'Show me' … doesn't move the quest" tests it.
- **Toggling mic mode mid-day: still open, but bounded.** The day's draw isn't stored. `drawQuests` re-runs whenever `settings.micEnabled` changes, so `try-mic` joins or leaves and displaces at most one other quest. That quest's progress vanishes from Today while mic mode is on. `completeQuests` pays each quest id once per day. The only setting-dependent template is `try-mic`, so toggling exposes at most one extra bonus: 4 bonuses a day, not 3. Getting the 4th means either playing 3 answers into the mic, or completing the displaced quest after switching mic mode off. A 15 XP ceiling can't be farmed by repeating it. The `QuestSnapshot` comment now states this correctly. Freezing each day's draw in `dailyProgress` (an M5-07 follow-up) would close it.
- **"8 quick questions… under 3 minutes": not true for everyone.** Without the install step there are 8 steps. Three of them aren't quick questions:
  - calibration: 16 lit dots, about 20 s;
  - the mic check;
  - the placement test, which on its own has a 3-minute budget (`placement.budgetMs` 180 000).

  A beginner who skips placement finishes in well under 3 minutes. A player who takes the test needs about 4. The same sentence also says "change them later in **Progress**"; it should say Settings (the M5-04 follow-up, `OnboardingFlow.tsx`).

- **Cross-drill audio: still open.** D16 and D17 each ignore only their own miss playback (`quiet()`, `d17Accepts`). Another drill's multi-note feedback that is still sounding when a mic prompt appears can be heard as an answer. The fix proposed in M5-06 still applies: a shared "audio busy until" signal from `audio/audio.ts`.

**Still to check on a real iPad and guitar.** These are all fake-tested only, and they are for the user's device pass:

- `micLatencyMs` (150) and `playAllowanceMs` (1000) against real response times;
- the `minRms` gate (0.002);
- octave forgiveness. Pitch-class mode forgives an octave and region mode doesn't. At D17 scope 1, the first wrong note ends the attempt, so a brushed string grades Again at once, which may feel punitive;
- the "Still hearing… Mute the strings" prompt as the string decays;
- iOS's sample-rate quirk;
- backgrounding: the app should go to `lost`, then Try again should work;
- on iPhone, whether an open mic routes the tuner's reference tones to the earpiece.

**Findings** (production screenshots, four profiles, plus code reading). None blocks M5. Fix 1–3 first:

1. **D16's feedback hides its own answer on iPad Pro landscape and iPad mini.** D16's view is taller than the screen: the page is 933pt on an 834pt iPad Pro and 851pt on a 768pt mini, with empty space under the neck. D16 draws about 77pt per string, against about 65pt in D17. When a miss is shown, the fixed feedback bar sits right over string 6. That cuts the green A circle at fret 5, the vermillion B diamond at fret 7 and the string's label in half, and those markers are the whole "right against wrong" feedback. Fit the D16 neck to the screen, as D17 does, and keep the answer markers above the bar. D17 also scrolls on the mini (775–811pt).
2. **The light-theme root marker fails contrast on every neck.** The neck tokens have no light values (`tokens.css`), so the wood stays dark brown. `--root` does switch to `#965800` in light mode, and the fretboard fills root markers with it (`Fretboard.module.css:96`). On the wood that is about 2:1, and the dark label on the fill is about 2.8:1, which fails WCAG AA. D17's root square shows it clearly (09/09c light). This isn't specific to M5: every root marker in light theme is affected. Give neck markers their own token that doesn't change with the theme. It stays Okabe–Ito orange, not the brand colour.
3. **D17's feedback doesn't show the wrong note against the right one.** After G, A, A♯, slot 3 shows "✗ A♯" but never the B that was due. The neck draws the whole G major fingering in green, with no marker for the A♯ played and nothing to set the missed B apart. The explanation text does say "After A comes B". D16 gets this right: a diamond for the note played and a circle for the target. D17 should mark the missed degree on the neck and in its slot.
4. **D16 contradicts itself, and has no way out when the mic fails.**
   - In pitch-class mode (scope 0), the prompt says "Play A on string 6" and then "Any A counts, in any octave". The mic can't tell which string was played, so the prompt shouldn't name one in that mode (or should say "for example on string 6").
   - D16 has no "Show me" or skip. If the mic is refused, lost or unsupported, only "Try again" shows; for `unsupported`, nothing does. A learner with mic mode on whose permission was revoked is stuck on every D16 item until they quit the session. D17 offers "Show me". D16 should too, and it should also give design §10 a keyboard path.
   - The mic stops whenever a D16 or D17 view unmounts, so a mixed session asks for "Start listening" each time a mic drill comes back. A mic owned by the session while mic mode is on would fix it (M5-06 follow-up).
5. **"That was A." reads as what the learner played.** The wrong-answer bar for both mic drills says "That was A. You'll see it again shortly." right after "You played B2". D17 says "That was G A B C D E F♯ G", which repeats the explanation line above it. In a play drill, "The answer was A" would be clearer.
6. **Mic copy disagrees across screens:**
   - **Refusal help:** onboarding says "Settings › Apps › Safari › Microphone (on an iPad)", which is wrong on an iPhone. The tuner says "the page settings button in the address bar, then Website Settings". `MIC_ERROR_COPY` (onboarding), D16, D17 and the tuner each have their own error strings, such as "can't listen for pitch / for notes / to your guitar". One shared copy module would fix it (the M5-04 follow-up).
   - **Privacy line:** D16 says "listens through the microphone and records nothing", above its button. D17 says "listens through the mic; nothing is recorded or sent", below its button.
   - **Apostrophes:** straight and curly are mixed ("You'll", "won't" and "today's" against "can’t").
7. **Settings and onboarding mic controls are cramped.**
   - In the Settings mic card, "Open the tuner" touches "Check the microphone" (or "Stop listening") with about 1pt between them. On the mini both wrap to two lines.
   - On the mini, the Daily goal select is truncated ("Regular: 10 minutes a").
   - The onboarding mic step shows "Not now", "Skip this step" and "Skip setup" at once, and the first two do the same thing.
8. **D16 and D17 show the generic "Musical alphabet" panel.** Neither drill declares a `contextPanel`, the same pattern as M3 finding 3. D16 could show the note's positions per string. D17 could show the interval or scale formula without giving away the next note.
9. **Phone (best effort):** the tuner's note and cents readout sits below the fold under the needle, and on a sideways phone the reading is the main thing a learner needs. On Today, the page itself scrolls past the tab bar (1737px captures).

**Not findings:** the walk seeds one review the day before and a month-old D7 history, so Today's "Due reviews" tile and Progress's counts reflect that seeding. The mastery map's yellow "90 days or more" band is a Progress legend colour, not the sunflower brand colour on a drill's neck. The 12th-fret double inlay and string letters on session necks, against a single inlay and string numbers on the mastery map, are long-standing differences between the two components.

## M6 definition of done (M6-10 QA, 2026-10-21)

**M6 is done for its §11 scope, with two cuts and one open product call.** Design §11 gives M6 no separate definition of done, so this checks its scope: "C7, I1, I2, I4, I5, I7, D18–D21, rhythm track". Every M6 package (M6-01 to M6-09) is live. The pass ran on `origin/main` at eadbe1cf, and production served `index-DxzG9-Pb.js`. First-load JS is 245.2 KB of the 250 KB budget, so M1-44's headroom has held through four more M6 drills.

The evidence is `app/e2e/m6-10.spec.ts`. Its screen walk is tagged `@smoke`, so it runs on all four Playwright profiles, both locally and against https://fretfree.app (4 of 4 passed on production). The walk opens:

- the six Learn modules M6 fills (Pentatonic, Triads, Arpeggios, Minor and function, Scales, Rhythm), for a new learner;
- the first prompt (a new skill's worked example, with its context panel) of the pentatonic-box drill on C7 minor boxes, the relative minor and I7 positions, then D18, D19, D8 on I2 and the function drill on I5;
- the function drill's harmonic-minor V answered with the natural v, and its feedback;
- D20's eighth notes, played 90 ms late through the e2e onset fake, and its marks;
- D21's blank neck, then a tap outside the shape and its feedback, the summary and Progress.

Each screen is checked for horizontal overflow. With `SCREENSHOTS=1` and `--grep @screens`, the walk also saves each screen in dark and light: 168 shots from production. The command is in the spec header. Four reviewers went through the shots, one per profile, and I checked the main findings myself (D8's legend against its neck, D20's grid, the C7 and D21 markers, D18 in portrait).

| §11 scope                                                                                           | Status          | Evidence                                                                                         |
| --------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| Intermediate theory: pentatonic ↔ CAGED, arpeggios, 5-position major scale, minor harmony, function | ✅              | `theory/pentatonic`, `arpeggios`, `function` tests (M6-01)                                       |
| C7 pentatonic boxes and the relative minor (box-overlay drill)                                      | ✅              | `c7.test.ts`, `d-pentatonic-box/*.test.ts`; `m6-02`, `m6-10` (but see findings 2 and 6)          |
| I1 triad inversions on a string set (D18)                                                           | ✅              | `i1.test.ts`, `d18-inversions/*.test.ts`; `m6-03`, `m6-10` (but see findings 2 and 4)            |
| I1 voice leading (D19)                                                                              | ✅              | `i1-voice-leading.test.ts`, `d19-voice-leading/*.test.ts`; `m6-04` on all four profiles, `m6-10` |
| I2 arpeggios                                                                                        | ✂️ partial      | `i2.test.ts`; `m6-05`, `m6-10`. Chord tones in 7th-chord shapes only, through D8 (see "Cuts")    |
| I4 minor harmony and I5 function, substitution, borrowing (choice drill)                            | ✅              | `i4.test.ts`, `i5.test.ts`, `d-function/*.test.ts`; `m6-06`, `m6-10` (but see finding 5)         |
| I7 major scale in five positions, runs from any degree                                              | ✅              | `i7.test.ts`, `scale-position.test.ts`; `m6-07`, `m6-10` (but see findings 2 and 6)              |
| F4 rhythm track and D20 on the shared M8-01 timing engine                                           | ✅              | `f4.test.ts`, `d20-rhythm/*.test.ts`; `m6-08`, `m6-10` (but see finding 3)                       |
| D21 visualise (mental practice, rule 14)                                                            | ⚠️ not optional | `d21-visualise/*.test.ts`; `m6-09` on all four profiles, `m6-10` (see "For the PM")              |
| I2 arpeggios played into the mic (D17)                                                              | ⏳ pending      | I2 lists only D8; carried over from the M5 table                                                 |

**Cuts and tightenings (recorded from the M6 reviews):**

- **I2 is a partial cut of research/03 I2** ("chord tones inside any box"). It covers chord tones in 7th-chord shapes only (roots, then 3rds and 7ths, then 5ths). Chord tones inside pentatonic boxes and target notes aren't built; neither is I2 in D17.
- **I7 depends on `C7.major-boxes`, so on C6 transitively.** The design table (§M-Scales) lists only C6. This is an intentional tightening for rule 7 (CAGED → pentatonic → full scale). `engine/frontier.ts` still says the Scales module unlocks after "CAGED". It should say "CAGED and pentatonic" (and Arpeggios should also name chords: see finding 7).

**Checks the brief asked for:**

- **The drill picker's rotation (M6-09) against the whole matrix: confirmed.** The lane ran the M5-08 and M6-09 batch on all four profiles: 1052 passed, with one flake. The flake was `m3-05.spec.ts:241` on ipad-mini, D9 whole shapes, the skill whose rotation changed. It passed on retry and was fixed later with `test.slow()`, so it was a timeout, not the old two-drill order. No spec has failed on the rotation since.
- **D19 on iPad portrait and iPad mini: confirmed.** `m6-04` passed in the M6-04 lane batch (1118 passed), and again here on `ipad-portrait` and `ipad-mini-landscape`, with `m6-09`: 8 of 8. That covers the 12-fret portrait window and the ≥44pt cell check.
- **The design doc has no "items and grading" paragraph for any M6 drill.** D18, D19, D20, D21, the pentatonic-box drill and the function drill all lack one (design §6 has them for D4, D8, D13, D36–D40). M6-04's report has the material for D19's. This is for whoever next owns `docs/design/app-design.md`.
- **No Learn worked examples for M6 topics.** `learn/worked-examples/` stops at C6, so M6 skills on Learn have no "Worked example" button. Each M6 drill does walk a new item through on its first rep (rule 8), which the walk shows, so this is a gap in Learn, not in teaching.

**For the PM: D21 isn't optional (research/02 rule 14).** Rule 14 says mental-practice drills are _optional_. D21 now takes every third turn on C6 whole-shape cards (D9 → D10 → D21), and no setting turns it off; design §6 lists D21 with no setting. Proposed: a "Mental practice" setting, read in `drill-picker.ts` the way `requiresMic` and `requiresSound` are (a `mental` flag on the drill's meta). It would be on by default, because D21 adds a context for the same fact (rule 12), and a learner could switch it off. This is a curriculum call, so it's the PM's; nothing is blocked meanwhile.

**Findings** (production screenshots, four profiles, plus code reading). None blocks M6. Fix 1–3 first:

1. **D8's I2 worked example contradicts its own legend.** The context panel's legend for E7 shows R as an orange square, 3 as a circle, 5 as a yellow triangle and ♭7 as a pink hexagon. On the neck every note is the same blue circle: the roots are ringed circles labelled "R", and the other notes show letter names (G♯, B, D), so degrees and names are mixed on one neck. `promptMarkers` in `d8-chord-tone/D8View.tsx` uses the `target` and `tone` styles; `d8DegreeStyle` is only used for feedback. This breaks the "shape as well as colour" rule (CLAUDE.md, design §8). It's the same pattern as M3 finding 2, which D8's guided prompts still have.
2. **Worked examples lose the degree shapes and don't label what to tap.**
   - The `target` style overrides each note's degree shape. D18's 5th is a ringed blue circle, not a triangle, until it's tapped (`degreeMarker(n, 'target')` in `D18View.tsx`). I7 (`ScaleView.tsx`) draws its 3rds and 5ths as circles, while C7 (`BoxView.tsx`) in the same drill folder draws its 5th as a triangle. D19's root is a circle.
   - C7's box worked example says "Tap each note to continue", but only 6 of the 12 markers count ("Found 0 of 6"). The six targets are unlabelled blue circles, told apart only by a white ring, and they share the fill of the labelled ♭3 next to them (`BoxView.tsx:109` returns `style: 'target'` with no label). The relative-minor example says "Tap each F", but no marker says F. D19's targets are unlabelled too (`D19View.tsx:133`). D18, I7 and D8 do label theirs.
   - I7's hint "the dots are major box 1" covers every dot, including the ringed 4ths and 7ths, which aren't in the box. It never says those are the notes to tap.
3. **D20's grid makes a false accent pattern, and its button sits apart.**
   - The boxes for beats 2, 3 and 4 are about 25% smaller than beat 1 and every "&", and their counts sit higher. In `D20View.module.css`, `.cell[data-beat='true']:not(:first-child)` adds a margin inside a fixed `3.5rem` grid column, and the box (width 100%, square) shrinks. In a rhythm drill, box size reads as accent.
   - Start is centred on the full width, not under the prompt column (`.play` sits outside `.upper`). On a sideways phone it's below the fold.
   - In feedback, every late hit is a ▶ glyph, which reads as a play button, and nothing marks where the click was.
4. **D18 in iPad portrait shows frets 1–13, with no nut and no string names.** `d18Window` (`d18-inversions/logic.ts`) starts at the active range's fret 1, and the string names only draw in the open-string column. The other portrait drills show 12 frets, the nut and the names. The portrait neck drills (C7, D18, D19, D21) also centre the neck in a tall empty band, about 190pt above and 180pt below it, with the panel pinned at the bottom: the M3 finding 5 pattern again (`.drill { justify-content: space-between }` in each view's CSS).
5. **The function drill repeats itself.**
   - When the harmonic-minor V is answered with the natural v, the feedback repeats the guided prompt's fact word for word ("V in A minor is E. A harmonic minor raises G to G♯…"), and the prompt still says "Tap E to continue". `FunctionView.tsx` renders `dfFact` in both places. "Raising it to the leading tone makes E" has an unclear "it".
   - On I5, the panel says "Tonic chords rest, subdominant chords move away…" and then "Function: Tonic rests, subdominant moves away, dominant pulls home." (`dfHint` plus `FUNCTION_ROLE_LINE` at guide level 3, `d-function/text.ts`).
   - The cue line "IV in C major" shows on every function card, guided or not (`dfCueNote`). Reviewers split on this: the card tests numeral → function, so naming the numeral is fair, but it also makes the level-2 "Chords in C major" panel redundant. It's for the PM; leave it as it is.
6. **D21's feedback makes the missed answer the faintest mark.** After a wrong tap, the missed root is a dashed ghost circle at 0.7 opacity in inlay colour. That is the thing the learner most needs to see, and it's drawn as a circle, not the root square. Meanwhile the wrong tap is a bold vermillion diamond, and the found root is a plain root square, where the pentatonic-box drill turns found notes green. D21's explanation says "You tapped string 1, fret 4" on a neck with no string names or fret numbers; naming the note (G♯, already on the marker) would be clearer. The feedback bar says "the A shape of A♯" where B♭ would be the usual spelling.
7. **Learn copy for M6 modules.**
   - **"Builds on" doesn't match the gate.** Scales says "Builds on: CAGED", but its test-out is "Pentatonic boxes: major". Arpeggios says "CAGED and pentatonic", but its gate also needs "Find the 3rd and 7th in 7th-chord shapes". `unlocksAfter` is free text in `engine/frontier.ts`.
   - **The test-out sentence joins raw skill titles,** as M3 finding 7 noted. For example: "a short test of Find the 3rd and 7th in 7th-chord shapes, CAGED shapes: dominant 7 and Pentatonic boxes: minor", and "once you're practising Keep the pulse: tap on the beat" (`placement/TestOut.tsx`, `listOf`). On iPad mini, the Arpeggios Test out button sits below the panel's fold.
8. **Light-theme neck markers still fail contrast** (M5 finding 2, unchanged). The light-theme `--root` (#965800), `--tone` (#0072b2) and `--wrong` sit on the unchanged dark wood at about 2.1–2.4:1, under 3:1 for graphics. The dark labels on those fills are about 3.1–3.5:1, under 4.5:1. `Fretboard.contrast.test.ts` checks neither the fills against the wood nor the labels against the fills. Every M6 neck shows it: C7 roots, D8, D21's root.
9. **Small layout points.**
   - **Needless scroll:** on iPad landscape and the mini, the relative-minor, I7 and D19 prompts are 7–36pt taller than the screen, with about 100pt empty under the fret numbers; the taller panel or a two-line hint pushes the neck down.
   - **I7's open-string markers** at fret 0 cover the nut's string names.
   - **The D8 panel's chord diagram** has labels about 4–6pt high (M3 finding 9).
   - **Progress:** the achievement toast covers the h1, and "frets 0–12." breaks after the dash. It needs a non-breaking range.
10. **Copy:**
    - D20 says "Tap **Eighth notes** at 66 BPM", with the pattern name capitalised mid-sentence; `D20View.test.tsx` pins "Tap Only the “&”s". Its panel says "2 times through" where the prompt says "twice".
    - D19's subtitle "If they share none, all three move the same way" is shown on a move where they share one.
    - The summary still says "Those notes come back sooner" after shape, rhythm and function sessions, and "come back tomorrow" twice (M3 finding 7).
    - Straight and curly apostrophes are still mixed: "you've" against "you’ve", "today's" against "Today’s", "You'll".
11. **Phone (best effort):** neck cells are about 33pt on a sideways phone. The neck shows 10 frets where design §7 says compact zooms to about 5. The C7, D18 and D19 windows hold their shapes.

**Not findings:** the walk's seeding masters F2 skills, so "String 6 master" and "String 5 master" unlock on Progress, and the summary's 0% accuracy is because guided reps don't count. The yellow 5th triangles are `--chord-fifth` (Okabe–Ito #f0e442), not the sunflower brand colour, which appears only on buttons. D21's blank neck, with no fret numbers or string names and a count with no total, is by design (rule 4). The Learn shots stop at the viewport because the module panel scrolls inside the shell. In the C7 example the D and A string names are hidden on purpose, because an unlabelled target sits at fret 12 (`hiddenStringNames`). Neck cells on every iPad profile are 53–70pt.

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

- **M10 curriculum calls are the PM's (user decision, 2026-10-20).** The user is the main learner and isn't a guitarist, so they asked the PM to decide the learning-path questions from the learner's point of view, following research/02. The seven calls are recorded in the M10 WPs as "PM decision" lines: C6.triad-cores soft on C5.triads (M10-02); C, G, D as stage-1 keys (M10-02); a second spaced pass, then an explained early end, after the new-item cap, counting toward the daily goal (M10-03); I3 as its own Key signatures module (M10-03); "card" as the learner-facing unit, no "lesson" (M10-09); C2 stages 1, 4, 3, then 2 (M10-12); mastery-only milestones and a speed demon relative to the learner's tap time (M10-17). Future PMs make calls like these the same way, and only ask the user about cost, accounts or scope.
- **Seventh-shift PM calls (2026-10-21), all from research/02:**
  - **Start with sound leads only briefly (M4-10).** The ear track goes first for a start-with-sound learner only until `I6.ear-find` (ear → fretboard) is practising; then new items come back in goal order. Rule 6 (block briefly, then interleave): leading with the whole ear track held the neck back for two to three weeks.
  - **D21 is optional mental practice (M6-13).** A "Mental practice" setting, on by default because D21 adds a context for the same fact (rule 12), that the learner can switch off (rule 14). Nothing gates on it.
  - **Tab items reach Today only for tab readers (M9-05).** TAB new cards go to Today only when the learner's goal includes reading tab, or they focus the Tab module; everyone else still sees the module on Learn (rules 11 and 16). A reader who tests out skips `F3.markers` only if the probe passes it.
  - **The function drill keeps its "IV in C major" cue line (M6-14).** The card tests numeral → function, so naming the numeral is fair.
  - **M7-05 waits for M10-02.** Both add a schema version, and M7-05 must restage the rows M10-02 moves to new skill IDs.
  - **The songs on-ramp: shorter chord, harmony and capo gates (M10-02).** The old gates were all "mastered": `C5.triads` needed every C3 interval and both C4 key skills, `C8.numerals-major` (all 12 keys, 144 cards) needed the flat-key degrees and triads, `C9.pop` needed all of C8, and the capo needed the sharp keys and triads. A songs learner reached a Roman numeral after six to ten weeks. Now:
    - `C5.triads` is hard on `C3.thirds` (a triad is two stacked 3rds) and soft on `C4.sharp-keys`. `C6.triad-cores` stays hard on F2 ×2 and is soft on `C5.triads`; `C7.minor-boxes` is soft on `C6.minor-cores` instead of hard on `C6.minor-shapes`; `C10.capo-g-c-d` is soft on the sharp keys and triads (a capo question needs "which key sounds").
    - C8 comes in three key stages: C, G, D (`C8.numerals-major`, hard on `C5.triads`, soft on the sharp-key degrees); A, E, F (`C8.numerals-a-e-f`, soft on stage 1 and the flat-key degrees, F's); B, F♯ and the flat keys (`C8.numerals-other-keys`, hard on `C4.flat-key-degrees`, soft on stage 2). Nashville is split the same way, each stage soft on its Roman stage. Only stage 1 is probed in placement. Schema v4 moves the later keys' cards, reviews and states to their stage (a mastered C8 carries to every stage), and JSON import does the same.
    - `C9.pop` is hard on `C5.triads` and soft on C8 stage 1.
    - **Rule 7 still holds.** Its gates are on mastery, and they stay hard: intervals → chord construction (`C3.thirds` → `C5.triads`), chord construction → progressions (`C5.triads` → `C8.numerals-major` and `C9.pop`), and F2 → CAGED (`C6.triad-cores`, and through it C7). What became soft are the practice-type prerequisites: keys spelled alongside triads, numerals practised while progressions are built, and key stages that are the same facts in more keys.
    - Downstream (PM calls): Today's "new" count derives each skill's status, so soft-gated skills count once open; soft edges order placement and test-out probes but verdicts carry across hard edges only; Explore and focus walk-backs stay on hard prerequisites (soft ones are already open).
  - **Reviewer should-fixes that touch learning are required, not optional:** answer leaks before a response (rule 4), wrong theory in feedback, and intro copy that states one case as the only one.
- **First-load JS budget temporarily raised to 280 KB (user decision, 2026-10-20). This deviates from design §10 (250 KB).** Every drill's `logic.ts` is still in first-load JS: views became lazy in M3-18, but logic didn't. D11 (M4-02) took the total to 250.5 KB with four more drills waiting. The user chose to raise `scripts/check-bundle.mjs` to 280 KB so the drain could finish, rather than hold the drills. **M1-42 (Priority high) moves drill logic out of first-load JS and must restore the budget to 250 KB.**
- **Test-out marks a skill mastered without spaced reviews (M2-16, 2026-10-19). This deviates from design §3.4's mastery definition (rule 7).** Mastery normally means 90% of items at stability ≥ 7 days with median RT on target. A test-out where every probe is fluent seeds the skill's items at 10 days and marks it mastered. It is stricter than onboarding placement (more probes, no slips), and any existing card below the stability threshold is probed too, so weak real reviews can't be overridden. Older cards keep their own FSRS schedule.
- **Placement retake never lowers an existing card (M2-15, 2026-10-19). This deviates from research/02 rules 1 and 2.** A retaken placement probe on a card the learner already has is logged with its honest rating (Hard or Again when slow or missed, per rule 17), but it is not applied to the card's FSRS state. A good probe can still raise a card. Reason: the retake is optional, repeatable and off-schedule, so letting it demote cards would punish learners for checking themselves, and rule-driven scheduling still governs normal sessions. Revisit if retake results should feed the scheduler.
- **Staff tap targets are 22pt bands, not 44pt (M8-02, PM decision, 2026-10-20).** On the interactive `<Staff>` each line or space band is about 22pt; a line plus its adjacent space is 44pt. The whole staff is one press target: a ghost notehead follows the finger and the pick happens on release, like a slider thumb, so a slip is visible before it commits. Keyboard and VoiceOver users get one button per position. A literal 44pt per position would make the staff about 600pt tall, too tall to sit above the neck (design §12). The ≥44pt rule for neck cells is unchanged. To go literal, change `MIN_LINE_GAP_PT` in `components/staff/geometry.ts`.
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

| WP    | Worker                         | Review rounds                                                            | Integration                  | Result |
| ----- | ------------------------------ | ------------------------------------------------------------------------ | ---------------------------- | ------ |
| M1-01 | about 18 min                   | 1 (approved; its should-fix became an M1-06 backlog change: route guard) | 44 s: rebase, ff, ship, push | live   |
| M1-02 | about 6 min, plus 3 fix rounds | 4 (each round found a real forgiveness bug in the streak contract)       | 44 s                         | live   |

Rough edges found and fixed in the skill:

- `health.sh` died under `pipefail` when `pgrep` matched nothing.
- `poll.sh` now suggests each package's next pipeline step.
- Old reviews are archived before a fix round, so the next reviewer starts fresh.
- Review rounds and integration failures are capped separately, at 3 each.
- `ship.sh` writes its phase, so the lane can tell a failed verify (reset `main`, nothing shipped) from a failed deploy (stop the line).
- Re-reviews are scoped to earlier must-fixes plus regressions. Issues that belong to later packages go under "Downstream notes", which `cleanup.sh` forwards into those workers' briefs. The first notes are already queued for M1-09 and M1-10.

The trust-folder prompt never appeared, because worktrees under the trusted repo inherit trust. `ensure-ready.sh` still handles it, accepting only for `.orchestrator/worktrees/*`.

## Questions for the user

**Placement time budget (M2-16, 2026-10-19).** Onboarding placement now probes C4 (key spelling), so a perfect expert faces about 67 probes. At the assumed 3.5 s a probe, the 180 s budget reaches every C3 group and C4's sharp keys, but not the flat keys. Onboarding alone therefore won't open Chords; the new "Test out" on a locked module does. Options: (a) accept this (recommended, since test-out covers it), (b) raise the budget to about 4 minutes, or (c) trim tiers. Nothing is blocked; the default is (a).

**M7 accounts and sync (filed 2026-10-18; unblocked 2026-10-18 evening):**

1. ~~**New AWS services.**~~ **Answered (user, 2026-10-18 evening): "Approved: build the FretworkSync stack (Cognito, API/Lambda, DynamoDB)."** It sends through the existing FretworkEmail SES setup. Accounts stay optional (design §1 principle 8). M7 is unblocked.
2. ~~**Email sender.**~~ **Answered (2026-10-18, via the infra session):** `no-reply@fretfree.app` ("Fret Free"), from the separate `FretworkEmail` stack, which owns the fretfree.app SES identity, DKIM, MAIL FROM and DMARC. SES production access is granted in eu-west-1.
3. **Privacy.** Emails and progress would be stored in AWS us-east-1. Is a short privacy note on the About page enough, or do you want a separate privacy policy page? _Partly answered: the infra session is adding a `/privacy` page (linked from About and Settings), and M7-06 would extend it to cover sync._

~~**DNS safety rule.**~~ **Answered (user, 2026-10-18 evening):** "fretfree.app and www.fretfree.app are the only DNS entries we need." SKILL §7 lists exactly those (plus their ACM validation records).

### Answered

- **Name:** keep "Fretwork" (user, 2026-10-18).
- **Dependencies:** the orchestrator may add licence-compatible dependencies (MIT/ISC/BSD/Apache-2.0/0BSD) itself, without asking each time (user, 2026-10-18).
- **"Learn to read" scope:** add a small tab-reading track (M9) so "learn tab" is a real option (user, 2026-10-18).
- **iCloud:** `~/Documents` is iCloud-synced, and `fileproviderd` was the top CPU user. iCloud only skips names that _end_ in `.nosync`, and `Projects.nosync.noindex` ends in `.noindex`. The repo was renamed to `guitar.nosync` (user, 2026-10-18).

## Parallelism log

| Period                 | Phase  | Ceiling | Avg active | Peak | Notes                                                     |
| ---------------------- | ------ | ------- | ---------- | ---- | --------------------------------------------------------- |
| Dry run (M1-01, M1-02) | serial | 2       | 1.6        | 2    | 16 samples. Idle time was spent in review rounds on M1-02 |

| Fan-out, 09:24–11:47 UTC | fanout | 5–8 (one hotfix burst to 10) | 7.3 | 10 | 155 samples, 4% idle slots. The serial ship lane (≈5–10 min per ship) was the bottleneck, not workers. Reviewers ran in parallel throughout |
| Drain, 11:47–handoff | fanout → paused | 2–5 (load-driven, iCloud) | ≈4 | 6 | No new spawns after the user asked for the handoff. M1-12, M1-07, M6-01 and M1-19 drained through the lane |
| Fourth shift, 2026-10-19 07:55 → 2026-10-20 handover | fanout → drain | 5–8 (slot-gated, no longer load-driven) | 7.6 | 12 | 740 samples, 19% idle slots (mostly the drain). The serial lane and model.ts rebase churn were the bottleneck. Lane batching was added at the end |

From here on, the builder appends rows from `.orchestrator/state.json` → `parallelism`.
