# Handoff brief 5: fresh PM (fourth shift)

You are taking over as the **build agent / project manager** for FretFree (code name Fretwork). The third-shift PM ran from 18:00 on 2026-10-18 to about 07:00 on 2026-10-19, overnight included, and is handing over so a fresh context runs the loop. **`docs/handoff/02-build-brief.md` still defines the job.** Brief 4 (`04-pm-handoff.md`) has the earlier context.

## Start here

1. Read `CLAUDE.md`, `.claude/skills/fretwork-orchestrator/SKILL.md` (§0 and §9 especially) and **`.orchestrator/pm-notes.md`**. pm-notes is the PM's durable working memory: loop mechanics, cross-session protocol, user decisions, learned rules. It isn't in git. Keep it current.
2. Invoke the `fretwork-orchestrator` skill and run the SKILL §0 preconditions: `node $O/state.mjs show`, `$O/poll.sh`, `git status`. **Four workers are in flight. Resume them. Don't respawn them** (see below).
3. Start exactly one `$O/watch.sh 1800` in the background, and always start it with `pkill -f fretwork-orchestrator/scripts/watch.sh;` in the same command. Its 30-minute timeout is your heartbeat.
4. Tell the other sessions you're the new PM (see "Cross-session").

## Where things stand (07:00, 2026-10-19)

- **Live:** https://fretfree.app. **77 WPs are done.** `main` equals `origin/main`, and the lane is idle with an empty queue.
- **First-load JS is 231.8 KB of the 250 KB budget.** M3-16 and M3-18 made Explore views, drill views, worked examples, onboarding, placement, About and Privacy lazy. New drills follow M3-18's contract: `drills/<id>/views.ts` plus `lazyParts`, and no static import of a view in `drill.ts`. `drills/lazy-view.test.tsx` enforces it.
- **In flight:**

| WP | State | Next step |
|---|---|---|
| M2-22 (D5 widest scope on iPad mini) | approved; rebasing onto M3-18 | When it reports with a clean pre-flight on origin/main, queue it without re-review. |
| M3-17 (chord tones in stages, a user request) | approved; doing a one-line should-fix (`C5.tones-fifths` in the c5-root-first example) and rebasing onto M3-18 | Same as above. |
| M3-13 (D36 "What chord is this?") | working | Normal pipeline. |
| M3-14 (D37 "Chord tones across the neck") | working | Normal pipeline. |

- The ceiling follows `health.sh` and has ranged from 1 to 4 because of load. User-requested WPs may be spawned over the ceiling; record a `user-request` event when you do.

## Cross-session

- **`guitar-nosync-57`** owns domain, email and brand infra. It hands commits over on branch `fretfree-domain`. Nothing is pending from it.
- **`guitar-nosync-f6`** is a user-directed feature session. It hands work over as a branch. Run the out-of-band WP flow in pm-notes: create `wp/<WP>` at its SHA, then the worktree and a state entry with `agent:null`, write the report yourself, spawn a reviewer, relay findings by SendMessage, then queue. Neither session commits to main. If you find stray edits in the main checkout, ask the owner to move them; don't touch them.
- Reply with `SendMessage` to their names and send the main SHA after shipping. Use `ListAgents` if a name doesn't resolve.

## Open user questions

- **Placement time budget** (`docs/progress.md`, under Questions for the user): onboarding placement can no longer reach C4 flat keys within 180 s. The recommended default is (a), accept it, because test-out covers the gap. Nothing is blocked.
- Everything else is answered: M7 is approved (FretworkSync: Cognito, API with Lambda, DynamoDB), and the DNS names are only `fretfree.app` and `www.fretfree.app`.

## Next up in the backlog

- **M7-02** (the FretworkSync stack) is ready. Its first ship deploys new AWS resources through `pnpm ship`, which is approved. If deploy or smoke fails, stop the line (SKILL §3). Don't retry infra blindly.
- Remaining M3: M3-15 (D38), M3-12 (M3 QA). Also M1-41 (D39 neck on iPad mini). Then M4 onwards.
- Backlog idea to file: a separate D10 chain item kind, so "which comes next?" reps don't lift the answer shape's card (from the M3-06 review).

## Rules learned this shift (all in SKILL §9 or pm-notes)

- **Never run `refill.sh` while `integrate.sh` runs.** It now refuses (55e4051). Mid-integration, local main already marks the WP done.
- **`spawn.sh` cuts from `origin/main`** (381820a). The lane fast-forwards local main mid-integration.
- **Downstream notes:** `cleanup.sh` now accepts reviewers' format drift and fans a note out to every WP named before the colon (34267e7, 115d8bc). Dropped notes were backfilled into the 19 open WPs.
- **`focusSession` waits for the session to start** (32bf018). Specs that step a fake clock right after starting a session lost the first minute under load (M1-24, M1-30, M2-03).
- **`e2e-slot.sh` stops orphaned `vite preview` processes** that hold a slot's port (cc697f7).
- **Lane flakes:** if a lane verify fails in a test the WP doesn't own, diagnose it. Fix it on main in a tiny commit while the lane is idle (for example a727cf4: a 90 s timeout on D10's 3,600-prompt property test), reset the WP's `integrationFailures`, log a `flake` event, and re-queue.
- **Pre-flight before queuing:** on APPROVE, send one prompt for the cheap should-fixes plus `git fetch && git rebase origin/main` plus verify. Queue without re-review if the diff is mechanical. Most drift was caught this way.
- **Write learning-science deviations into `docs/progress.md`**, under "Decisions and deviations" (M2-15 retake, M2-16 test-out).
- Bash runs in zsh. `[[ ... == ... ]]` and unquoted globs can break, so put multi-line prompts in a scratch script and run it with `bash`.

## Shipped this shift (36 WPs, 2026-10-18 18:00 to 2026-10-19 07:00)

See `docs/progress.md` (the third-shift and overnight reports). Overnight: M1-31, M1-33, M2-14 (M2 QA), M1-36, M2-18, M2-15, M2-17, M2-20, M2-19, M1-39, M1-38, M2-16, M1-40, M3-04, M2-21, M3-08, M3-16, M3-06, M3-10, M3-09, M3-11, M3-18.
