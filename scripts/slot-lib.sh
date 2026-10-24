#!/usr/bin/env bash
# Shared lock-dir semaphore for cpu-slot.sh and e2e-slot.sh (sourced, not run).
#
# acquire_slot <kind> <slots> takes one of <slots> machine-wide slots under
# $FRETWORK_LOCK_DIR/<kind>, sets SLOT_NAME (slot-0, slot-1…) and SLOT_INDEX,
# and releases the slot on exit. Slots whose owner died are reclaimed.
#
# Waiters are served in arrival order: each takes a numbered ticket in
# <kind>/tickets and tries for a slot only while it holds the oldest live
# ticket. Polling with no order let the oldest waiters starve behind newer
# ones (on the one-slot remote runner, runs waited 50 minutes). Tickets of
# dead waiters are cleared the same way as slots (see below).
#
# The integration lane (FRETWORK_LANE=1) has priority but no extra slot: it
# takes no ticket, and while it waits, it leaves a `lane-waiting` marker, and
# ticket holders don't take a freed slot until the lane has one. A reserved
# lane slot would add a third concurrent run, and that contention timed out
# healthy e2e tests in the lane.
#
# Two ways to hold a slot or a ticket:
#  - by default, a lock dir (a ticket file) with the owner's PID in it (works
#    on macOS, which has no flock); one whose PID is gone is reclaimed;
#  - with FRETWORK_SLOT_FLOCK=1, an flock(1) on slot-N.lock (on the ticket
#    file), held by an open file descriptor. The remote test runner uses this:
#    each run is its own container (its own PID namespace, so PIDs mean
#    nothing across runs), and the kernel drops the lock when the holder dies,
#    container and all.
#
# queue_depth and e2e_host (at the end) let verify-quick.sh choose between the
# remote runner's e2e queue and this Mac's.
#
# FRETWORK_SLOT_POLL sets the seconds between tries (default 2).
# Test: scripts/slot-lib.test.sh (part of `pnpm verify:static`).
lock_base="${FRETWORK_LOCK_DIR:-${TMPDIR:-/tmp}/fretwork-locks}"

_slot_alive() { [[ -n "$1" ]] && kill -0 "$1" 2>/dev/null; }
_slot_flock() { [[ "${FRETWORK_SLOT_FLOCK:-}" == 1 ]]; }

