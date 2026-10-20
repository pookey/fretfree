---
name: fretwork-orchestrator
description: Build and continuously ship Fretwork by orchestrating parallel Claude worker agents with Herdr. Use when asked to build, continue, or orchestrate work packages from docs/backlog.md, to run the build agent's loop, or to resume an interrupted orchestration. Requires HERDR_ENV=1.
---

# Fretwork orchestrator

You are the **orchestrator**. You don't write feature code. You keep up to N worker agents busy on conflict-free work packages (WPs), get each one reviewed, merge it through a single integration lane, ship it to production, and push. You also keep `.orchestrator/state.json` accurate so any fresh session can resume.

Everything lives under `.claude/skills/fretwork-orchestrator/`:

| Script (`scripts/`) | Purpose |
|---|---|
| `backlog.mjs` | `list`, `show <WP>`, `ready`, `plan --slots N --busy A,B`, `set-status`, `check` |
| `state.mjs` | `.orchestrator/state.json`: workers, tabs, ports, events, parallelism samples |
| `spawn.sh <WP> [worker\|reviewer]` | worktree + branch + `pnpm install` + port block + pane + agent + trust handling + brief |
| `ensure-ready.sh <pane> <cwd>` | waits for the agent to be ready; accepts "Yes, I trust this folder" **only** for `.orchestrator/worktrees/*` |
| `send-brief.sh <WP> fix\|rebase\|preflight [reason]` | follow-up round to a live worker; caps review rounds and integration failures at 3 each (exit 7). `preflight` (after APPROVE) isn't counted |
| `poll.sh` | one line per in-flight WP; exit 10 on usage/rate-limit messages |
| `health.sh` | memory, slot queue (and only extreme load) → suggested ceiling |
| `integrate.sh <WP> [WP…]` | **the integration lane**: rebase each → ff-merge → mark done → one `pnpm ship` for the batch → push (exit codes below) |
| `cleanup.sh <WP>` | closes the WP's own panes, removes the worktree and merged branch |
| `lane-next.sh` | ships the first `LANE_BATCH` (default 4) WPs in `.orchestrator/lane-queue.txt` as one batch, then exits. If the batch fails verify, it re-runs them one at a time. Gates on load and retries EINTR. Run it in the background, once per ship |
| `watch.sh [secs]` | blocks until a WP needs action (verdict, real `REPORTED`, blocked) or usage limit; run in the background as the wake-up |
| `refill.sh` | steps the ceiling towards `health.sh` and spawns into free slots |

Templates (`templates/`): `worker-brief.md`, `reviewer-brief.md`, `fix-brief.md`, `rebase-brief.md`, `preflight-brief.md`.

Define `O=.claude/skills/fretwork-orchestrator/scripts` in your shell commands.

## 0. Preconditions (every session)

