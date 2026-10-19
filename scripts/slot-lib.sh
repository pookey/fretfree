#!/usr/bin/env bash
# Shared lock-dir semaphore for cpu-slot.sh and e2e-slot.sh (sourced, not run).
#
# acquire_slot <kind> <slots> takes one of <slots> machine-wide slots under
# $FRETWORK_LOCK_DIR/<kind>, sets SLOT_NAME (slot-0, slot-1…) and SLOT_INDEX,
# and releases the slot on exit. Slots whose owner died are reclaimed.
#
# The integration lane (FRETWORK_LANE=1) has priority but no extra slot: while
# it waits, it leaves a `lane-waiting` marker, and other callers don't take a
# freed slot until the lane has one. A reserved lane slot would add a third
# concurrent run, and that contention timed out healthy e2e tests in the lane.
lock_base="${FRETWORK_LOCK_DIR:-${TMPDIR:-/tmp}/fretwork-locks}"

_slot_alive() { [[ -n "$1" ]] && kill -0 "$1" 2>/dev/null; }

acquire_slot() {
  local kind="$1" slots="$2" root="$lock_base/$1"
  mkdir -p "$root"
  local lane="" marker="$root/lane-waiting"
  [[ "${FRETWORK_LANE:-}" == 1 ]] && lane=1
  SLOT_DIR="" SLOT_NAME="" SLOT_INDEX="" SLOT_KIND_ROOT="$root"
  trap '_release_slot' EXIT
  trap '_release_slot; exit 130' INT
  trap '_release_slot; exit 143' TERM
  local waited=0 i dir pid
  while [[ -z "$SLOT_DIR" ]]; do
    if [[ -n "$lane" ]]; then
      echo $$ > "$marker"
    elif [[ -f "$marker" ]]; then
      _slot_alive "$(cat "$marker" 2>/dev/null)" || rm -f "$marker"
    fi
    if [[ -n "$lane" || ! -f "$marker" ]]; then
      for ((i = 0; i < slots; i++)); do
        dir="$root/slot-$i"
        if mkdir "$dir" 2>/dev/null; then
          echo $$ > "$dir/pid"
          SLOT_DIR="$dir" SLOT_NAME="slot-$i" SLOT_INDEX="$i"
          break
        fi
        pid="$(cat "$dir/pid" 2>/dev/null || true)"
        [[ -n "$pid" ]] && ! _slot_alive "$pid" && rm -rf "$dir"
      done
    fi
    if [[ -z "$SLOT_DIR" ]]; then
      ((waited % 30 == 0)) && echo "$kind-slot: waiting for a free slot ($slots in use${lane:+; the lane goes next})…" >&2
      sleep 2
      waited=$((waited + 2))
    fi
  done
  [[ -n "$lane" ]] && rm -f "$marker"
  echo "$kind-slot: acquired $SLOT_NAME${lane:+ (lane)}" >&2
}

_release_slot() {
  [[ -n "${SLOT_DIR:-}" ]] && rm -rf "$SLOT_DIR"
  if [[ "${FRETWORK_LANE:-}" == 1 && -n "${SLOT_KIND_ROOT:-}" ]]; then rm -f "$SLOT_KIND_ROOT/lane-waiting"; fi
  return 0
}
