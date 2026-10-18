# Handoff brief 1: Foundations agent

You are the **foundations agent** for "Fretwork" (working title), an **iPad-first** guitar learning PWA. iPhone should keep working but is best-effort. See the "Device priority" note and the §7 layout system in the design doc. The research and design are done. Your job is to:

1. set up the project,
2. build the framework (M0),
3. write an **agent orchestration skill** that uses **Herdr** to manage worker sessions,
4. hand off to a **build agent** that uses that skill to build and deploy the app.

## Read first (required)

- `docs/design/app-design.md`: the source of truth for the product, tech stack, engine, drills and roadmap
- `docs/research/02-learning-science.md`: the design rules are normative
- `docs/research/03-curriculum.md`: the topic IDs and drill ideas
- `docs/research/01-existing-apps.md`: library choices and licence constraints (no GPL dependencies)
- The Herdr skill at `~/.claude/skills/herdr/SKILL.md`. You are running inside a Herdr pane (`HERDR_ENV=1`).

## Environment facts

| Item | Value |
|---|---|
| Repo | this folder, `main` branch. **Public open-source repo** at github.com/pookey/fretwork (`origin`, MIT). Push `main` after each logical commit. Never force-push `main`. Don't create other remotes or repos. |
| Toolchain | Node 22, pnpm, bun, gh, Xcode CLI present; AWS CLI v2 |
| AWS | profile **`smartthings-hp`** (default region eu-west-1). The account ID comes from the profile at runtime; **never commit it** |
| Domain | **`guitar.dwellsee.com`**. Route53 hosted zone `dwellsee.com` exists in that account; look it up by domain name at deploy time and **never commit the zone ID**. There is currently no `guitar` record. **Never modify other records in that zone.** |
| CDK | not installed globally. Use it as a dev dependency (`pnpm exec cdk`). Bootstrap the account/region if needed. CloudFront's ACM certificate must be in **us-east-1**; the simplest option is to put the whole stack in us-east-1. Tag everything `Project=guitar`. |

## M0 deliverables

### 1. Repo structure

pnpm workspace:

```
app/            Vite + React 19 + TS strict PWA
infra/          AWS CDK (TS): S3 private bucket + CloudFront (OAC) + ACM + Route53 alias (A/AAAA)
packages/       optional: theory/engine as internal packages if it helps testing
scripts/        deploy.sh (build → cdk deploy → s3 sync → CloudFront invalidation), smoke.sh
docs/           existing docs, plus a backlog (see 5)
.claude/skills/ the orchestration skill
```

Use sensible cache headers: hashed assets immutable; `index.html` and the service worker no-cache.

### 2. Tooling

