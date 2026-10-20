# Handoff brief 6: fresh PM (fifth shift)

You are taking over as the **build agent and project manager** for FretFree (code name Fretwork). The fourth-shift PM, session `guitar-nosync-45`, ran from 07:55 on 2026-10-19 until the handover on 2026-10-20. At the user's request it **drained all work in progress** first: nothing is in flight. **`docs/handoff/02-build-brief.md` still defines the job.** Brief 5 (`05-pm-handoff.md`) has the earlier context.

## Start here

1. Read `CLAUDE.md`, `.claude/skills/fretwork-orchestrator/SKILL.md` (§0, §3, §4 and §9 especially) and **`.orchestrator/pm-notes.md`**. pm-notes is the PM's durable working memory. It isn't in git, so keep it current.
2. Invoke the `fretwork-orchestrator` skill and run the SKILL §0 preconditions: `node $O/state.mjs show`, `$O/poll.sh` and `git status`. **No workers are in flight**, and the lane queue is empty.
3. You're in a **new Herdr window**. `spawn.sh` creates `fretwork-workers-N` tabs as it needs them. The previous PM closed its worker tabs.
4. Start exactly one `$O/watch.sh 1800` in the background, and always start it with `pkill -f fretwork-orchestrator/scripts/watch.sh;` in the same command. Its 30-minute timeout is your heartbeat.
5. Run `$O/refill.sh`. The planner takes `Priority: high` packages first, so **M1-43** starts first (see below).
6. Tell `guitar-nosync-57` and `guitar-nosync-f6` that you are the new PM (`ListAgents`, then `SendMessage`).

## Where things stand

- **Live:** https://fretfree.app, at the handoff commit, the docs commit after `ad17a09` (M1-42), with main equal to origin/main. **96 WPs are done; 51 are todo.** The lane is idle.
- **Shipped this shift (19):** M2-22, M3-17, M1-41, M3-13, M4-12, M5-02, M3-15, M5-06, M4-06, M4-04, M4-02, M5-03, M4-03, M3-14, M4-05, M6-02, M5-05, M5-04, M1-42. `docs/progress.md` has the shift report.
- **New in production:**
  - a **Tools** section with the **tuner** (M4-12, M5-02, M5-03): mic pitch detection, string-aware flat and sharp guidance, reference tones, and handling for a lost mic;
  - **audio engine v2** (M4-06): guitar pluck voice, strums, progression playback;
  - **mic drills** D16 and D17, a generic `requiresMic` gate, and mic onboarding (M5-04);
  - **drills** D11, D12, D13, D36, D37, D38 and D40, the circle of fifths and the C7 pentatonic box drill;
  - **M1-42**: drill logic out of first-load JS. First-load is 233.5 KB, and **the budget is back to 250 KB**. It had been raised temporarily to 280 by user decision.

## Do these first

1. **M1-43 (`Priority: high`): one file per item kind.** Every drill appends its item kind in the same five places in `engine/model.ts`, plus `skills/registry.test.ts` and `config/placement.ts` `skipSkills`. Every pair of drill packages conflicted there, which serialised the drills and cost a rebase and re-verify each time. **Run it before the next wave of drills**, and hold drills that touch those files until it lands.
2. **The metronome** (M8-20, in Tools) now waits only for **M8-01**, the timing engine (its dep M4-06 shipped). The user asked for Tools, so once M1-43 is in, consider marking M8-01 and M8-20 `Priority: high`.
3. Then normal planning: the rest of M4 (M4-07 to M4-11), M5 (M5-07 and the M5-08 QA), M6, and M7-02 (FretworkSync infra, approved).

## How the pipeline works now (changed this shift; all in SKILL §3, §4 and §9)

The user said development had "ground to a halt" from rebasing and testing. These are the answers.

- **The lane ships batches** (`integrate.sh WP…`, `lane-next.sh` takes up to `LANE_BATCH`=4):
  - It rebases and merges each queued WP in order, then verifies and ships once.
  - A WP that conflicts is skipped (`SKIPPED <WP> rebase-conflict`, exit 3 for it), and the rest still ship.
  - If a batch fails verify, every member's branch is restored to its own tip, and they're re-run one at a time.
  - This was tested in a sandbox. M1-42 was the first real run.
- **The lane's verify is the only full verify:**
  - Workers run `pnpm verify:quick` for their report and fix rounds (`--since` the fix brief).
  - The **preflight** after APPROVE (`send-brief.sh <WP> preflight`) is quick should-fixes, a rebase onto origin/main, and `verify:quick`. It isn't a review round.
  - Reviewers run targeted unit tests only.
- **Test load is gated, not the agent count:**
  - `scripts/cpu-slot.sh` (2 slots) gates the static half of verify. `scripts/e2e-slot.sh` (2) gates Playwright. Both use `scripts/slot-lib.sh`.
  - The lane gets **priority** for slots, not extra ones (a third slot timed out healthy tests).
  - Vitest and Playwright are capped at 4 workers per run (lane: 6 and 5).
  - `health.sh` ignores load1 unless it's above 4× the core count.
