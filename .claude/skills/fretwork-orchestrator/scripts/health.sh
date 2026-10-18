#!/usr/bin/env bash
# Suggest a worker ceiling from machine health (10-core / 16 GB Mac by default).
# Prints: free_mem_pct playwright_procs load1 suggested_ceiling
source "$(dirname "$0")/common.sh"
current="$($STATE show | jq -r '.ceiling')"
phase="$($STATE show | jq -r '.phase')"
free="$(memory_pressure -Q 2>/dev/null | grep -oE '[0-9]+%' | tr -d % || echo 50)"
pw="$(pgrep -f 'playwright|WebKitWebProcess|pw_run' | wc -l | tr -d ' ')"
load="$(sysctl -n vm.loadavg | awk '{print $2}')"
cores="$(sysctl -n hw.ncpu)"
max="${MAX_CEILING:-8}"
if [[ "$phase" == serial ]]; then suggested=2
elif ((free < 15)); then suggested=$((current > 2 ? current - 2 : 1))
elif ((free < 25)) || (($(printf '%.0f' "$load") > cores * 2)); then suggested=$((current > 1 ? current - 1 : 1))
elif ((free > 40)) && ((current < max)); then suggested=$((current + 1))
else suggested=$current
fi
echo "free_mem=${free}% playwright_procs=$pw load1=$load ceiling=$current suggested=$suggested"
