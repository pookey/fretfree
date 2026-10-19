#!/usr/bin/env bash
# Machine-wide semaphore for Playwright runs, so parallel worktrees don't
# starve RAM with browsers. Holds one of E2E_SLOTS (default 2) lock dirs while
# running the command, and gives each slot its own preview port (E2E_PORT).
# The integration lane (FRETWORK_LANE=1) has a reserved slot of its own (port
# 4309), so shipping never waits behind worker runs.
# Usage: e2e-slot.sh <command...>
set -euo pipefail
slots="${E2E_SLOTS:-2}"
lock_root="${FRETWORK_LOCK_DIR:-${TMPDIR:-/tmp}/fretwork-locks}/e2e"
mkdir -p "$lock_root"
if [[ "${FRETWORK_LANE:-}" == 1 ]]; then names=(lane); else
  names=()
  for ((i = 0; i < slots; i++)); do names+=("slot-$i"); done
fi
port_of() { if [[ "$1" == lane ]]; then echo 4309; else echo $((4310 + ${1#slot-})); fi; }

acquired=""
release() { [[ -n "$acquired" ]] && rm -rf "$acquired"; }
trap release EXIT INT TERM

waited=0
while [[ -z "$acquired" ]]; do
  for name in "${names[@]}"; do
    dir="$lock_root/$name"
    if mkdir "$dir" 2>/dev/null; then
      echo $$ > "$dir/pid"
      acquired="$dir"
      export E2E_PORT="${E2E_PORT:-$(port_of "$name")}"
      break
    fi
    # Reclaim slots whose owner died without cleaning up.
    pid="$(cat "$dir/pid" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then rm -rf "$dir"; fi
  done
  if [[ -z "$acquired" ]]; then
    ((waited % 30 == 0)) && echo "e2e-slot: waiting for a free Playwright slot (${#names[@]} in use)…" >&2
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