- **`Priority: high`** in the backlog sorts a WP ahead of everything else.
- **Before every lane run, dry-run the queue:**
  - For plain branches, use `git merge-tree --write-tree origin/main wp/<WP>`.
  - For stacked branches, do a trial `git rebase` in a temp worktree. Merge-tree gives false conflicts once the lane has rebased a predecessor.
  - Pre-rebase conflicting WPs in parallel.
- **Stacking**, which drained six `model.ts` drills: each rebases onto the previous WP's branch (`git rebase wp/<prev>`) and runs `verify:static` plus its own specs. The lane's rebase onto main skips the already-applied commits. Batching makes this mostly unnecessary, and M1-43 removes the cause.

## The remote test runner (built, parked and off)

The user provided a 48-core / 503 GB Linux box and asked for an unprivileged account to offload tests to "when appropriate".

- **Account:** `ipc-freefret@51.195.234.239`. No sudo, the same SSH keys as `ubuntu`, linger enabled.
- **Tooling:** Node 22.23.2 in `/opt/node`, rootless Podman 5.7, and the image `mcr.microsoft.com/playwright:v1.64.1-noble`. `ubuntu` has passwordless sudo; use it only for system packages.
- **`scripts/remote-run.sh`** (experimental):
  - It tars the files git sees (never ignored files such as `.env`) to a fresh `~/fretwork-runs/<run>`.
  - It runs the command in the container with the Mac's Node version, a shared pnpm store, one run per container, and a host-side semaphore (`REMOTE_RUNS`, default 3).
  - It streams the output back and returns the exit code. An interrupt removes the container.
  - `pnpm verify` and `verify:quick` go through it, and `ship.sh` builds locally before deploying when it's enabled.
  - **It's off unless `.git/fretwork-remote` holds the address** (or `FRETWORK_REMOTE` is set). That file isn't committed, so the address stays out of the public repo.
- **Why it's off:**
  - Playwright's WebKit crashes on the box. On the host (Ubuntu 26.04, kernel 7.0) it hits "double free" in GStreamer. In the noble container it gets "Page crashed" under load, much worse with `--pid=host`, which was removed.
  - At 4 Playwright workers, a 48-test sample passed 46 of 48. The 2 failures aren't diagnosed.
  - Even then, a full e2e at 4 workers takes about 25 minutes, against 10–12 on the Mac.
  - Unit tests run fine: 51.8 s, against about 40 s on the Mac.
- **Options:**
  - (a) diagnose the 2 failures and try more workers;
  - (b) ask the user to reinstall the box with **Ubuntu 24.04**, which Playwright supports, and run on the host;
  - (c) offload only the static half (typecheck, lint, unit, build) and keep Playwright on the Mac.

## Rules learned this shift (most are in pm-notes)

- **Always `grep STATUS` a report before spawning a reviewer.** M4-05 reported BLOCKED with a question, and a review was wasted on an empty branch.
- **A worker's REPORTED can wrap onto two lines,** and `watch.sh` only matches it as the last `⏺` line. On a heartbeat, check idle workers by hand. Workers sometimes miss a background task's completion and sit idle; nudge them.
- **Lane flake routine:** reproduce with `--repeat-each 3–5` at the lane's merge SHA in a temp worktree. If it passes, log a `flake` event, reset `integrationFailures` and re-queue. Done for M1-41, M5-06 and M5-04.
- **Mark a WP `held`** in state when the watcher keeps waking on a stale REPORTED.
- **A manual `git push` whose pre-push hook runs the full verify dies with SIGPIPE (141)** after about 17 minutes, because GitHub drops the idle SSH connection. The SHA is stamped by then, so push again. Docs-only pushes skip verify.
- **Never edit the main checkout while `integrate.sh` runs:** `ship.sh` refuses a dirty tree. Park edits as a patch.
- **Mic drills:** set `requiresMic: true` on the plugin, use the `window.__fretworkFakeMic` e2e hook, and never play pitched audio while listening.
- **New drills follow M1-42's contract:** lazy logic plus lazy views, with only metadata eager. `drills/lazy-view.test.tsx` enforces it.

## Open items for the user

- **Placement time budget** (`docs/progress.md`, under Questions for the user). The default is (a), accept it. Nothing is blocked.
- **The remote runner:** which option to pursue (above).
- Low priority: should D36's `C5.name-*` gate D38's `C5.build-*`? Undecided, from M3-15.

## Known flaky tests and backlog ideas not yet filed

- **`app/e2e/m4-06.spec.ts:20`** asserts no console errors, and WebKit on ipad-mini sometimes logs a spurious "access control checks" error for a `blob:` URL. Filter that message.
- **`storage/sync/merge.test.ts`**, "converges whatever order…", times out at 20 s under load. Give it a longer per-test timeout, like a727cf4.
- A separate D10 chain item kind (from the M3-06 review).
- A `<Fretboard>` option to hide string names but keep fret numbers, which would serve D4 and D37 (from M3-14).
- A shared `LoadFailed` component, now duplicated in `ExploreScreen.tsx` and `ToolsScreen.tsx`.
- From M1-42: `SessionScreen` could re-read `currentPrompt()` after `preloadDrill` resolves (see its report).
