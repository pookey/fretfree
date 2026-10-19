#!/usr/bin/env bash
# Machine-wide semaphore for Playwright runs, so parallel worktrees don't
# starve RAM with browsers. Holds one of E2E_SLOTS (default 2) lock dirs while
# running the command, and gives each slot its own preview port (E2E_PORT).
# The integration lane (FRETWORK_LANE=1) takes the next free slot ahead of
# everyone else (scripts/slot-lib.sh).
# Usage: e2e-slot.sh <command...>
set -euo pipefail
source "$(dirname "$0")/slot-lib.sh"
acquire_slot e2e "${E2E_SLOTS:-2}"
export E2E_PORT="${E2E_PORT:-$((4310 + SLOT_INDEX))}"


# A killed Playwright run can leave its `vite preview` behind, reparented to
# launchd and still holding this slot's port, so every later run on the slot
# fails with "port is already used". Stop such orphans; refuse anything else.
for pid in $(lsof -nP -t -iTCP:"$E2E_PORT" -sTCP:LISTEN 2>/dev/null || true); do
  if [[ "$(ps -o ppid= -p "$pid" | tr -d ' ')" == 1 ]] && ps -o command= -p "$pid" | grep -q 'vite.*preview'; then
    echo "e2e-slot: stopping orphaned vite preview $pid on port $E2E_PORT" >&2
    kill "$pid" 2>/dev/null || true
    sleep 1
  else
    echo "e2e-slot: port $E2E_PORT is held by pid $pid ($(ps -o command= -p "$pid" | cut -c1-80))" >&2
    exit 1
  fi
done
"$@"
