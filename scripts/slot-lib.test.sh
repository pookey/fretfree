#!/usr/bin/env bash
# Tests slot-lib.sh's queue: fake waiters on one slot, started one after
# another, get it in arrival order; the lane jumps the queue; a killed
# waiter's ticket doesn't block the one behind it. Each case runs in lock-dir
# mode and in flock mode (FRETWORK_SLOT_FLOCK=1). Then, with a fake runner
# queue (flock mode) and a fake Mac one (lock-dir mode), where verify-quick.sh
# runs Playwright: queue_depth and e2e_host. macOS has no flock(1), so
# there a small Perl stand-in for the two forms slot-lib.sh uses takes its place.
# Usage: scripts/slot-lib.test.sh (part of `pnpm verify:static`).
set -euo pipefail
lib="$(cd "$(dirname "$0")" && pwd)/slot-lib.sh"
work="$(mktemp -d "${TMPDIR:-/tmp}/slot-lib-test.XXXXXX")"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  rm -rf "${work:?}"
}
trap cleanup EXIT

if ! command -v flock >/dev/null; then
  mkdir "$work/bin"
  cat >"$work/bin/flock" <<'PERL'
#!/usr/bin/perl
# flock -n|-w <secs> <fd> | flock -n <file> <command...>
use strict;
use Fcntl qw(:flock O_RDONLY O_CREAT);
use Time::HiRes qw(sleep time);
my ($nb, $wait) = (0, undef);
while (@ARGV && $ARGV[0] =~ /^-/) {
  my $o = shift @ARGV;
  $nb = 1 if $o eq '-n';
  $wait = shift @ARGV if $o eq '-w';
}
my $target = shift @ARGV;
my $fh;
if ($target =~ /^\d+$/) {
  open($fh, '>>&=', $target) or die "flock: fd $target: $!\n";
} else {
  sysopen($fh, $target, O_RDONLY | O_CREAT) or die "flock: $target: $!\n";
}
if (defined $wait) {
  my $deadline = time + $wait;
  until (flock($fh, LOCK_EX | LOCK_NB)) { exit 1 if time > $deadline; sleep 0.02; }
} else {
  flock($fh, LOCK_EX | ($nb ? LOCK_NB : 0)) or exit 1;
}
exit 0 unless @ARGV;
system(@ARGV);
exit($? >> 8);
PERL
  chmod +x "$work/bin/flock"
  export PATH="$work/bin:$PATH"
fi

# A fake waiter: takes the one slot, logs its name, then holds the slot until
# released (`hold`) or for a moment.
cat >"$work/waiter.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
source "$SLOT_LIB"
acquire_slot test "${SLOTS:-1}"
echo "$1" >>"$CASE_DIR/order"
if [[ "${2:-}" == hold ]]; then
  until [[ -e "$CASE_DIR/release-$1" ]]; do sleep 0.05; done
else
  sleep 0.2
fi
SH

unset FRETWORK_LANE FRETWORK_SLOT_FLOCK E2E_OFFLOAD_DEPTH
export SLOT_LIB="$lib" FRETWORK_SLOT_POLL=0.1
timeout_s=$((30 * ${TEST_TIMEOUT_SCALE:-1}))
failures=0
declare -A pid_of

fail() {
  echo "  FAIL: $*" >&2
  failures=$((failures + 1))
}

# start <name> [hold] [lane]
start() {
  local name="$1" hold="${2:-}" lane="${3:-}"
  FRETWORK_LANE="$lane" bash "$work/waiter.sh" "$name" "$hold" 2>"$CASE_DIR/$name.log" &
  pid_of[$name]=$!
  pids+=("$!")
}

# expect_log <name> <text>: wait until the waiter's log says <text>.
expect_log() {
  local deadline=$((SECONDS + timeout_s))
  until grep -qF -- "$2" "$CASE_DIR/$1.log" 2>/dev/null; do
    if ((SECONDS > deadline)); then
      fail "$1 never said \"$2\"; its log: $(cat "$CASE_DIR/$1.log" 2>/dev/null)"
      return 0
    fi
    sleep 0.05
  done
}

