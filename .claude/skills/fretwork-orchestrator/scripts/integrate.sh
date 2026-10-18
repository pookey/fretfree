#!/usr/bin/env bash
# The single integration lane: one WP at a time.
#   rebase wp/<WP> onto main → fast-forward main → mark the WP done in the
#   backlog → pnpm ship (secret scan, verify, deploy, smoke) → push main.
# Exit codes:
#   0 shipped and pushed
#   2 lane busy (another integration holds the lock)
#   3 rebase conflict (main untouched; send the worker a rebase/fix brief)
#   4 verify failed before deploy (main reset to its previous commit; nothing shipped)
#   5 STOP THE LINE: deploy or smoke failed after main moved; production may be broken
#   6 push failed (shipped, but main not pushed; investigate before the next merge)
source "$(dirname "$0")/common.sh"
WP="${1:?WP}"
branch="wp/$WP" wt="$WORKTREES/$WP"
lock="$ORCH/integrate.lock"
log="$ORCH/logs/$WP-integrate.log"

mkdir "$lock" 2>/dev/null || { echo "integrate: lane busy ($(cat "$lock/wp" 2>/dev/null))" >&2; exit 2; }
echo "$WP" >"$lock/wp"
trap 'rm -rf "$lock"' EXIT
$STATE worker "$WP" '{"status":"integrating"}' >/dev/null

cd "$MAIN"
[[ "$(git rev-parse --abbrev-ref HEAD)" == main ]] || die "main checkout is not on main"
[[ -z "$(git status --porcelain)" ]] || die "main checkout is dirty; commit or stash before integrating"
[[ -z "$(git -C "$wt" status --porcelain)" ]] || die "$WP worktree has uncommitted changes; ask the worker to commit"

echo "integrate: rebasing $branch onto main"
if ! git -C "$wt" rebase main >>"$log" 2>&1; then
  git -C "$wt" rebase --abort >/dev/null 2>&1 || true
  $STATE worker "$WP" '{"status":"fixing","lastFailure":"rebase-conflict"}' >/dev/null
  $STATE event rebase-conflict "$WP"
  echo "integrate: rebase conflict; main untouched (see $log)" >&2
  exit 3
fi

before="$(git rev-parse main)"
git merge --ff-only -q "$branch"
$BACKLOG set-status "$WP" done >/dev/null
git add docs/backlog.md
git commit -q -m "Mark $WP done in the backlog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

echo "integrate: shipping $(git rev-parse --short HEAD)"
phase_file="$ORCH/logs/$WP-ship-phase"
rm -f "$phase_file"
set +e
SHIP_PHASE_FILE="$phase_file" pnpm ship >>"$log" 2>&1
rc=$?
set -e
if ((rc != 0)); then
  failed_phase="$(cat "$phase_file" 2>/dev/null || echo unknown)"
  if [[ "$failed_phase" == deploy || "$failed_phase" == smoke ]]; then
    $STATE event stop-the-line "$WP: deploy/smoke failed after merge; see $log"
    $STATE worker "$WP" '{"status":"integrating","lastFailure":"ship"}' >/dev/null
    echo "integrate: STOP THE LINE: deploy or smoke failed for $WP (see $log)" >&2
    exit 5
  fi
  git reset -q --hard "$before"
  $STATE worker "$WP" '{"status":"fixing","lastFailure":"verify"}' >/dev/null
  $STATE event verify-failed "$WP"
  echo "integrate: verify failed on main for $WP; main reset to $before (see $log)" >&2
  exit 4
fi

if ! git push -q origin main >>"$log" 2>&1; then
  $STATE event push-failed "$WP"
  echo "integrate: shipped but push failed (see $log)" >&2
  exit 6
fi
$STATE event shipped "$WP $(git rev-parse --short HEAD)"
echo "integrate: $WP merged, shipped to production and pushed"
