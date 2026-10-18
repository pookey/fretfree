#!/usr/bin/env bash
# Send a follow-up brief to a live worker and count the attempt.
# Usage: send-brief.sh <WP> fix|rebase [reason]
# Counts review rounds (fix) and integration failures (rebase) separately. Each
# is capped at MAX_ATTEMPTS (3). Exits 7 when a cap is hit: stop and surface it
# to the user.
source "$(dirname "$0")/common.sh"
need_herdr
WP="${1:?WP}" KIND="${2:?fix|rebase}" REASON="${3:-verify failed on main}"
if [[ "$KIND" == fix ]]; then field=reviewRounds; else field=integrationFailures; fi
attempts="$(worker_field "$WP" "$field")"; attempts=$((${attempts:-0} + 1))
if ((attempts > ${MAX_ATTEMPTS:-3})); then
  $STATE worker "$WP" '{"status":"blocked"}' >/dev/null
  $STATE event attempts-exhausted "$WP $field"
  echo "send-brief: $WP has had $((attempts - 1)) $field; stop and ask the user" >&2
  exit 7
fi
export WP REASON WORKTREE="$WORKTREES/$WP" BRANCH="wp/$WP"
export REPORT="$ORCH/reports/$WP.md" REVIEW="$ORCH/reports/$WP.review.md"
agent="$(worker_field "$WP" agent)"
[[ "$(agent_status "$agent")" != none ]] || die "worker agent $agent is gone; respawn with spawn.sh $WP"
# Archive the previous review so the next reviewer starts fresh (the brief still points
# the worker at the archived copy).
if [[ -f "$REVIEW" ]]; then
  mv "$REVIEW" "$ORCH/reports/$WP.review.$attempts.md"
  REVIEW="$ORCH/reports/$WP.review.$attempts.md"
fi
text="$(render "$SKILL_DIR/templates/$KIND-brief.md")"
prompt_agent "$agent" "$text"
$STATE worker "$WP" "$(jq -nc --arg f "$field" --argjson n "$attempts" '{status:"fixing", reviewer:null} + {($f): $n}')" >/dev/null
echo "sent $KIND brief to $agent ($field: $attempts)"