# expect_order <names...>: wait until that many waiters got the slot, then compare.
expect_order() {
  local want="$*" got deadline=$((SECONDS + timeout_s))
  while (($(wc -l <"$CASE_DIR/order" 2>/dev/null || echo 0) < $#)); do
    if ((SECONDS > deadline)); then break; fi
    sleep 0.05
  done
  got="$(tr '\n' ' ' <"$CASE_DIR/order" 2>/dev/null | sed 's/ $//')"
  [[ "$got" == "$want" ]] || fail "slot order was \"$got\", expected \"$want\""
}

new_case() {
  CASE_DIR="$work/$1-$2"
  mkdir -p "$CASE_DIR"
  export CASE_DIR FRETWORK_LOCK_DIR="$CASE_DIR/locks"
  echo "slot-lib: $2 ($1)"
}

# Wait for the case's waiters to finish, so the next case starts clean.
finish_case() {
  local name
  for name in "$@"; do wait "${pid_of[$name]}" 2>/dev/null || true; done
}

for mode in lock-dir flock; do
  if [[ "$mode" == flock ]]; then export FRETWORK_SLOT_FLOCK=1; else unset FRETWORK_SLOT_FLOCK; fi

  new_case "$mode" "arrival order"
  start H hold && expect_log H "acquired slot-0"
  start A && expect_log A "waiting for a test slot: 1 of 1 in use, 1st in line"
  start B && expect_log B "2nd in line"
  start C && expect_log C "3rd in line"
  touch "$CASE_DIR/release-H"
  expect_order H A B C
  finish_case H A B C
  left=("$FRETWORK_LOCK_DIR/test/tickets"/[0-9]*)
  [[ ! -e "${left[0]}" ]] || fail "tickets left behind: ${left[*]}"

  new_case "$mode" "the lane jumps the queue"
  start H hold && expect_log H "acquired slot-0"
  start A && expect_log A "1st in line"
  start B && expect_log B "2nd in line"
  start L "" 1 && expect_log L "1 of 1 in use; the lane goes next"
  touch "$CASE_DIR/release-H"
  expect_order H L A B
  finish_case H L A B

  new_case "$mode" "a killed waiter's ticket doesn't block"
  start H hold && expect_log H "acquired slot-0"
  start A && expect_log A "1st in line"
  start B && expect_log B "2nd in line"
  kill -9 "${pid_of[A]}"
  wait "${pid_of[A]}" 2>/dev/null || true # reap it: a zombie still answers kill -0
  expect_log B "1st in line"
  touch "$CASE_DIR/release-H"
  expect_order H B
  finish_case H B
  left=("$FRETWORK_LOCK_DIR/test/tickets"/[0-9]*)
  [[ ! -e "${left[0]}" ]] || fail "dead ticket not cleared: ${left[*]}"
done

# Where e2e runs: a fake runner queue in flock mode (as on the box) and a fake
# Mac queue with two slots in lock-dir mode (as here).
CASE_DIR="$work/where-e2e-runs"
mkdir -p "$CASE_DIR"
export CASE_DIR
echo "slot-lib: where e2e runs"
remote_locks="$CASE_DIR/remote" local_locks="$CASE_DIR/local"
# runner <name> [hold] / mac <name>: a fake waiter in that queue.
runner() { FRETWORK_SLOT_FLOCK=1 FRETWORK_LOCK_DIR="$remote_locks" start "$@"; }
mac() { FRETWORK_LOCK_DIR="$local_locks" SLOTS=2 start "$1" hold; }
depth() { (source "$lib" && FRETWORK_SLOT_FLOCK="$2" queue_depth "$1/test"); }
# expect_host <description> <want>: reads both queues and decides.
expect_host() {
  local r l got
  r="$(depth "$remote_locks" 1)" l="$(depth "$local_locks" "")"
  got="$(source "$lib" && e2e_host "$r" "$l" 2)"
  [[ "$got" == "$2" ]] || fail "$1: runner queue $r deep, Mac queue $l of 2: chose $got, expected $2"
}
unset FRETWORK_SLOT_FLOCK
runner R1 hold && expect_log R1 "acquired slot-0"
expect_host "shallow runner queue" remote
runner R2 && expect_log R2 "1st in line"
[[ "$(depth "$remote_locks" 1)" == 2 ]] || fail "runner queue depth was $(depth "$remote_locks" 1), expected 2 (1 holder + 1 waiter)"
expect_host "deep runner queue, free Mac slot" local
mac M1 && expect_log M1 "acquired slot-0"
expect_host "deep runner queue, one Mac slot free" local
mac M2 && expect_log M2 "acquired slot-1"
expect_host "deep runner queue, no free Mac slot" remote
touch "$CASE_DIR/release-R1" "$CASE_DIR/release-M1" "$CASE_DIR/release-M2"
finish_case R1 R2 M1 M2
[[ "$(depth "$remote_locks" 1) $(depth "$local_locks" "")" == "0 0" ]] || fail "queues not empty after the waiters left"

if ((failures)); then
  echo "slot-lib: $failures failure(s)" >&2
  exit 1
fi
echo "slot-lib: all cases passed"
