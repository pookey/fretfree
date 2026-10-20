#!/usr/bin/env bash
# Local continuous delivery: verify → build → deploy → smoke-test production.
# Run on a clean `main`. On success it stamps HEAD as verified so the pre-push
# hook doesn't re-run the full suite for the same commit. No GitHub Actions.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

if [[ "${ALLOW_DIRTY:-}" != 1 ]] && [[ -n "$(git status --porcelain)" ]]; then
  fail "Working tree is dirty; commit first (or ALLOW_DIRTY=1)"
fi
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != main && "${ALLOW_BRANCH:-}" != 1 ]]; then
  fail "ship runs on main (currently $branch); ALLOW_BRANCH=1 to override"
fi

# Callers (the orchestrator's integration lane) can learn which phase failed.
phase() { [[ -n "${SHIP_PHASE_FILE:-}" ]] && echo "$1" >"$SHIP_PHASE_FILE"; log "$2"; }

phase scan "Secret scan"
./scripts/secret-scan.sh
phase verify "Verify"
pnpm verify
# Record the verified SHA (shared by all worktrees) so the pre-push hook can reuse it.
git rev-parse HEAD >> "$(git rev-parse --git-common-dir)/fretwork-verified"
phase deploy "Deploy"
if ./scripts/remote-run.sh --enabled; then
  # Verify ran on the remote test runner, so build the same commit here to deploy.
  ./scripts/deploy.sh
else
  SKIP_BUILD=1 ./scripts/deploy.sh   # pnpm verify already built app/dist
fi
phase smoke "Smoke"
./scripts/smoke.sh
phase shipped "Shipped $(git rev-parse --short HEAD) to https://$SITE_DOMAIN"