- ESLint and Prettier, Vitest, Playwright (primary: iPad Pro 11" landscape + portrait, iPad mini landscape; secondary: iPhone 15 landscape smoke only).
- A single **`pnpm verify`** command (typecheck + lint + unit + e2e) as the quality gate.
- Write a concise `CLAUDE.md` describing conventions, commands, architecture and the "design rules are normative" principle.

### 3. Framework code (real and tested, not stubs)

- **App shell (iPad-first):** 4 sections (Today / Learn / Explore / Progress). Width-based size classes per design §7: a sidebar plus context panel at regular-wide; a bottom tab bar at compact. Safe areas, dark-first design tokens, hardware-keyboard shortcuts.
- **PWA:** manifest, icons (placeholder is fine), vite-plugin-pwa offline precache, update toast.
- **`fretboard-model`:** pure functions mapping (string, fret) ↔ note, finding positions, octave shapes, and CAGED/triad shape generation stubs. Use tonal and exhaustive unit tests.
- **`<Fretboard>` SVG component** per design §8: handedness, fret window, markers, guide levels, ≥44pt hit cells, tap events.
- **Learning engine core:**
  - ts-fsrs wrapper
  - grading (correctness + RT → rating, design §3.2)
  - skill/item/card model
  - session builder skeleton (due + new + interleave, design §3.3)
  - adaptive-scope controller
  - mastery rule
- **Dexie storage** with the schema in design §3.6, migrations, and export/import.
- **Drill plugin interface** (design §6), with **D1 "Name the highlighted note"** fully working end-to-end as the reference implementation:
  - a session using real FSRS scheduling and persistence
  - full e2e tests on the iPad profiles, plus an iPhone smoke test
- **Audio:** a minimal Tone.js note playback, lazy-loaded and unlocked on first tap.

### 4. Infra and first deploy

- Deploy the skeleton to **https://guitar.dwellsee.com** with `scripts/deploy.sh` using `AWS_PROFILE=smartthings-hp`.
- Verify it with `scripts/smoke.sh`: an HTTPS 200, a valid certificate, and the manifest served. This proves the pipeline before the build agent relies on it.

### 5. Backlog

Turn the roadmap (design §11, M1–M6) into **`docs/backlog.md`**: small, independently buildable work packages. Each package has:

- an ID (e.g. `M1-03`)
- a title
- dependencies
- acceptance criteria
- the files/areas it touches, so the orchestrator can parallelise without conflicts
- status

### 6. The orchestration skill: `.claude/skills/fretwork-orchestrator/SKILL.md`

A project skill (plus any helper scripts or templates next to it) that a build agent follows to develop and deploy the app using **Herdr to manage sessions**. It must cover:

**Session management via Herdr** (follow the Herdr skill's rules):
- Verify `HERDR_ENV=1`.
- Create worker panes with `herdr pane split … --no-focus` (sibling panes, sensible geometry). A dedicated tab is fine if it is created by the orchestrator itself.
- Start workers with `herdr agent start <name> --kind claude --pane <id> -- --permission-mode auto`.
- Give tasks with `herdr agent prompt … --wait`.
- Monitor with `agent get/read/wait`.
- Handle `blocked` states by reading, then deciding.
- Clean up only panes the orchestrator created.

**Isolation:** one git worktree and branch per work package (e.g. `herdr worktree create --branch wp/M1-03 …`, or `git worktree`). Workers never touch `main` directly.

**Planning:** read `docs/backlog.md`, select ready packages whose dependencies are done and whose file areas don't conflict, and keep a concurrency cap (default 3 workers).

**Worker brief template:** includes the package's acceptance criteria, the relevant design sections, the "design rules are normative" reminder, the requirement to write tests, a requirement to run `pnpm verify` before reporting, and a fixed output contract: write a report to `.orchestrator/reports/<WP>.md`.

**Review:** a fresh reviewer agent (or a `/code-review` run) per package before merge. Check against the acceptance criteria and the learning-science rules. Loop fixes back to the worker.

**Integration:** merge into `main` (rebase or merge), run `pnpm verify` on main, update backlog status, and commit with a clear message.

**Deploy:** after each milestone, or on request, run `scripts/deploy.sh` then `scripts/smoke.sh`. Optionally take a Playwright screenshot pass on the iPhone and iPad profiles against production.

**State and resumability:** keep orchestrator state in `.orchestrator/state.json` (git-ignored), recording active workers, panes, branches and statuses, so a new orchestrator session can resume after a crash or context reset.

**Safety:**
- Never touch DNS records other than `guitar.dwellsee.com`.
- Don't push to remotes, create GitHub repos, or delete AWS resources not created by this project without the user's approval.
- Don't close panes or tabs it did not create.
- Stop and surface to the user after repeated failures (e.g. 3 failed attempts on a package).

**Reporting:** a short status summary after each milestone, written to `docs/progress.md`.

**Test it:** dry-run the skill on one small real package (e.g. `M1-01`) to prove spawn → work → review → merge works, then fix any rough edges in the skill.

## Definition of done (foundations)

- `pnpm verify` passes on `main`. Everything is committed in logical commits (use the commit attribution the harness gives you).
- The skeleton is live at https://guitar.dwellsee.com and the smoke test passes.
- `docs/backlog.md`, `CLAUDE.md` and `.claude/skills/fretwork-orchestrator/` exist, and the skill has been exercised once.

## Then hand off to the build agent

1. Write **`docs/handoff/02-build-brief.md`** for the build agent. It should cover:
   - what exists
   - how to invoke the orchestration skill
   - the milestone order (M1 → M6)
   - deployment expectations (deploy and smoke-test after each milestone)
   - when to stop and ask the user
2. Start the build agent in a **new sibling Herdr pane** (split your own pane with `--no-focus`, preserving cwd):
   ```bash
   herdr agent start builder --kind claude --pane <new-pane-id> -- --permission-mode auto
   herdr agent prompt builder "Read docs/handoff/02-build-brief.md and follow it. Use the fretwork-orchestrator skill to build and deploy the app, starting with M1."
   ```
3. Confirm it has started working (`herdr agent get builder` shows `working`). Then write a short final summary to `docs/progress.md` and end your turn.

## Open-source hygiene (public repo)

- **MIT licence.** All dependencies must be licence-compatible: MIT/ISC/BSD/Apache/0BSD; no GPL or AGPL.
- **Never commit:** AWS account IDs, hosted-zone IDs, ARNs containing the account ID, credentials, `.env` files, or personal data.
  - CDK gets the account from the `smartthings-hp` profile at runtime (`CDK_DEFAULT_ACCOUNT`) and looks up the zone by domain name.
  - `cdk.context.json` caches lookups containing the account ID, so it is git-ignored.
- **Put the public domain in config, not code.** The domain `guitar.dwellsee.com` and the profile name may appear in docs and config, but read them in `deploy.sh` from env vars with those defaults, so forks can deploy their own copy.
- Before each push, run a quick secret scan, e.g. `git diff origin/main..HEAD | grep -E` for 12-digit account IDs, `Z0[0-9A-Z]{10,}` zone IDs, and `AKIA` keys. Make this a check in the orchestration skill's integration step.
- Add a good public `README.md`: what the app is, the learning-science approach, a link to the live app, how to run and deploy it yourself, and a contributing note.
- **No CI that needs secrets.** A GitHub Actions workflow that runs `pnpm verify` on push and PRs is welcome. Deploys stay local through `scripts/deploy.sh`.

## Principles

- **The design rules in research/02 are normative.** If a requirement conflicts with them, the rules win; note the deviation in `docs/progress.md`.
- Prefer small, well-tested, readable modules. Theory and engine are pure TypeScript with high test coverage.
- If you hit a decision that is genuinely the user's (cost, external accounts, scope changes), record it in `docs/progress.md` under "Questions for the user" and continue with a sensible default where safe.
