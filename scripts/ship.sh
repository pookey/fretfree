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

log "Secret scan"
./scripts/secret-scan.sh
log "Verify"
pnpm verify
# Record the verified SHA (shared by all worktrees) so the pre-push hook can reuse it.
git rev-parse HEAD >> "$(git rev-parse --git-common-dir)/fretwork-verified"
log "Deploy"
SKIP_BUILD=1 ./scripts/deploy.sh   # pnpm verify already built app/dist
log "Smoke"
./scripts/smoke.sh
log "Shipped $(git rev-parse --short HEAD) to https://$SITE_DOMAIN"
