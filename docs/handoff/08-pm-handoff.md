# Handoff brief 8: fresh PM (seventh shift)

You are taking over as the **build agent and project manager** for FretFree (code name Fretwork). The sixth-shift PM, session `guitar-nosync-14` (Herdr workspace "FretFree PM 6"), ran from 16:15 on 2026-10-20 until this handover. At the user's request it **finished all work in progress** before handing over: nothing is in flight. `docs/handoff/02-build-brief.md` still defines the job. Brief 7 (`07-pm-handoff.md`) describes the current pipeline, and brief 6 (`06-pm-handoff.md`) the product.

## Start here

You are agent `fretfree-pm-7`, in the Herdr workspace "FretFree PM 7" that the sixth-shift PM created for you. `spawn.sh` creates `fretwork-workers-N` tabs in your workspace as it needs them.

1. Read `CLAUDE.md`, `.claude/skills/fretwork-orchestrator/SKILL.md` (§0, §3, §4 and §9) and **`.orchestrator/pm-notes.md`** (its last section, "Sixth shift", is this shift's log and ends with the handover).
2. Invoke the `fretwork-orchestrator` skill and run the SKILL §0 preconditions. **No workers are in flight** and the lane queue is empty. `git status` should be clean.
3. Start exactly one `$O/watch.sh 1800` in the background (`pkill -f fretwork-orchestrator/scripts/watch.sh;` first, in the same command).
4. Run `$O/refill.sh`. The planner takes `Priority: high` first, so the **M10 learning-path WPs** start first (see below).

## Your top priority: M10, the learning-path fixes

A separate session (`review-learning-path-drift`) reviewed FretFree as a learning product. Its review and two copy audits are in `docs/review/` (committed, 95982aa4). An agent verified every finding against main (`docs/handoff/08-review-verification.md`): none had been fixed by the work since. The findings are filed as **M10-01 to M10-17** in `docs/backlog.md`. M10-01 to M10-06 are `Priority: high`, in this order:

1. **M10-01** [contract] soft prerequisites per skill (one gate can mix "mastered" and "practising"). Needed by M10-02.
2. **M10-02** songs on-ramp: C8 split into three key groups (C, G, D first), C5.triads needs only C3.thirds mastered, C9.pop stays hard on C5.triads (rule 7), looser C10/C7/C6 gates, a schema migration, and the deviation recorded in progress.md. Deps M10-01.
3. **M10-03** session lanes (2:1:1 across open modules), `maxNewPerSession` 8 at 10 minutes, I3 as its own "Key signatures" module after C8 stage 1.
4. **M10-04** concept intros: a one-card intro before a skill's first guided rep, the first ten written. Keep the content lazy (first-load budget).
5. **M10-05** teach on a miss in D1 and D3 (plus a shared ♯/♭ display helper).
6. **M10-06** teach on a miss in D5 and D39.

Then M10-07 to M10-17 (outcomes, one vocabulary, copy fixes, C2 split by string, worked examples, Today first-day line, placement probes, achievements).

**The user delegated every curriculum decision to the PM** (2026-10-20): they are not a guitarist and are the app's main learner. Decide learning questions yourself from `docs/research/02-learning-science.md`, write each call as a "PM decision" line in the WP and once in progress.md "Decisions and deviations", and ask the user only about cost, accounts or scope. The seven open M10 questions are already decided in the WPs.

Sequencing notes from the verification (all their prerequisites have now shipped):
- M10-02 and M10-12 both add schema versions in `storage/db.ts` and change export/import: never run them at the same time.
- M10-03, M10-07 and M8-21 all own `engine/frontier.ts`; M10-10 and M8-21 both own `onboarding/steps/notation.tsx`. M10 goes first.
- M7-05 (sync) must restage rows that M10-02 and M10-12 move to new skill IDs (noted in its acceptance).

## Where things stand

- **Production = origin/main = `the handoff docs commit after `61738133` (M4-08)`.** 119 WPs done, 47 todo, none blocked.
- **Shipped this shift (23):** M3-12, M8-03, M1-43, M4-09, M4-13, M7-02, M8-02, M5-07, M8-01, M6-05, M6-07, M6-03, M5-08, M6-09, M8-20, M7-03, M1-44, M7-04, M6-04, M6-06, M4-07, M4-08, M6-08.
- **New in production:**
  - **M4-13:** the guitar sound on iPhone and iPad (no AudioWorklet in the audio path; unlock inside the tap). Not yet confirmed on the user's real devices: if they report silence, it's top priority.
  - **M7-02/M7-03/M7-04:** the FretworkSync stack at `api.fretfree.app` (Cognito, sync API, DynamoDB) and the sign-in UI. The first FretworkSync deploy failed smoke once while the API custom domain propagated (about 6 minutes); a re-run passed.
  - **M8-20:** the metronome in Tools, on the M8-01 timing engine. **M8-02:** the notation staff (VexFlow, lazy).
  - **M1-43:** one file per item kind (`engine/items/`). **M1-44:** first-load JS as one chunk with theory split per declaration (238.8 KB on main, budget 250); the bundle check now fails if first load splits again.
  - Drills and skills: I1 (M6-03, D18, M6-04 D19), I2 (M6-05), I4/I5 (M6-06, d-function), I6 ear (M4-07 D14, M4-08 D15 with `I6.ear-find`), I7 (M6-07 on the pentatonic-box drill), F4 rhythm (M6-08 D20), D21 (M6-09), mic quests (M5-07), the M5 QA report (M5-08).
- **E2E skill lists are derived now** (M6-06): `app/e2e/helpers/skills.ts` reads every skill ID from `engine/skills/*.ts`, and `guides.ts`, `octaves.ts` and `m2-05.spec.ts` use it. A new skill no longer needs a hand edit there. If a new WP's report says it appended IDs to those helpers, send it back.

## Rules learned this shift (most are also in pm-notes)

- **`refill.sh` doesn't count status `held` as busy:** it re-planned a held WP and `spawn.sh` made a stray pane. Park live WPs as `queued` (refill-safe) and keep them out of `lane-queue.txt` until they're ready.
- **The first-load budget is a shared resource.** Each drill adds about 0.5–2 KB of eager metadata. Before a drill batch, check the members' `node scripts/check-bundle.mjs` totals (run in each worktree after its preflight) against main's: they add up.
- **Stack WPs that touch the same shared file** (`git rebase wp/<prev>`, or `--onto wp/<prev> <prev-old-tip>` when the predecessor was rebased again), run `verify:static` plus the affected specs, and ship them as one ordered batch. This shift's final batch (M6-06, M4-07, M4-08, M6-08) was stacked that way.
- **Lane flakes are mostly load timeouts.** This shift: `test.slow()` for `m3-13.spec.ts:141` and `m3-05.spec.ts:241`; one render quantum of slack in `m5-02.spec.ts:94`; 15 s for `m8-20.spec.ts:96`. Two **jsdom unit tests** time out under lane load and the lane doesn't retry unit tests, so they cost a one-at-a-time re-run: `src/placement/PlacementTest.test.tsx` (a hook timeout at 10 s) and `src/session/SessionScreen.test.tsx` "marks a wrong answer and focuses Continue". They were given more time in a51dd715; if either shows up again, raise it further rather than re-running the batch.
- **A new API custom domain takes minutes to serve its certificate.** If a first deploy of a new hostname fails smoke on TLS, wait and re-run `./scripts/smoke.sh` before treating it as stop-the-line.
- **`docs/review/` was hidden with `.git/info/exclude`** while it was untracked; that line is gone now that it's committed.

## Open items for the user

- Retest sound on the real iPhone and iPad (reload or reopen the PWA first; the hardware silent switch mutes web audio on iOS).
- Real-guitar and real-mic checks for the tuner and mic drills (from M5-08's QA report in progress.md).
- Older items in progress.md: the placement time budget (default (a)).

## Housekeeping

- The remote test runner is still parked and off (brief 7). Branch `tools/remote-runner` and its worktree belong to the fifth shift's subagent; don't enable it without the user.
- Worker tabs from this shift are closed. The sixth-shift PM's own workspace ("FretFree PM 6") is left for the user to close.
