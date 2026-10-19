#!/usr/bin/env bash
# Machine-wide semaphore for Playwright runs, so parallel worktrees don't
# starve RAM with browsers. Holds one of E2E_SLOTS (default 2) lock dirs while
# running the command, and gives each slot its own preview port (E2E_PORT).
# Usage: e2e-slot.sh <command...>
set -euo pipefail
slots="${E2E_SLOTS:-2}"
lock_root="${FRETWORK_LOCK_DIR:-${TMPDIR:-/tmp}/fretwork-locks}/e2e"
mkdir -p "$lock_root"

acquired=""
release() { [[ -n "$acquired" ]] && rm -rf "$acquired"; }
trap release EXIT INT TERM

waited=0
while [[ -z "$acquired" ]]; do
  for ((i = 0; i < slots; i++)); do
    dir="$lock_root/slot-$i"
    if mkdir "$dir" 2>/dev/null; then
      echo $$ > "$dir/pid"
      acquired="$dir"
      export E2E_PORT="${E2E_PORT:-$((4310 + i))}"
      break
    fi
    # Reclaim slots whose owner died without cleaning up.
    pid="$(cat "$dir/pid" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then rm -rf "$dir"; fi
  done
  if [[ -z "$acquired" ]]; then
    ((waited % 30 == 0)) && echo "e2e-slot: waiting for a free Playwright slot ($slots in use)…" >&2
    sleep 2
    waited=$((waited + 2))
  fi
done

echo "e2e-slot: acquired $(basename "$acquired") (port $E2E_PORT)" >&2

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