# Take slot <i> under <root>, or fail at once if someone holds it.
_take_slot() {
  local root="$1" i="$2" dir pid
  if _slot_flock; then
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

# How many of <slots> slots under <root> are held (for the waiting message).
_slots_in_use() {
  local root="$1" slots="$2" i n=0 pid
  for ((i = 0; i < slots; i++)); do
    if _slot_flock; then
      [[ -e "$root/slot-$i.lock" ]] && ! flock -n "$root/slot-$i.lock" true && n=$((n + 1))
    elif [[ -d "$root/slot-$i" ]]; then
      pid="$(cat "$root/slot-$i/pid" 2>/dev/null || true)"
      # No PID yet: its owner is between mkdir and writing it.
      if [[ -z "$pid" ]] || _slot_alive "$pid"; then n=$((n + 1)); fi
    fi
  done
  echo "$n"
}

# Take the next ticket in <root>/tickets: TICKET_FILE, and in flock mode
# TICKET_FD, which holds the lock that keeps it alive. The ticket is written
# (and locked) under a temporary name and then hard-linked into place, which
# fails if the number is taken, so no one ever sees a half-made ticket.
_take_ticket() {
  local dir="$1/tickets" tmp last n
  mkdir -p "$dir"
  find "$dir" -name '.new-*' -mmin +10 -delete 2>/dev/null || true
  tmp="$dir/.new-$$-$RANDOM"
  echo $$ > "$tmp"
  if _slot_flock; then
    exec {TICKET_FD}>>"$tmp"
    flock -n "$TICKET_FD"
  fi
  last=0
  for n in "$dir"/[0-9]*; do [[ -e "$n" ]] && last=$((10#${n##*/})); done
  n=$((last + 1))
  # Only "that number is taken" means try the next one; anything else (the
  # dir or the temp file gone) would loop forever.
  until ln "$tmp" "$dir/$(printf '%010d' "$n")" 2>/dev/null; do
    if [[ ! -e "$dir/$(printf '%010d' "$n")" ]]; then
      echo "slot-lib: can't take a ticket in $dir" >&2
      rm -f "$tmp"
      _drop_ticket
      return 1
    fi
    n=$((n + 1))
  done
  rm -f "$tmp"
  TICKET_FILE="$dir/$(printf '%010d' "$n")"
}

_ticket_live() {
  if _slot_flock; then
    [[ -e "$1" ]] && ! flock -n "$1" true
    return
  fi
  _slot_alive "$(cat "$1" 2>/dev/null)"
}

# Set QUEUE_PLACE to our place among the live tickets (1 = next), clearing
# dead tickets ahead of us. Takes a new ticket if ours has gone.
_queue_place() {
  local t ahead=0
  if [[ ! -e "$TICKET_FILE" ]]; then
    _drop_ticket
    _take_ticket "$SLOT_KIND_ROOT"
  fi
  for t in "$SLOT_KIND_ROOT/tickets"/[0-9]*; do
    [[ "$t" == "$TICKET_FILE" ]] && break
    [[ -e "$t" ]] || continue
    if _ticket_live "$t"; then ahead=$((ahead + 1)); else rm -f "$t"; fi
  done
  QUEUE_PLACE=$((ahead + 1))
}

_drop_ticket() {
  [[ -n "${TICKET_FILE:-}" ]] && rm -f "$TICKET_FILE"
  if [[ -n "${TICKET_FD:-}" ]]; then exec {TICKET_FD}>&-; fi
  TICKET_FILE="" TICKET_FD=""
}

# Is the lane waiting for a slot of this kind? (Non-lane callers then hold back.)
_lane_waiting() {
  local marker="$1"
  [[ -f "$marker" ]] || return 1
  if _slot_flock; then
    # The waiting lane holds a lock on the marker; a free marker is stale.
    ! flock -n "$marker" true
    return
  fi
  _slot_alive "$(cat "$marker" 2>/dev/null)" && return 0
  rm -f "$marker"
  return 1
}

_ordinal() {
  local n="$1" suffix=th
  case $((n % 100)) in
    11 | 12 | 13) ;;
    *) case $((n % 10)) in 1) suffix=st ;; 2) suffix=nd ;; 3) suffix=rd ;; esac ;;
  esac
  echo "$n$suffix"
}

_slot_noun() {
  case "$1" in
    cpu) echo "a CPU slot" ;;
    e2e) echo "an e2e slot" ;;
    runs) echo "a run slot" ;;
    *) echo "a $1 slot" ;;
  esac
}

_try_slots() {
  local i
  for ((i = 0; i < $2; i++)); do
    if _take_slot "$1" "$i"; then
      SLOT_NAME="slot-$i" SLOT_INDEX="$i"
      return 0
    fi
  done
  return 1
}

