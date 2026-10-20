#!/usr/bin/env bash
# The single integration lane. Takes one WP, or a batch shipped together:
#   for each WP in order: rebase wp/<WP> onto main (which by then holds the
#   batch's earlier WPs) → fast-forward main; then mark them all done in one
#   backlog commit → pnpm ship once (secret scan, verify, deploy, smoke) → push.
# A WP whose rebase conflicts is left out of the batch and sent back; the rest
# still ship. Batching removes the one-WP-per-verify ceiling: the serial lane
# capped shipping at about 2.5 WPs an hour.
# Exit codes:
#   0 shipped and pushed (lines "SKIPPED <WP> rebase-conflict" list any left out)
#   2 lane busy (another integration holds the lock)
#   3 rebase conflict for every WP (main untouched; send rebase/fix briefs)
#   4 verify failed before deploy (main reset; nothing shipped). For a batch the
#     WPs stay queued and lane-next.sh re-runs them one at a time to find the culprit
#   5 STOP THE LINE: deploy or smoke failed after main moved; production may be broken
#   6 push failed (shipped, but main not pushed; investigate before the next merge)
source "$(dirname "$0")/common.sh"
(($# > 0)) || die "usage: integrate.sh <WP> [WP…]"
lock="$ORCH/integrate.lock"

mkdir "$lock" 2>/dev/null || { echo "integrate: lane busy ($(cat "$lock/wp" 2>/dev/null))" >&2; exit 2; }
echo "$*" >"$lock/wp"
trap 'rm -rf "$lock"' EXIT

cd "$MAIN"
[[ "$(git rev-parse --abbrev-ref HEAD)" == main ]] || die "main checkout is not on main"
[[ -z "$(git status --porcelain)" ]] || die "main checkout is dirty; commit or stash before integrating"

logs=()
for WP in "$@"; do logs+=("$ORCH/logs/$WP-integrate.log"); done
say() { echo "$*" | tee -a "${logs[@]}" >/dev/null; echo "$*"; }

before="$(git rev-parse main)"
batch=()
# Each WP's branch tip before the batch. A WP rebased after another in the
# batch sits on top of it, so if the batch doesn't ship, every member goes back
# to its own tip; otherwise a later single re-run would carry the culprit's
# commits along.
declare -A orig
restore() { for WP in "${batch[@]}"; do git -C "$WORKTREES/$WP" reset -q --hard "${orig[$WP]}"; done; }
for WP in "$@"; do
  wt="$WORKTREES/$WP" log="$ORCH/logs/$WP-integrate.log"
  $STATE worker "$WP" '{"status":"integrating"}' >/dev/null
  if [[ -n "$(git -C "$wt" status --porcelain)" ]]; then
    $STATE worker "$WP" '{"status":"fixing","lastFailure":"dirty-worktree"}' >/dev/null
    say "SKIPPED $WP dirty-worktree"
    continue
  fi
  orig[$WP]="$(git -C "$wt" rev-parse HEAD)"
  say "integrate: rebasing wp/$WP onto main"
  if ! git -C "$wt" rebase main >>"$log" 2>&1; then
    git -C "$wt" rebase --abort >/dev/null 2>&1 || true
    $STATE worker "$WP" '{"status":"fixing","lastFailure":"rebase-conflict"}' >/dev/null
    $STATE event rebase-conflict "$WP"
    say "SKIPPED $WP rebase-conflict"
    continue
  fi
  git merge --ff-only -q "wp/$WP"
  batch+=("$WP")
done

if ((${#batch[@]} == 0)); then
  git reset -q --hard "$before"
  echo "integrate: nothing to ship (every WP was skipped); main untouched" >&2
  exit 3
fi

for WP in "${batch[@]}"; do $BACKLOG set-status "$WP" done >/dev/null; done
git add docs/backlog.md
git commit -q -m "Mark ${batch[*]} done in the backlog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

say "integrate: shipping $(git rev-parse --short HEAD) (${batch[*]})"
phase_file="$ORCH/logs/${batch[0]}-ship-phase"
rm -f "$phase_file"
set +e
# The lane jumps the queue for CPU and e2e slots (scripts/slot-lib.sh), and
# runs more test workers than a worktree check, because every ship waits on it.
FRETWORK_LANE=1 PW_WORKERS="${PW_WORKERS:-5}" VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-6}" \
  SHIP_PHASE_FILE="$phase_file" pnpm ship 2>&1 | tee -a "${logs[@]}" >/dev/null
rc=${PIPESTATUS[0]}
set -e
if ((rc != 0)); then
  failed_phase="$(cat "$phase_file" 2>/dev/null || echo unknown)"
  if [[ "$failed_phase" == deploy || "$failed_phase" == smoke ]]; then
    for WP in "${batch[@]}"; do $STATE worker "$WP" '{"status":"integrating","lastFailure":"ship"}' >/dev/null; done
    $STATE event stop-the-line "${batch[*]}: deploy/smoke failed after merge; see ${logs[0]}"
    echo "integrate: STOP THE LINE: deploy or smoke failed for ${batch[*]} (see ${logs[0]})" >&2
    exit 5
  fi
  git reset -q --hard "$before"
  if ((${#batch[@]} > 1)); then
    restore
    for WP in "${batch[@]}"; do $STATE worker "$WP" '{"status":"queued"}' >/dev/null; done
    $STATE event batch-verify-failed "${batch[*]}"
    echo "integrate: batch verify failed for ${batch[*]}; main reset to $before; re-run them one at a time" >&2
  else
    $STATE worker "${batch[0]}" '{"status":"fixing","lastFailure":"verify"}' >/dev/null
    $STATE event verify-failed "${batch[0]}"
    echo "integrate: verify failed on main for ${batch[0]}; main reset to $before (see ${logs[0]})" >&2
  fi
  echo "BATCH ${batch[*]}"
  exit 4
fi

if ! git push -q origin main >>"${logs[0]}" 2>&1; then
  $STATE event push-failed "${batch[*]}"
  echo "integrate: shipped but push failed (see ${logs[0]})" >&2
  exit 6
fi
for WP in "${batch[@]}"; do $STATE event shipped "$WP $(git rev-parse --short HEAD)"; done
echo "BATCH ${batch[*]}"
echo "integrate: ${batch[*]} merged, shipped to production and pushed"
