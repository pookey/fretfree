#!/usr/bin/env bash
# Send a follow-up brief to a live worker and count the attempt.
# Usage: send-brief.sh <WP> fix|rebase [reason]
# Exits 7 when the WP has used its 3 attempts: stop and surface it to the user.
source "$(dirname "$0")/common.sh"
need_herdr
WP="${1:?WP}" KIND="${2:?fix|rebase}" REASON="${3:-verify failed on main}"
attempts="$(worker_field "$WP" attempts)"; attempts=$((${attempts:-0} + 1))
if ((attempts > ${MAX_ATTEMPTS:-3})); then
  $STATE worker "$WP" '{"status":"blocked"}' >/dev/null
  $STATE event attempts-exhausted "$WP"
  echo "send-brief: $WP has failed $((attempts - 1)) times; stop and ask the user" >&2
  exit 7
fi
export WP REASON WORKTREE="$WORKTREES/$WP" BRANCH="wp/$WP"
export REPORT="$ORCH/reports/$WP.md" REVIEW="$ORCH/reports/$WP.review.md"
agent="$(worker_field "$WP" agent)"
[[ "$(agent_status "$agent")" != none ]] || die "worker agent $agent is gone; respawn with spawn.sh $WP"
text="$(render "$SKILL_DIR/templates/$KIND-brief.md")"
herdr agent prompt "$agent" "$text" >/dev/null
$STATE worker "$WP" "$(jq -nc --argjson n "$attempts" '{status:"fixing", attempts:$n}')" >/dev/null
echo "sent $KIND brief to $agent (attempt $attempts)"
