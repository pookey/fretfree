#!/usr/bin/env bash
# Move the ceiling one step towards health.sh's suggestion (max 8), then spawn
# workers into free slots from the planner. Does nothing while paused.
# Usage: refill.sh   (after a ship: cleanup.sh <WP> && refill.sh)
source "$(dirname "$0")/common.sh"
need_herdr
[[ "$($STATE show | jq -r .paused)" == null ]] || { echo "paused; not spawning"; exit 0; }
h="$("$SKILL_DIR/scripts/health.sh")"
echo "$h"
sug="$(grep -oE 'suggested=[0-9]+' <<<"$h" | cut -d= -f2)"
ceil="$($STATE show | jq .ceiling)" new="$ceil"
((sug > ceil && ceil < ${MAX_CEILING:-8})) && new=$((ceil + 1))
((sug < ceil)) && new=$((ceil - 1))
if ((new != ceil)); then
  $STATE set ceiling "$new" >/dev/null
  $STATE event ceiling "$ceil→$new ($h)" >/dev/null
fi
busy="$($STATE active)"
n="$(tr ',' '\n' <<<"$busy" | grep -c . || true)"
free=$((new - n))
echo "ceiling=$new in_flight=$n free=$free"
((free > 0)) || exit 0
plan="$($BACKLOG plan --slots "$free" --busy "$busy")"
echo "plan=$plan"
for wp in $(jq -r '.[]' <<<"$plan"); do "$SKILL_DIR/scripts/spawn.sh" "$wp" 2>&1 | tail -1; done
$STATE sample >/dev/null