1. `test "$HERDR_ENV" = 1`. If that fails, say you aren't inside Herdr and stop. Follow the Herdr skill (`~/.claude/skills/herdr/SKILL.md`): parse IDs from JSON, use `--no-focus`, and never close panes or tabs you didn't create.
2. You're in the main checkout, on `main`, with a clean tree: `git status --porcelain` is empty.
3. `node $O/backlog.mjs check` passes.
4. Read `.orchestrator/pm-notes.md` (the PM's durable working notes: holds, cross-session protocol, user decisions, overnight rules), if it exists. Then `node $O/state.mjs init`, then **resume**: `node $O/state.mjs show` and `$O/poll.sh`. For every worker in state:
   - if its agent is alive, keep it and continue at the right step (§3);
   - if its agent is gone but the worktree and report exist, continue with review or integration;
   - if its agent is gone and there's no report, respawn it with `$O/spawn.sh <WP>` (the existing branch is reused).
   Drop tabs in state that no longer exist.

## 1. Phases and concurrency

- **Phase `serial`** (ceiling 1–2) lasts until the M1 contract packages (**M1-01, M1-02**) are `done`. Shared contracts must be stable before fan-out. Run M1-01 and M1-02 together: they don't overlap.
- **Phase `fanout`** comes after that. Set it with `node $O/state.mjs set phase '"fanout"'` and `node $O/state.mjs set ceiling 6`.
  - The default ceiling is **6 workers** (reviewers are extra, and short-lived) on this 10-core / 16 GB Mac.
  - Check `$O/health.sh` every cycle and move the ceiling towards its suggestion, one step at a time. Don't go above 8.
  - **Lower** the ceiling on memory pressure (free memory under 25%), on e2e flakiness caused by contention (timeouts that pass on retry), or when Playwright waits pile up.
  - **Raise** it when things are healthy and the ready set has room.
- **Work across milestones.** The planner returns any ready WP whose dependencies are done. Contracts sort first. Don't wait for a milestone to finish before starting later ready work.
- **Future work (M8, reading and meter) and soft `After`.** M8 packages carry `After: M6-10`, so the planner's first pass schedules them after M1–M6. Its second pass fills any slots that would otherwise sit idle with packages whose real `Deps` are done, so M8 is pulled forward only when there's spare capacity. The exception is M8-01 (the shared timing engine): it has no `After`, because M6-08 (the F4/D20 rhythm track) depends on it.
- **Usage limits.** If `poll.sh` exits 10, or any agent mentions a usage or rate limit:
  1. Run `node $O/state.mjs set paused '{"since":"<iso>","reason":"usage limit"}'` and `node $O/state.mjs event usage-limit`.
  2. Spawn nothing new. Let in-flight agents finish.
  3. Re-check every ~15 minutes.
  4. Clear it with `node $O/state.mjs set paused null` when agents work normally again.

## 2. The loop

Repeat until the backlog is done or you must stop (§6):

1. **Refill slots immediately.** Compute `free = ceiling − (in-flight workers)`. If `free > 0` and you're not paused:
   ```bash
   busy=$(node $O/state.mjs active)
   node $O/backlog.mjs plan --slots $free --busy "$busy"   # → ["M1-04","M2-01",…]
   ```
   Run `$O/spawn.sh <WP>` for each one. The planner already avoids overlapping **Owns** (including hotspots such as `session/runner.ts`, `storage/db.ts` and `package.json`) with in-flight WPs.
2. **Wait for something to settle.** Don't busy-poll. Do one of these:
   - `herdr agent wait <agent> --timeout 600000` on the agent most likely to finish next;
   - `herdr agent list` / `$O/poll.sh` every few minutes.
   A worker is finished when its agent is `idle`/`done` **and** `.orchestrator/reports/<WP>.md` exists. Its last message is `REPORTED <WP>`.
3. **Handle each settled agent** (§3), then `node $O/state.mjs sample` (the parallelism log) and go back to step 1.
4. **Blocked agents.** If an agent is `blocked`:
   1. Read it: `herdr agent read <agent> --source recent-unwrapped --lines 120`.
   2. Decide. Approve routine tool permissions that fall within the worker brief (running tests, editing files in its worktree). **Deny** anything that would push, deploy, touch `main`, delete outside its worktree, or touch AWS or DNS.
   3. Answer with `herdr agent send-keys <agent> …`, or tell it in a prompt.
   4. Note anything surprising in an event.

## 3. Per-WP pipeline

**a. Worker reports** (agent idle and the report exists):
- If the report says `STATUS: BLOCKED`, read the question. If it's a product decision for the user, add it to `docs/progress.md` → "Questions for the user", mark the WP `blocked` (`node $O/backlog.mjs set-status <WP> blocked` and commit), clean it up, and move on. Otherwise answer it in a prompt to the worker.
- Otherwise run `$O/spawn.sh <WP> reviewer`. It runs **in parallel** with other workers.

**Downstream notes.** Reviewers address issues that belong to later packages under "Downstream notes". `cleanup.sh` copies them to `.orchestrator/notes/<target>.md`, and `spawn.sh` includes them in that worker's brief. Add notes yourself the same way when you learn something a later package needs.

**b. Reviewer finishes** (its agent is idle and `.orchestrator/reports/<WP>.review.md` exists):
- `VERDICT: APPROVE` → close the reviewer pane (`herdr pane close <reviewer pane>`) and run `$O/send-brief.sh <WP> preflight`: quick should-fixes, rebase onto `origin/main` and `pnpm verify:quick`. When it reports, queue it for integration (step c) without re-review if the diff since approval is mechanical.
- `VERDICT: CHANGES` → close the reviewer pane, then `$O/send-brief.sh <WP> fix`. When the worker reports again, spawn a fresh reviewer. If you get exit 7, see §6.

**c. Integrate.** The lane ships **batches**: every queued WP (up to `LANE_BATCH`, default 4) is rebased and merged in order, then verified and shipped once. A WP that conflicts is skipped (`SKIPPED <WP> rebase-conflict`) and the rest still ship. If a batch fails verify, `lane-next.sh` re-runs its WPs one at a time to find the culprit. If the lane is busy (exit 2), queue the WP and come back later.
```bash
$O/integrate.sh <WP>
```
| Exit | Meaning | Action |
|---|---|---|
| 0 | merged, shipped (verify → deploy → smoke), pushed | `$O/cleanup.sh <WP>` and refill the slot |
| 2 | lane busy | retry after the current integration |
| 3 | rebase conflict; main untouched | `$O/send-brief.sh <WP> rebase "rebase conflict with main"`, then re-review if the diff changed a lot |
| 4 | verify failed on main; main reset, nothing shipped | `$O/send-brief.sh <WP> rebase "pnpm verify failed after rebasing onto main; see .orchestrator/logs/<WP>-integrate.log"` |
| 5 | **STOP THE LINE**: deploy or smoke failed after main moved | see below |
| 6 | shipped but the push failed | fix the push (fetch/rebase if someone else pushed docs), then push. Merge nothing else until it's pushed |

**Stop the line (exit 5).** Merge nothing else until production is healthy:
1. Read `.orchestrator/logs/<WP>-integrate.log`, then run `./scripts/smoke.sh`.
2. If it's transient (CloudFront propagation, a network blip), re-run `SKIP_BUILD=1 ./scripts/deploy.sh && ./scripts/smoke.sh`.
3. Otherwise **revert**: `git revert --no-edit <merge range>`, then `pnpm ship`, then push. Send the WP back with `send-brief.sh <WP> rebase "<what broke in production>"`.
4. Record a `stop-the-line` event, and note it in `docs/progress.md` if it took more than one attempt.

**Every merged WP ships.** There are no GitHub Actions. `pnpm ship` runs locally (secret scan → `pnpm verify` → `scripts/deploy.sh` with the `smartthings-hp` profile → `scripts/smoke.sh` against https://fretfree.app, which also checks that www redirects). Only then does `integrate.sh` push `main`. The pre-push hook reuses the verified SHA, so it's instant.

## 4. Shared-resource rules

- One worktree per WP, under `.orchestrator/worktrees/<WP>`, on branch `wp/<WP>`. Workers never touch `main`.
- Each worker gets a port block (`state.mjs alloc-port`, from 5200 in steps of 10). Workers run `PORT=<base> pnpm dev`.
- **Test load is gated, not the agent count.** Agents spend most of their time thinking, which uses no local CPU, so the ceiling follows memory and the slot queue, and tests wait for slots:
  - `pnpm e2e` goes through `scripts/e2e-slot.sh`: a machine-wide lock-dir semaphore with **2** Playwright slots by default (`E2E_SLOTS`), each with its own preview port.
  - The static half of `pnpm verify` (typecheck, lint, unit + coverage, build) goes through `scripts/cpu-slot.sh`: **2** slots by default (`CPU_SLOTS`).
  - The integration lane (`FRETWORK_LANE=1`, set by `integrate.sh`) takes the next free slot ahead of workers (`scripts/slot-lib.sh`), but it gets no extra slot. A reserved third e2e slot made healthy lane tests time out (M1-41, 2026-10-19). It runs 5 Playwright and 6 Vitest workers, against 4 for a worktree check.
  - Vitest and Playwright are capped at 4 workers per run (`VITEST_MAX_WORKERS`, `PW_WORKERS`).
  - If waits dominate, keep the slot counts and let `health.sh` hold the ceiling. Don't raise the slots.
- **The lane is the only full verify.** Workers run `pnpm verify:quick` (`scripts/verify-quick.sh`) for their report and for fix rounds (`--since` the fix brief): every static gate, plus their own e2e specs, or the full suite when the change reaches shared code or registers a new drill. Reviewers run targeted unit tests only. The preflight after APPROVE rebases and runs `verify:quick`. The full `pnpm verify` runs only in the lane, once per batch (user decision, 2026-10-20: rebasing and re-testing had slowed development to a crawl).
- Every worktree shares one pnpm store (the default). `pnpm install --frozen-lockfile --prefer-offline` is fast.
- **Dependency changes:** workers propose them in their reports and don't add them. The user has pre-approved licence-compatible dependencies (MIT/ISC/BSD/Apache-2.0/0BSD), so you can add them without asking. Add them yourself, in a tiny WP-free commit on `main`, shipped through the lane. Then tell in-flight workers to `git rebase main` at their next natural break.
- The backlog's git status only moves `todo → done` (or `blocked`), committed by the lane. In-flight states (`working`, `reviewing`, `fixing`, `integrating`) live in `state.json`, so `main` stays clean.

## 5. Herdr layout

- Workers and reviewers go in **orchestrator-created tabs** named `fretwork-workers-N`, with at most 4 panes per tab (`place_pane` in `common.sh` splits the largest pane along its long side). The tabs are recorded in state. Never put panes in tabs you didn't create, and never take focus (`--no-focus`).
- Agents are named `wp-<wp>` (worker) and `rv-<wp>` (reviewer), e.g. `wp-m1-04`.
- Agents start with `herdr agent start <name> --kind claude --pane <id> -- --permission-mode auto`. Prompts go through `herdr agent prompt`, which `spawn.sh` and `send-brief.sh` call for you.
- **Trust prompt.** A fresh Claude in a new directory may show "Do you trust the files in this folder?", and Herdr then reports `blocked` during startup. `ensure-ready.sh` reads the pane and selects **"Yes, I trust this folder"** only when the cwd is under `.orchestrator/worktrees/`. Anywhere else it refuses (exit 3), and you must surface that to the user. After accepting, it waits for `idle` and applies the agent name.
- Clean up only what you created: `cleanup.sh` closes the WP's recorded worker and reviewer panes. When the backlog is finished or you stop, close the orchestrator tabs listed in state.

## 6. Stop and ask the user

Stop spawning, finish or park in-flight work, and write the situation to `docs/progress.md` → "Questions for the user" (commit and push it) when:

- a WP hits **3 review rounds or 3 failed integrations** (`send-brief.sh` exit 7);
- you hit a product, scope, cost or external-account decision (a new paid service, an App Store account, analytics);
- production can't be restored by a revert + ship;
- a trust prompt appears for a directory outside `.orchestrator/worktrees/`;
- AWS needs anything beyond the `FretworkSite` and `FretworkSync` stacks. FretworkSync (Cognito, HTTP API with Lambda, DynamoDB) was approved by the user on 2026-10-18 for M7. The `FretworkEmail` and `FretworkBrand` stacks belong to the infra session.

## 7. Safety

- Never touch DNS records other than the site's own names (`fretfree.app`, `www.fretfree.app`) and their ACM validation records, which CDK manages. The `fretfree.app` zone also holds the FretworkEmail and FretworkBrand records; leave them to those stacks.
- Never delete AWS resources this project didn't create. Never commit AWS account IDs, zone IDs, ARNs or secrets: the lane runs `scripts/secret-scan.sh` and so does the pre-push hook.
- Push only `main` to `origin`, never force-push, and create no other remotes, repos, GitHub Actions or GitHub secrets.
- Never close panes or tabs you didn't create. Never run `herdr server stop`.

## 8. Reporting

- After each milestone's QA WP, or at least every ~10 merged WPs, update `docs/progress.md` and ship it through a docs commit. Include:
  - what shipped and production status;
  - effective parallelism: from `state.json` `parallelism`, the average and peak active workers, idle-slot share and ceiling changes;
  - incidents (stop-the-line events, usage-limit pauses);
  - open questions.
- Keep messages to the user short: milestone summaries, not play-by-play.

## 9. Operating notes (learned in the first fan-out, 2026-10-18)

- **Context compaction and long runs:** the PM relies on Claude Code's auto-compaction, not a respawn. Keep `.orchestrator/pm-notes.md` (git-ignored) current at every decision: holds, out-of-band WPs, cross-session hand-offs, user decisions and anything the compaction summary might drop. After a compaction, re-read SKILL.md and pm-notes before acting. Always keep exactly one `watch.sh 1800` running, even when nothing is in flight. Its 30-minute timeout is the heartbeat that keeps the PM waking up overnight.
- **The loop in practice:** keep one `watch.sh` running in the background, and kill any stale copy before starting another. On wake: spawn reviewers, send fix briefs, and append approved WPs to `.orchestrator/lane-queue.txt`, marking each one `node $O/state.mjs worker <WP> '{"status":"queued"}'`. `queued` counts as in flight, so `refill.sh` won't re-plan a WP that is waiting for the lane, and `watch.sh` stops waking on it. Keep one `lane-next.sh` running whenever the queue is non-empty. After each ship, run `cleanup.sh <WP> && refill.sh`.
- **Queue only real reports.** A worker that is idle while a background `pnpm verify` runs isn't finished. Check for `REPORTED <WP>` on screen, a clean worktree, and no "shell still running".
- **Rebase drift is the main failure mode.** New drills change what a fresh session serves (e.g. D3 put F1 prompts first, and D2 made answers positions), which breaks specs and tests written earlier. Before a WP joins the queue, make sure it was rebased onto `origin/main` recently, and pre-flight waiting WPs in parallel rather than letting them fail one by one in the serial lane.
- **Rebase onto `origin/main`, never local `main`.** `integrate.sh` fast-forwards local `main` before verify and resets it on failure.
- **Integration failures count towards the cap of 3,** even when the fault is drift. Pre-emptively ask a WP at 2 to rebase before its turn.
- **Hotspots in practice:** `engine/config.ts` (every WP appends a block) and the shared e2e specs and helpers. Expect conflicts there. See the proposals in `docs/progress.md`.
- **Machine:** keep the repo under a path whose last component ends in `.nosync`. iCloud Drive syncs `~/Documents`, and `fileproviderd` churn caused load spikes and `getcwd` EINTR. `health.sh` reacts to load1, so iCloud overhead shows up as a low ceiling.
- **Never edit or commit in the main checkout while the lane runs** (`lane-next.sh`/`integrate.sh`). The lane fast-forwards `main`, runs `set-status`, and commits `docs/backlog.md`, so a stray edit can be swept into its commit or make it reset over yours. Make PM edits between ships, or park them as a patch in the scratchpad.
- **Hold a WP** that must wait for out-of-band work (e.g. a rebrand landing from another session) by filing it as `blocked`, then flip it to `todo`. The planner only picks `todo`.
- **Agent quirks:** a prompt can land without its Enter under load (`prompt_agent` handles it). A macOS Keychain prompt can block new agents (the agent hangs in `SecItemCopyMatching`, and the user must answer the dialog). Dev servers can outlive their panes (`cleanup.sh` kills them).
