# Handoff brief 7: fresh PM (sixth shift)

You are taking over as the **build agent and project manager** for FretFree (code name Fretwork). The fifth-shift PM, session `guitar-nosync-7d`, was wound down on 2026-10-20 by the user so the delivery pipeline could be changed under it. This brief is the pipeline change plus the state it left. Read `docs/handoff/06-pm-handoff.md` for everything about the product that still holds.

## Start here

1. Read `CLAUDE.md`, `.claude/skills/fretwork-orchestrator/SKILL.md` (§0, §3, §4 and §9) and **`.orchestrator/pm-notes.md`**, whose last section is the fifth shift's handover: the lane state, every in-flight WP and what it waits on.
2. Invoke the `fretwork-orchestrator` skill and run the SKILL §0 preconditions. **Workers are in flight** from the fifth shift; §0's resume adopts them (their agents are alive, named `wp-<wp>`, in the previous PM's `fretwork-workers-N` tabs, which are recorded in `state.json`).
3. Start exactly one `$O/watch.sh 1800` in the background (`pkill -f fretwork-orchestrator/scripts/watch.sh;` first, in the same command).
4. Ship the lane queue first (see below), then `$O/refill.sh`.

## What changed in the pipeline (read before touching the lane)

The user found that delivery had stalled: 8 Playwright runs queued on 2 slots, load 45–80 on 10 cores, and one load timeout failed a 5-WP batch, which then re-ran one WP at a time. The cause was not duplicate specs but **how often the whole four-project matrix ran**: every worker report, every preflight and the lane, each about 30 minutes under that load. The rules now:

- **Only the lane runs the whole Playwright matrix** (`pnpm verify`, once per batch). Workers run `pnpm verify:quick`, which picks a level: **own specs** on every project when the change stays in its drill folder and specs; the **fast suite** (`pnpm --filter app e2e:fast`: everything on `ipad-landscape` plus `iphone-smoke`, a third of the matrix) when it reaches shared code or adds a drill; `--full` only on request. Never tell a worker to run `pnpm verify` or `pnpm e2e`.
- **Preflight** (after APPROVE) is `pnpm verify:quick --preflight`: static gates plus own specs, and the fast suite only if `origin/main` moved since that worktree's last passing fast run. The brief template says so.
- **The lane retries a failed test once** (`PW_RETRIES`, default 1 under `FRETWORK_LANE=1`). Tests that passed on retry land in `.orchestrator/flaky.log` and a `flaky` event. Fix them between ships (usually a wait with no timeout, or a 5 s poll under load) or file a WP. A flake that reaches the one-at-a-time re-run still costs a full verify.
- **Watch `slot_waiters` in `health.sh`.** More than 4, or load over 40, means something is running the matrix outside the lane: `pgrep -fl 'playwright test'` shows who. Don't raise `E2E_SLOTS`.
- The remote test runner (`scripts/remote-run.sh`) is still experimental and off. Branch `tools/remote-runner` (worktree `.orchestrator/worktrees/remote-runner`) holds the fifth shift's work on it; it must be rebased onto main after the pipeline change before anything is taken from it. Don't enable it without the user.

## Where things stand (from the fifth-shift PM's wind-down, 2026-10-20 ~16:00)

- **Production = origin/main = `f28b252`.** Nothing shipped in the fifth shift. Local `main` carried five unpushed commits (`81dd35e` flake fixes, `48f6ba3` the M4-13 backlog entry, `aa65034` the SKILL.md DNS rule, `816211a` a TestOut preload, `9b0b8df`); the pipeline change (`tools/pipeline`) was merged on top and pushed with them.
- **Lane queue (`.orchestrator/lane-queue.txt`): M3-12, M8-03, M1-43, M4-09.** All approved and static-preflighted; they were 960/961 green in the failed batch. Ship them as one batch first thing (`lane-next.sh`): with retries on, the one failure (M4-13's spec) is out of the batch.
- **M4-13 (user priority: silent audio on iPhone and iPad)** failed the lane twice on its own spec: `navigator.serviceWorker.ready` hangs under load in WebKit (a stuck service-worker install, as in m1-19). The audio fix is approved. It has a fix brief (a bounded activation poll before navigation, proven with `--repeat-each 4`). Ship it as soon as it reports: don't wait for a batch to fill.
- **M7-02** (FretworkSync infra, approved) needs its round-3 reviewer, the last one allowed (SKILL §6). **M8-01** waits for M4-13 to ship before editing `audio.ts`. **M5-07** is in preflight. **M8-02** is still working.
- **Held drills** (set `blocked` until M1-43 ships): M4-07, M4-08, M6-03, M6-05, M6-06, M6-07, M6-09, M9-02. After M1-43 ships, set them back to `todo` in one docs commit between lane runs, then refill.
- The remote-runner subagent of the fifth-shift session may still be editing `.orchestrator/worktrees/remote-runner` (branch `tools/remote-runner`). Leave it alone.
