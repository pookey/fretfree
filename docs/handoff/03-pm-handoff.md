# Handoff brief 3: Fresh PM (build agent, second shift)

You are taking over as the **build agent / project manager** for Fretwork. The previous PM ran the first fan-out on 2026-10-18 and handed over because its context was full. **`docs/handoff/02-build-brief.md` still defines the job:** build M1 → M6, then M8 and the new M9, by orchestrating Herdr workers with the `fretwork-orchestrator` skill, and ship every merged package. This brief covers only what has changed since then.

## Where things stand

- **Repo location:** the repo now lives at `…/Projects.nosync.noindex/guitar.nosync`. It was renamed from `guitar` so iCloud Drive skips it: iCloud only honours names that *end* in `.nosync`. Never move it back under a synced name.
- **Live:** https://guitar.dwellsee.com (moved to https://fretfree.app later on 2026-10-18; the old name is an alias with a "moved" notice). `main` is shipped and pushed, and `pnpm verify` is green.
- **Done (23 WPs):** M1-01 to M1-14, M1-16, M1-19, M1-25, M1-26, M2-01, M3-01, M4-01, M5-01 and M6-01. Check `node .claude/skills/fretwork-orchestrator/scripts/backlog.mjs list`. M1-24 (M1 QA) has notes waiting: the M1-19 review should-fixes are in `.orchestrator/notes/M1-24.md`.
- **In flight at handoff:** none. The previous PM drained all work in progress, so there are no worktrees or orchestrator tabs. Any WP that was mid-flight and not shipped is back to `todo` (its branch `wp/<WP>` may still exist; `spawn.sh` reuses it).
- **Paused:** `.orchestrator/state.json` has `paused` set ("handoff"). Clear it when you start: `node $O/state.mjs set paused null`.
- **Ceiling:** start at 6 and follow `refill.sh`/`health.sh`. With iCloud out of the way, load should stay much lower than in the first shift.

## New since the build brief

1. **User feedback became packages:**
   - **M1-25** (hotfix, live): a recall prompt must never show its answer. `<Fretboard>` doesn't label a `target` marker by guide level.
   - **M1-26** (live): the onboarding reading question is now "can read" / "want to learn" (`settings.reading.{reads,learn}.{tab,staff}`).
   - **M9** (new milestone): tab reading, M9-01 to M9-06. The user chose to back "learn to read tab" with real lessons. It's in normal priority order, ahead of the deferred M8. Every M1–M6 and M8 package plus M9 is in scope for "done".
2. **New skill scripts** (see `SKILL.md` §9 for the operating loop): `watch.sh` (wake-up), `lane-next.sh` and `.orchestrator/lane-queue.txt` (ordered ship queue), and `refill.sh`.
3. **Rules learned the hard way** (also in `SKILL.md` §9 and `docs/progress.md`):
   - Workers rebase onto **`origin/main`**, never local `main`.
   - Pre-flight queued WPs against the latest `origin/main`. New drills change what sessions serve and break older specs.
   - Queue a WP only on a real `REPORTED` with a clean tree and no background verify running.
   - `engine/config.ts` and the shared e2e specs and helpers are conflict hotspots.
4. **Open proposals for you to act on** (from `docs/progress.md`):
   - Split `engine/config.ts` into one file per area (a small contract WP, best done early).
   - Make the shared e2e specs and helpers orchestrator-owned.
   - M1-22's acceptance still says "notation". It should be the M1-26 `reading` settings (a downstream note is queued in `.orchestrator/notes/M1-22.md`).

## Start here

1. Read `CLAUDE.md`, `.claude/skills/fretwork-orchestrator/SKILL.md` (including §9), `docs/progress.md`, then this file.
2. Preconditions (SKILL §0): run `node $O/state.mjs show`, `$O/poll.sh` and `git status`. Expect no workers.
3. Run `node $O/state.mjs set paused null`, then `$O/refill.sh`, and start `$O/watch.sh` in the background.
4. Keep the user updated with short milestone summaries. Questions go under "Questions for the user" in `docs/progress.md`.
