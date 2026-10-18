# Handoff brief 2: Build agent

You are the **build agent** ("builder") for Fretwork, an iPad-first guitar-learning PWA (iPhone is best-effort). The foundations are done. Your job is to build M1 → M6, and then the future M8 (reading and meter), by **orchestrating parallel worker agents** with the `fretwork-orchestrator` skill, and to ship to production **continuously** as packages merge.

You run inside a Herdr pane (`HERDR_ENV=1`). You coordinate. Workers write the feature code.

## What exists (M0)

- **Live app:** https://guitar.dwellsee.com. It is a PWA with offline precache, and `scripts/smoke.sh` passes against it.
- **Code** (`app/src`; see `CLAUDE.md` for the architecture):
  - pure `theory/` and `engine/`, with FSRS scheduling, speed-aware grading, the session builder, adaptive scope, mastery and guide fading;
  - Dexie `storage/` (schema v1, including the gamification tables);
  - the drill plugin interface, with D1 "Name the highlighted note" fully working;
  - the iPad-first shell with size classes and the `<Fretboard>` SVG.
- **Registries are one file per entry**:
  - skills: `engine/skills/<topic>.ts`;
  - drills: `drills/<id>/drill.ts`.
  M1-01 extends the same pattern to routes, Today cards, Progress panels, Explore views and onboarding steps.
- **Quality gate:** `pnpm verify` runs typecheck, lint, format, unit tests with coverage thresholds, infra tests, build, and Playwright on iPad Pro 11 landscape/portrait and iPad mini landscape, plus an iPhone `@smoke` project.
- **Delivery (all local; no GitHub Actions, ever):**
  - `pnpm ship`: secret scan → verify → `scripts/deploy.sh` (AWS profile `smartthings-hp`, CDK stack `FretworkSite` in us-east-1) → `scripts/smoke.sh`.
  - The pre-push hook verifies the pushed SHA in a clean worktree. It reuses SHAs that ship has already verified.
  - GitHub (`origin`, public, MIT) is just a git remote.
- **Planning:** `docs/backlog.md` has 100 work packages (M1–M6 plus the future M8), each with deps, explicit **Owns** (file ownership), optional soft **After** ordering, and acceptance criteria.
- **Orchestration:** `.claude/skills/fretwork-orchestrator/` holds `SKILL.md`, scripts and brief templates. It was exercised end to end on M1-01 and M1-02; see `docs/progress.md`.

## Read first

1. `CLAUDE.md`
2. `.claude/skills/fretwork-orchestrator/SKILL.md`. Follow it exactly. Also read `~/.claude/skills/herdr/SKILL.md`.
3. `docs/design/app-design.md`, especially §3 (engine and gamification, §3.7), §6 (drills), §7 (iPad-first layout) and §11 (roadmap).
4. `docs/research/02-learning-science.md`. **The design rules are normative**, and the reviewers enforce them.
5. `docs/backlog.md` and `docs/progress.md`.

## How to run

Invoke the **fretwork-orchestrator** skill and run its loop:

1. Preconditions and resume (§0). `.orchestrator/state.json` may already hold the dry-run's history.
2. **Phase serial.** M1-01 and M1-02 are the contract packages. If they're already `done`, switch straight to **fan-out**: `node $O/state.mjs set phase '"fanout"'`, then set the ceiling to 6.
3. **Fan out and maximise parallelism.** The user wants the usage allowance used to the full:
   - Keep every slot busy. Refill as soon as a worker finishes; don't batch.
   - Run reviewers in parallel with workers.
   - Adjust the ceiling dynamically with `health.sh`: default 6, at most 8. Lower it on memory pressure, e2e contention flakiness or usage limits.
   - Back off on usage-limit signals (pause spawns, let in-flight work finish, resume later).
4. **Work across milestones in parallel** wherever dependencies allow. The milestone order **M1 → M2 → M3 → M4 → M5 → M6** is a priority order, not a sequence of gates. For example, M2-01, M3-01, M4-01, M5-01, M3-07 and M4-06 have no M1 dependencies and can run alongside M1 work. Prefer lower milestones when slots are scarce. The planner already sorts contracts first.
5. **M8 (future: reading standard notation and time signatures)** is in scope after M6. See design §12, research/03 Tracks R and T, and drills D22–D32. Its packages use a soft `After: M6-10`, so by default they follow M1–M6. The planner pulls them forward when slots would otherwise be idle and their real dependencies are met: use the spare capacity, but never at the expense of ready M1–M6 work. M8-01 (the shared timing engine) isn't deferred, because the M6 rhythm track (M6-08) builds on it. M8-02 adds VexFlow (MIT, pre-approved).

## Deployment expectations

- **Every merged work package ships.** The integration lane (`integrate.sh`) is serialized: rebase → fast-forward `main` → mark done → `pnpm ship` (verify, deploy to AWS, smoke-test https://guitar.dwellsee.com) → push `main`.
- **A broken ship stops the line.**
  - A failed verify resets `main`, and nothing is shipped.
  - A failed deploy or smoke test means production may be broken. Merge nothing else until it's fixed or reverted and re-shipped (SKILL §3c).
- At each milestone QA package (M1-24, M2-14, M3-12, M4-11, M5-08, M6-10, M8-23):
  - run a Playwright screenshot pass against production on the iPad profiles (primary) and the iPhone profile (`pnpm --filter app e2e:prod` for smoke, plus the QA WP's own spec);
  - update `docs/progress.md` with what shipped, production status, the parallelism log and incidents.
- Never add GitHub Actions, OIDC roles or GitHub secrets. Never commit AWS account IDs, zone IDs or ARNs.

## When to stop and ask the user

Write the question under **"Questions for the user"** in `docs/progress.md`, commit and push it, then pause the affected work (continue with other ready packages if you can) when:

- a package fails 3 attempts;
- a product, scope or cost decision comes up, such as a paid service, an App Store or Apple developer account, analytics, or changing the design rules;
- production can't be restored by revert + ship;
- AWS needs anything beyond the `FretworkSite` stack, or DNS beyond `guitar.dwellsee.com`;
- a trust prompt appears outside `.orchestrator/worktrees/`;
- you would need to force-push, create repos or remotes, or delete resources this project didn't create.

**M7 (Capacitor, sync, Web Push, leagues) is out of scope.** Ask before starting it.

## Done means

- Every M1–M6 and M8 package is `done` and live in production, with `pnpm verify` green on `main`.
- `docs/progress.md` has a final summary, including the effective parallelism achieved.
- The orchestrator tabs and worktrees are cleaned up.
