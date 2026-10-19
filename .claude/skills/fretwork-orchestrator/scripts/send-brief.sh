#!/usr/bin/env bash
# Send a follow-up brief to a live worker and count the attempt.
# Usage: send-brief.sh <WP> fix|rebase|preflight [reason]
# Counts review rounds (fix) and integration failures (rebase) separately. Each
# is capped at MAX_ATTEMPTS (3). Exits 7 when a cap is hit: stop and surface it
# to the user. A preflight (after APPROVE: quick should-fixes, rebase, full
# verify) isn't counted, and keeps the approved review in place.
source "$(dirname "$0")/common.sh"
need_herdr
WP="${1:?WP}" KIND="${2:?fix|rebase|preflight}" REASON="${3:-verify failed on main}"
case "$KIND" in
  fix) field=reviewRounds ;;
  rebase) field=integrationFailures ;;
  preflight) field="" ;;
  *) die "unknown brief kind $KIND" ;;
esac
attempts=0
[[ -n "$field" ]] && { attempts="$(worker_field "$WP" "$field")"; attempts=$((${attempts:-0} + 1)); }
if [[ -n "$field" ]] && ((attempts > ${MAX_ATTEMPTS:-3})); then
  $STATE worker "$WP" '{"status":"blocked"}' >/dev/null
  $STATE event attempts-exhausted "$WP $field"
  echo "send-brief: $WP has had $((attempts - 1)) $field; stop and ask the user" >&2
  exit 7
fi
export WP REASON WORKTREE="$WORKTREES/$WP" BRANCH="wp/$WP"
export REPORT="$ORCH/reports/$WP.md" REVIEW="$ORCH/reports/$WP.review.md"
# Fix rounds check only what changed since the brief (verify-quick.sh --since).
export SINCE="$(git -C "$WORKTREE" rev-parse --short HEAD)"
agent="$(worker_field "$WP" agent)"
[[ "$(agent_status "$agent")" != none ]] || die "worker agent $agent is gone; respawn with spawn.sh $WP"
# Archive the previous review so the next reviewer starts fresh (the brief still points
# the worker at the archived copy).
if [[ "$KIND" != preflight && -f "$REVIEW" ]]; then
  mv "$REVIEW" "$ORCH/reports/$WP.review.$attempts.md"
  REVIEW="$ORCH/reports/$WP.review.$attempts.md"
fi
text="$(render "$SKILL_DIR/templates/$KIND-brief.md")"
prompt_agent "$agent" "$text" || echo "send-brief: WARNING $agent has not started; resend by hand" >&2
if [[ "$KIND" == preflight ]]; then
  $STATE worker "$WP" '{"status":"fixing","reviewer":null,"reviewApproved":true}' >/dev/null
  echo "sent preflight brief to $agent"
else
  $STATE worker "$WP" "$(jq -nc --arg f "$field" --argjson n "$attempts" '{status:"fixing", reviewer:null} + {($f): $n}')" >/dev/null
  echo "sent $KIND brief to $agent ($field: $attempts)"
fi
