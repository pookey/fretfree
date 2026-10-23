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
# Reuse a verify of this commit, or of a recent ancestor when only docs changed
# since (the same rule as the pre-push hook). FORCE_VERIFY=1 always verifies.
stamps="$(git rev-parse --git-common-dir)/fretwork-verified"
touch "$stamps"
verified=""
if [[ "${FORCE_VERIFY:-}" != 1 ]]; then
  for sha in $(git rev-list -n 50 HEAD); do
    grep -qx "$sha" "$stamps" || continue
    changed="$(git diff --name-only "$sha" HEAD)"
    if [[ -z "$changed" ]] || ! grep -qvE '^(docs/.*|.*\.md|LICENSE)$' <<<"$changed"; then
      verified="$sha"
    fi
    break
  done
fi
if [[ -n "$verified" ]]; then
  phase verify "Verify: reusing the verify of ${verified:0:8} (FORCE_VERIFY=1 to re-run)"
else
  # Day to day, ipad-portrait and ipad-mini-landscape run only @layout tests
  # (app/playwright.config.ts). The first ship after a week without a full
  # matrix runs every test on all three iPads, as a safety net.
  full_stamp="$(git rev-parse --git-common-dir)/fretwork-full-matrix"
  if [[ "${PW_FULL_MATRIX:-}" == 1 || ! -f "$full_stamp" || -n "$(find "$full_stamp" -mtime +7)" ]]; then
    export PW_FULL_MATRIX=1
  fi
  phase verify "Verify${PW_FULL_MATRIX:+ (full matrix)}"
  pnpm verify
  # Record the verified SHA (shared by all worktrees) so the pre-push hook can reuse it.
  git rev-parse HEAD >> "$stamps"
  [[ "${PW_FULL_MATRIX:-}" == 1 ]] && touch "$full_stamp"
fi
phase deploy "Deploy"
if [[ -n "$verified" ]] || ./scripts/remote-run.sh --enabled; then
  # Verify was reused, or ran on the remote test runner: build this commit here to deploy.
  ./scripts/deploy.sh
else
  SKIP_BUILD=1 ./scripts/deploy.sh   # pnpm verify already built app/dist
fi
phase smoke "Smoke"
./scripts/smoke.sh
phase shipped "Shipped $(git rev-parse --short HEAD) to https://$SITE_DOMAIN"
