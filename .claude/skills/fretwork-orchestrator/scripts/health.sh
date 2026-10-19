#!/usr/bin/env bash
# Suggest a worker ceiling from machine health (10-core / 16 GB Mac by default).
# Test load no longer sets the ceiling: verify runs queue for machine-wide CPU
# and Playwright slots (scripts/cpu-slot.sh, e2e-slot.sh), and agents spend most
# of their time thinking, not testing. So the ceiling falls on memory pressure
# (or extreme load), holds while runs pile up waiting for slots, and rises
# otherwise.
# Prints: free_mem_pct playwright_procs load1 slot_waiters suggested_ceiling
source "$(dirname "$0")/common.sh"
current="$($STATE show | jq -r '.ceiling')"
phase="$($STATE show | jq -r '.phase')"
free="$(memory_pressure -Q 2>/dev/null | grep -oE '[0-9]+%' | tr -d % || echo 50)"
pw="$({ pgrep -f 'playwright|WebKitWebProcess|pw_run' || true; } | wc -l | tr -d ' ')"
load="$(sysctl -n vm.loadavg | awk '{print $2}')"
cores="$(sysctl -n hw.ncpu)"
max="${MAX_CEILING:-8}"
locks="${FRETWORK_LOCK_DIR:-${TMPDIR:-/tmp}/fretwork-locks}"
runs="$({ pgrep -f '^bash .*scripts/(cpu|e2e)-slot\.sh' || true; } | wc -l | tr -d ' ')"
held="$({ ls -d "$locks"/cpu/slot-* "$locks"/e2e/slot-* 2>/dev/null || true; } | wc -l | tr -d ' ')"
waiters=$((runs > held ? runs - held : 0))
if [[ "$phase" == serial ]]; then suggested=2
elif ((free < 15)); then suggested=$((current > 2 ? current - 2 : 1))
elif ((free < 25)) || (($(printf '%.0f' "$load") > cores * 4)); then suggested=$((current > 1 ? current - 1 : 1))
elif ((waiters >= 4)); then suggested=$current
elif ((free > 40)) && ((current < max)); then suggested=$((current + 1))
else suggested=$current
fi
echo "free_mem=${free}% playwright_procs=$pw load1=$load slot_waiters=$waiters ceiling=$current suggested=$suggested"
