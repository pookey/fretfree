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
#
# Two ways to hold a slot:
#  - by default, a lock dir with the owner's PID in it (works on macOS, which
#    has no flock); a slot whose PID is gone is reclaimed;
#  - with FRETWORK_SLOT_FLOCK=1, an flock(1) on slot-N.lock, held by an open
#    file descriptor. The remote test runner uses this: each run is its own
#    container (its own PID namespace, so PIDs mean nothing across runs), and
#    the kernel drops the lock when the holder dies, container and all.
lock_base="${FRETWORK_LOCK_DIR:-${TMPDIR:-/tmp}/fretwork-locks}"

_slot_alive() { [[ -n "$1" ]] && kill -0 "$1" 2>/dev/null; }

# Take slot <i> under <root>, or fail at once if someone holds it.
_take_slot() {
  local root="$1" i="$2" dir pid
  if [[ "${FRETWORK_SLOT_FLOCK:-}" == 1 ]]; then
    exec {SLOT_FD}>>"$root/slot-$i.lock"
    if flock -n "$SLOT_FD"; then return 0; fi
    exec {SLOT_FD}>&-
    SLOT_FD=""
    return 1
  fi
  dir="$root/slot-$i"
  if mkdir "$dir" 2>/dev/null; then
    echo $$ > "$dir/pid"
    SLOT_DIR="$dir"
    return 0
  fi
  pid="$(cat "$dir/pid" 2>/dev/null || true)"
  [[ -n "$pid" ]] && ! _slot_alive "$pid" && rm -rf "$dir"
  return 1
}

# Is the lane waiting for a slot of this kind? (Non-lane callers then hold back.)
_lane_waiting() {
  local marker="$1"
  [[ -f "$marker" ]] || return 1
  if [[ "${FRETWORK_SLOT_FLOCK:-}" == 1 ]]; then
    # The waiting lane holds a lock on the marker; a free marker is stale.
    ! flock -n "$marker" true
    return
  fi
  _slot_alive "$(cat "$marker" 2>/dev/null)" && return 0
  rm -f "$marker"
  return 1
}

acquire_slot() {
  local kind="$1" slots="$2" root="$lock_base/$1"
  mkdir -p "$root"
  local lane="" marker="$root/lane-waiting"
  [[ "${FRETWORK_LANE:-}" == 1 ]] && lane=1
  SLOT_DIR="" SLOT_FD="" SLOT_NAME="" SLOT_INDEX="" SLOT_KIND_ROOT="$root" LANE_FD=""
  trap '_release_slot' EXIT
  trap '_release_slot; exit 130' INT
  trap '_release_slot; exit 143' TERM
  if [[ -n "$lane" && "${FRETWORK_SLOT_FLOCK:-}" == 1 ]]; then
    exec {LANE_FD}>>"$marker"
    flock -n "$LANE_FD" || true
  fi
  local waited=0 i
  while [[ -z "$SLOT_NAME" ]]; do
    if [[ -n "$lane" && "${FRETWORK_SLOT_FLOCK:-}" != 1 ]]; then echo $$ > "$marker"; fi
    if [[ -n "$lane" ]] || ! _lane_waiting "$marker"; then
      for ((i = 0; i < slots; i++)); do
        if _take_slot "$root" "$i"; then
          SLOT_NAME="slot-$i" SLOT_INDEX="$i"
          break
        fi
      done
    fi
    if [[ -z "$SLOT_NAME" ]]; then
      ((waited % 30 == 0)) && echo "$kind-slot: waiting for a free slot ($slots in use${lane:+; the lane goes next})…" >&2
      sleep 2
      waited=$((waited + 2))
    fi
  done
  [[ -n "$lane" ]] && _release_lane_marker
  echo "$kind-slot: acquired $SLOT_NAME${lane:+ (lane)}" >&2
}

_release_lane_marker() {
  if [[ -n "${LANE_FD:-}" ]]; then
    exec {LANE_FD}>&-
    LANE_FD=""
  elif [[ "${FRETWORK_SLOT_FLOCK:-}" != 1 ]]; then
    rm -f "$SLOT_KIND_ROOT/lane-waiting"
  fi
}

_release_slot() {
  [[ -n "${SLOT_DIR:-}" ]] && rm -rf "$SLOT_DIR"
  if [[ -n "${SLOT_FD:-}" ]]; then exec {SLOT_FD}>&-; SLOT_FD=""; fi
  if [[ "${FRETWORK_LANE:-}" == 1 && -n "${SLOT_KIND_ROOT:-}" ]]; then _release_lane_marker; fi
  return 0
}
