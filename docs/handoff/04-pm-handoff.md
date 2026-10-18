# Handoff brief 4: Fresh PM (third shift)

You are taking over as the **build agent / project manager** for the app, now branded **FretFree** ("Fretwork" survives only as the internal code name). The previous PM ran the second shift on 2026-10-18 and handed over because its context was full. **`docs/handoff/02-build-brief.md` still defines the job**, and `docs/handoff/03-pm-handoff.md` has the earlier changes. This brief covers what changed in the second shift.

## Start here

1. Read `CLAUDE.md`, `.claude/skills/fretwork-orchestrator/SKILL.md` (especially §9, which gained several rules this shift) and `docs/progress.md`, then this file.
2. Invoke the `fretwork-orchestrator` skill and run the SKILL §0 preconditions: `node $O/state.mjs show`, `$O/poll.sh`, `git status`. **Four workers are in flight. Do not respawn them.** Resume them (see below).
3. Start `$O/watch.sh` in the background and carry on with the loop. There's no pause to clear.
4. **Write the progress report first.** `docs/progress.md` was last updated after 9 ships. About 13 more WPs have shipped since then, along with the domain move and the rebrand (see "Shipped this shift").

## Where things stand

- **Live:** https://fretfree.app (the apex). `www.fretfree.app` 301s to it. The previous domain is retired (see "Cross-session work").
- **Done: 41 WPs.** Run `node $O/backlog.mjs list --status done`. `main` is shipped and pushed. The lane is idle with an empty queue.
- **In flight** (worker panes are in Herdr tabs `fretwork-workers-*`; reviewer panes are all closed):

| WP | State | Notes |
|---|---|---|
| M2-09 placement test | fixing | Integration failure 1/3: drift. D5 and D6 made the placement test probe C3 intervals, so its "expert answers" spec threw `Unexpected probe: interval:…`. It's rebasing. Review round 1/3 was used on a real flaw (a mastered skill hid a missed item). It was approved before the drift, so after it reports, a quick check plus queuing is enough unless the diff grew. |
| M3-02 C4 + D7 "Spell it" | fixing | Review round 1/3. At scope 0, the choices for a degree card were all the same pitch (enharmonic twins only). |
| M1-28 hotfix: feedback/Continue always on screen | fixing | **User-reported** (an iPad had to scroll to reach Continue). Review round 1/3: the wrong-answer text on `--bg-raised` is 4.08:1 in dark mode and needs ≥4.5:1. Ship it as soon as it's approved, at the front of the queue. |
| M1-29 "Add to Home Screen" step + Today card | working | **User request.** First onboarding step, because a Home Screen app on iOS doesn't share Safari's storage. It was told that MovedNotice is being deleted and that Settings is moving to its own page. |

- **Ceiling:** `health.sh` has stepped it down to 1, because load (35–45) comes partly from the other session's verify and Lighthouse runs. Follow `refill.sh`. For user-requested work, spawning one over the ceiling is fine (record an event).

## Cross-session work: the infra/brand session (`guitar-nosync-57`)

Another Claude session owns domain, email and brand infra for the user. It **never pushes to main**. It hands you commits on its branch `fretfree-domain` (worktree `../guitar-fretfree.nosync`) and asks you to land them in a lane gap. For each hand-off: review the diff, `git cherry-pick` or `--ff-only` onto main **while the lane is idle**, run `pnpm ship && git push origin main`, then message it the SHA. Reply to it with `SendMessage` to `guitar-nosync-57`; check `ListAgents` if the name doesn't resolve. Tell it you're the new PM.

- **Landed this shift:** the FretworkEmail stack (SES on fretfree.app, sending from eu-west-1 with production access), the FretworkBrand preview (brand.fretfree.app), the move to fretfree.app (with an s3-sync deploy bug fixed in `a7868e4`), and the FretFree rebrand (palette, Clear Sans, mark, copy).
- **In progress there now** (user requests, coming to you to land):
  1. Retire the previous domain completely: the alias, certificate SAN and records, MovedNotice/`MOVED_HOSTS`, `SITE_ALIAS_DOMAINS`, and docs. It's a single plain `pnpm ship`, with no lane pause needed. When it lands, check that SKILL.md §7's DNS rule lists only `fretfree.app` and `www.fretfree.app` (plus ACM validation).
  2. A `/privacy` page, linked from About and Settings.
  3. Settings becomes its own `/settings` page and nav entry (five sections), with "Your data" moved there. Design §7 is updated.
  - Overlaps: `m1-07.spec.ts` (M2-09 and M1-29 also edit it) and AppShell (M1-29 owns `AppShell.tsx`; the other session edits `AppShell.module.css`, routes and nav). Whoever lands second rebases.

## Open user questions

- **M7 (accounts and sync), all 7 WPs are `blocked`.** (a) New AWS services: the infra session *reports* the user wants a hosted multi-user version, but the user hasn't told the PM directly, so keep it blocked until they do. (b) Email sender: answered (`no-reply@fretfree.app`, "Fret Free"; M7-02's acceptance has the wiring). (c) Privacy copy: the new `/privacy` page partly answers it. M7-06 extends it.
- **The DNS safety rule** was widened to the new domain because production depended on it. The user never explicitly confirmed it. Mention it in your first summary.

## Shipped this shift (for the progress report)

M2-02, M2-04, M9-01, M1-15, **M1-27** (user: D3 says "note", tap the neck), M2-07, M1-17, M1-20, M1-22, M2-03, M2-05, M2-08, M2-11 (`focusSession`), M2-06, M2-10, M2-12, M2-13, M1-18. Also the config split, the domain move and the rebrand. User requests logged: chord lessons (M3-04 widened, M3-13 to M3-15), M7 accounts and sync (blocked), M1-28, M1-29. The event log in `.orchestrator/state.json` has the parallelism, flakes and failures.

## Rules learned this shift (most are in SKILL §9 now)

- **Never edit or commit in the main checkout while the lane runs.** `integrate.sh` commits `docs/backlog.md`. Park edits as a patch in your scratchpad.
- **Mark approved WPs `queued`** (`state.mjs worker <WP> '{"status":"queued"}'`). It's in-flight for the planner but doesn't use a worker slot.
- **Pre-flight drift with a direct `prompt_agent`** (set the status to `fixing` and clear `reviewer`), not `send-brief.sh rebase`, which counts against the cap of 3.
- **Specs must start sessions with `focusSession`** (in the worker brief). Drift from new drills was the top cause of lane failures.
- **Lost briefs:** `prompt_agent` now resends once. Still check that a new agent left `idle`, because an empty input box means the brief never landed.
- **If `lane-next.sh` is killed** (exit 144), `integrate.sh` may still be running as an orphan. Wait on its PID, then clear its WP from the queue and handle its exit by hand. Read the log and `state.json`.
- **Brand rules** (in the worker brief): "FretFree" in copy, `--accent-fill` for buttons, `--root` for theory marks, and no brand yellow on the neck.
- **Test timeouts** were raised (Vitest 20 s, Testing Library 5 s) for verify under load. If e2e starts timing out, lower the ceiling.
