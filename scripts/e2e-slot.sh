#!/usr/bin/env bash
# Machine-wide semaphore for Playwright runs, so parallel worktrees don't
# starve RAM with browsers. Holds one of E2E_SLOTS (default 2) lock dirs while
# running the command, and gives each slot its own preview port (E2E_PORT).
# The integration lane (FRETWORK_LANE=1) takes the next free slot ahead of
# everyone else (scripts/slot-lib.sh).
#
# With E2E_QUIET_WORKERS set (the remote test runner sets it), the command,
# a `playwright test …`, runs twice: every spec but the quiet ones (those that
# measure audio output, see app/playwright.config.ts) at PW_WORKERS, then the
# quiet ones on E2E_QUIET_WORKERS workers. It fails if either pass fails.
# With E2E_SLOT_CPUSET, Playwright and its browsers are pinned to those CPUs.
# With E2E_RETRIES, Playwright retries a failed test that many times (it
# reports a test that passed on retry as flaky).
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
if [[ -n "${E2E_SLOT_CPUSET:-}" ]]; then set -- taskset -c "$E2E_SLOT_CPUSET" "$@"; fi
if [[ -n "${E2E_RETRIES:-}" ]]; then set -- "$@" --retries="$E2E_RETRIES"; fi
if [[ -z "${E2E_QUIET_WORKERS:-}" ]]; then
  "$@"
  exit
fi
rc=0
PW_QUIET_PHASE=main "$@" --pass-with-no-tests || rc=$?
echo "e2e-slot: quiet pass (specs that listen to audio output), $E2E_QUIET_WORKERS workers" >&2
PW_QUIET_PHASE=quiet PW_WORKERS="$E2E_QUIET_WORKERS" "$@" --pass-with-no-tests || rc=$((rc ? rc : $?))
exit "$rc"