acquire_slot() {
  local kind="$1" slots="$2" root="$lock_base/$1"
  mkdir -p "$root"
  local lane="" marker="$root/lane-waiting" lane_locked=""
  [[ "${FRETWORK_LANE:-}" == 1 ]] && lane=1
  SLOT_DIR="" SLOT_FD="" SLOT_NAME="" SLOT_INDEX="" SLOT_KIND_ROOT="$root" LANE_FD=""
  TICKET_FILE="" TICKET_FD="" QUEUE_PLACE=""
  trap '_release_slot' EXIT
  trap '_release_slot; exit 130' INT
  trap '_release_slot; exit 143' TERM
  if [[ -n "$lane" ]] && _slot_flock; then
    exec {LANE_FD}>>"$marker"
    # A waiter checking the marker holds its lock for a moment: wait that out.
    flock -w 1 "$LANE_FD" && lane_locked=1 || true
  fi
  [[ -z "$lane" ]] && _take_ticket "$root"
  local poll="${FRETWORK_SLOT_POLL:-2}" said="" said_at=0 msg
  while [[ -z "$SLOT_NAME" ]]; do
    if [[ -n "$lane" ]]; then
      if _slot_flock; then
        # Retried each round, in case the wait above timed out.
        [[ -z "$lane_locked" ]] && flock -n "$LANE_FD" && lane_locked=1
      else
        echo $$ > "$marker"
      fi
      _try_slots "$root" "$slots" || true
    else
      _queue_place
      if ((QUEUE_PLACE == 1)) && ! _lane_waiting "$marker"; then _try_slots "$root" "$slots" || true; fi
    fi
    [[ -n "$SLOT_NAME" ]] && break
    # Say it at once, when our place in line changes, and every 30 s. A lane
    # that doesn't hold its marker lock yet isn't next, so it doesn't say so.
    if [[ -n "$lane" ]] && _slot_flock && [[ -z "$lane_locked" ]]; then
      :
    elif [[ "$said" != "${QUEUE_PLACE:-lane}" ]] || ((SECONDS - said_at >= 30)); then
      msg="waiting for $(_slot_noun "$kind"): $(_slots_in_use "$root" "$slots") of $slots in use"
      if [[ -n "$lane" ]]; then
        msg="$msg; the lane goes next"
      else
        msg="$msg, $(_ordinal "$QUEUE_PLACE") in line"
        if _lane_waiting "$marker"; then msg="$msg (the lane goes first)"; fi
      fi
      echo "$msg…" >&2
      said="${QUEUE_PLACE:-lane}" said_at=$SECONDS
    fi
    sleep "$poll"
  done
  _drop_ticket
  [[ -n "$lane" ]] && _release_lane_marker
  echo "$kind-slot: acquired $SLOT_NAME${lane:+ (lane)}" >&2
}

_release_lane_marker() {
  if [[ -n "${LANE_FD:-}" ]]; then
    exec {LANE_FD}>&-
    LANE_FD=""
  elif ! _slot_flock; then
    rm -f "$SLOT_KIND_ROOT/lane-waiting"
  fi
}

_release_slot() {
  _drop_ticket
  [[ -n "${SLOT_DIR:-}" ]] && rm -rf "$SLOT_DIR"
  if [[ -n "${SLOT_FD:-}" ]]; then exec {SLOT_FD}>&-; SLOT_FD=""; fi
  if [[ "${FRETWORK_LANE:-}" == 1 && -n "${SLOT_KIND_ROOT:-}" ]]; then _release_lane_marker; fi
  return 0
}

# How deep the queue under <root> is: slots held plus live waiters (tickets,
# and a waiting lane). Counts every slot it finds, so it needs no slot count:
# remote-run.sh sends this function to the runner over SSH to read its queue.
queue_depth() {
  local root="$1" f n=0 pid
  for f in "$root"/slot-*; do
    [[ -e "$f" ]] || continue
    if _slot_flock; then
      [[ "$f" == *.lock ]] && ! flock -n "$f" true && n=$((n + 1))
    elif [[ -d "$f" ]]; then
      pid="$(cat "$f/pid" 2>/dev/null || true)"
      if [[ -z "$pid" ]] || _slot_alive "$pid"; then n=$((n + 1)); fi
    fi
  done
  for f in "$root/tickets"/[0-9]*; do
    [[ -e "$f" ]] && _ticket_live "$f" && n=$((n + 1))
  done
  [[ -f "$root/lane-waiting" ]] && _lane_waiting "$root/lane-waiting" && n=$((n + 1))
  echo "$n"
}

# Where a worker check's Playwright should run: prints "local" when the remote
# runner's e2e queue is at least E2E_OFFLOAD_DEPTH (default 2) deep and this
# Mac has a free e2e slot (its queue is shorter than its slots), else "remote".
# Usage: e2e_host <remote depth> <local depth> <local slots>
e2e_host() {
  if (($1 >= ${E2E_OFFLOAD_DEPTH:-2} && $2 < $3)); then echo local; else echo remote; fi
}
