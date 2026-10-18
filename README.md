# Fretwork

**Learn the guitar fretboard the way memory actually works.**

Fretwork is a free, open-source, iPad-first guitar learning app (an installable PWA; iPhone works too). It teaches:

- where every note is on the fretboard
- intervals and octave shapes
- chord construction and the CAGED system
- diatonic harmony, Roman numerals and common progressions
- ear skills

**Try it:** https://guitar.dwellsee.com. On an iPad, open it in Safari and choose *Share → Add to Home Screen*. It works offline.

## Why it's different

Most fretboard apps are flashcard toys or visualisers. Fretwork is built on the learning-science findings that hold up best ([research notes](docs/research/02-learning-science.md)):

- **Spaced retrieval.** Every note, interval and shape is its own card, scheduled with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), the scheduler behind modern Anki.
- **Speed is part of knowing.** Answers are timed against a personal target calibrated to your own tap speed. A slow correct answer counts as "Hard", not "Good".
- **Interleaving.** Easily confused pairs (E/F, B/C, major/minor, CAGED C vs A) are mixed on purpose.
- **Adaptive difficulty.** Scope widens or narrows to keep you at roughly 80–90% accuracy.
- **Fading guidance.** Labels and dots fade as you improve, so you don't end up depending on them (the "Fretlight effect").
- **Habit without dark patterns.** Duolingo-style streaks, a daily goal and XP, wired only to behaviour that helps you learn. No hearts, and no punishment for mistakes.
- **Local-first and private.** No account, no analytics. Your data stays on your device, with JSON export and import.

We don't personalise by "learning styles", because the evidence doesn't support it. Fretwork adapts to what you know and what you want to play.

## Status

Early development. The foundations are in place: the app shell, the fretboard model and SVG neck, the FSRS learning engine, local storage, and the first drill ("Name the highlighted note"). See the [roadmap](docs/design/app-design.md#11-roadmap-and-milestones), the [backlog](docs/backlog.md) and [progress](docs/progress.md).

## Run it locally

You need Node 22+ and pnpm.

```bash
pnpm install          # also installs the pre-push git hook
pnpm dev              # http://localhost:5173
pnpm verify           # typecheck, lint, format check, unit tests (with coverage), e2e
```

The e2e tests use Playwright on iPad Pro 11" (landscape and portrait), iPad mini (landscape) and iPhone 15 (smoke tests only). Install the browsers once with `pnpm --filter app exec playwright install webkit`.

## Host it anywhere

The app is a static site with no backend: progress lives in the browser's IndexedDB. Build it and serve `app/dist` from any static host (nginx, Caddy, GitHub Pages, Netlify, a Raspberry Pi):

```bash
pnpm install && pnpm --filter app build   # outputs app/dist
pnpm --filter app exec vite preview --host  # or point any web server at app/dist
```

Two requirements: serve it over HTTPS (or `localhost`) so the service worker and offline mode work, and send unknown paths to `index.html` so routes like `/progress` load. No AWS, account or email setup is needed. Optional email sign-in and multi-device sync are extras of the hosted version.

## Deploy your own copy on AWS

Fretwork is a static site on AWS: a private S3 bucket behind CloudFront, with an ACM certificate and Route53 records, all defined with CDK in [`infra/`](infra). Everything runs from your machine. There is no hosted CI.

```bash
export AWS_PROFILE=your-profile           # default: smartthings-hp
export SITE_DOMAIN=guitar.example.com     # default: guitar.dwellsee.com
export HOSTED_ZONE_DOMAIN=example.com     # an existing Route53 public hosted zone
pnpm --filter infra exec cdk bootstrap    # once per account, in us-east-1
pnpm ship                                 # verify → build → deploy → smoke test
```

`pnpm ship` refuses to run on a dirty tree. The stack lives in us-east-1 because CloudFront certificates must. The account comes from your AWS profile at runtime, and the hosted zone is looked up by name. No account-specific values live in the repo.

## Project layout

```
app/       Vite + React 19 + TypeScript PWA
  src/theory/    pure fretboard and music theory (tonal)
  src/engine/    FSRS scheduling, grading, session builder, mastery
  src/storage/   Dexie (IndexedDB) schema, migrations, export/import
  src/drills/    drill plugins (D1 "Name the highlighted note", …)
  e2e/           Playwright tests
infra/     AWS CDK stack
scripts/   deploy, smoke test, ship, secret scan, git hooks
docs/      research, design, backlog, progress
```

## Contributing

Issues and pull requests are welcome. Please:

- read [`CLAUDE.md`](CLAUDE.md) for conventions (it applies to humans too) and the [design doc](docs/design/app-design.md);
- treat the design rules in [research/02](docs/research/02-learning-science.md) as requirements;
- keep `pnpm verify` green and add tests with your change;
- only add dependencies under MIT, ISC, BSD, Apache-2.0 or 0BSD (no GPL);
- never commit credentials or account identifiers. The pre-push hook runs a secret scan.

## Licence

[MIT](LICENSE)
