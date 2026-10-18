#!/usr/bin/env bash
# Spawn a worker (or reviewer) for a work package in its own worktree and pane.
# Usage: spawn.sh <WP> [worker|reviewer]
#   worker:   creates worktree .orchestrator/worktrees/<WP> on branch wp/<WP> from main,
#             installs deps, allocates a port block, starts agent wp-<wp>, sends the brief.
#   reviewer: starts agent rv-<wp> in the same worktree with the reviewer brief.
source "$(dirname "$0")/common.sh"
need_herdr
WP="${1:?WP id}" ROLE="${2:-worker}"
wt="$WORKTREES/$WP" branch="wp/$WP"

if [[ "$ROLE" == worker ]]; then
  if [[ ! -d "$wt" ]]; then
    if git -C "$MAIN" show-ref -q --verify "refs/heads/$branch"; then
      git -C "$MAIN" worktree add -q "$wt" "$branch"
    else
      git -C "$MAIN" worktree add -q -b "$branch" "$wt" main
    fi
  fi
  (cd "$wt" && pnpm install --frozen-lockfile --prefer-offline >"$ORCH/logs/$WP-install.log" 2>&1) ||
    die "pnpm install failed in $wt (see $ORCH/logs/$WP-install.log)"
  port="$(worker_field "$WP" port)"
  [[ -n "$port" ]] || port="$($STATE alloc-port "$WP")"
  name="$(agent_name wp "$WP")"
  template="$SKILL_DIR/templates/worker-brief.md"
else
  [[ -d "$wt" ]] || die "no worktree for $WP; spawn the worker first"
  port="$(worker_field "$WP" port)"
  name="$(agent_name rv "$WP")"
  template="$SKILL_DIR/templates/reviewer-brief.md"
fi

pane="$(place_pane "$wt")"
sleep 1 # let the shell reach its prompt
herdr agent start "$name" --kind claude --pane "$pane" --timeout 60000 -- --permission-mode auto >/dev/null ||
  echo "spawn: agent start did not report ready; checking for a trust prompt" >&2
"$SKILL_DIR/scripts/ensure-ready.sh" "$pane" "$wt" "$name"

# Render and send the brief.
export WP WORKTREE="$wt" BRANCH="$branch" PORT="$port" MAIN_REPO="$MAIN"
export REPORT="$ORCH/reports/$WP.md" REVIEW="$ORCH/reports/$WP.review.md"
notes_file="$ORCH/notes/$WP.md"
UPSTREAM_NOTES="none"
[[ -s "$notes_file" ]] && UPSTREAM_NOTES="$(cat "$notes_file")"
REVIEW_HISTORY="$({ ls "$ORCH/reports/$WP".review.*.md 2>/dev/null || true; } | tr '\n' ' ')"
export UPSTREAM_NOTES REVIEW_HISTORY="${REVIEW_HISTORY:-none}"
export WP_LOWER="$(lower "$WP")" WP_SPEC="$($BACKLOG show "$WP" | jq -r .body)"
brief="$ORCH/briefs/$WP.$ROLE.md"
render "$template" >"$brief"
herdr agent prompt "$name" "Read $brief and follow it exactly." >/dev/null

if [[ "$ROLE" == worker ]]; then
  attempts=$(($(worker_field "$WP" attempts || echo 0) + 0))
  $STATE worker "$WP" "$(jq -nc --arg a "$name" --arg p "$pane" --arg w "$wt" --arg b "$branch" \
    --argjson port "$port" --argjson n "$attempts" \
    '{status:"working", agent:$a, pane:$p, worktree:$w, branch:$b, port:$port, attempts:$n}')" >/dev/null
else
  $STATE worker "$WP" "$(jq -nc --arg a "$name" --arg p "$pane" '{status:"reviewing", reviewer:{agent:$a, pane:$p}}')" >/dev/null
fi
$STATE sample >/dev/null
echo "spawned $ROLE $name in $pane ($wt, ports $port–$((port + 9)))"
