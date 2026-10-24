#!/usr/bin/env bash
# Run a command on the remote test runner instead of this Mac, when one is
# configured and reachable. Otherwise run it here.
#
# The runner is a big Linux box (48 cores, an unprivileged account, no sudo)
# that takes the CPU-heavy checks (`pnpm verify`, `verify:quick`, `e2e`) off
# the Mac. A full e2e (all four projects) takes about 4 minutes there.
#
# What is sent: exactly the files this worktree's own checks would see, i.e.
# tracked plus untracked-but-not-ignored files, so uncommitted work is
# included, and ignored files (.env, node_modules, dist, credentials) never
# leave the machine. Deploy, smoke and the secret scan always stay local.
#
# Each run gets a fresh directory and its own container on the runner, in
# Playwright's Ubuntu 24.04 image (rootless Podman), with the runner's Node 22
# mounted so it matches the Mac. It installs from a warm, shared pnpm store,
# runs the command with the remote disabled (so it runs there), streams the
# output back and exits with the command's status. A local interrupt removes
# the container; stale run directories are swept.
#
# Sharing the box: runs share the runner's CPU and e2e slots (cpu-slot.sh,
# e2e-slot.sh) through flock(1) on a mounted lock dir, so concurrent worktrees
# queue for REMOTE_CPU_SLOTS (default 1) static runs and REMOTE_E2E_SLOTS
# (default 1) Playwright runs of REMOTE_PW_WORKERS (default 20) workers. Each
# container has its own network namespace, so preview ports never clash. A
# host-side semaphore caps live containers at REMOTE_RUNS (default 8).
#
# Static gates and Playwright are pinned to separate physical cores (the box
# has 24 cores, 48 SMT threads; CPU n and n+24 are siblings): a static run
# bursts across every core and slowed an e2e run beside it. A WebKit worker
# keeps about 1.3 threads busy, so 20 workers fit their 16 cores. Measured,
# full e2e of all four projects: 20 workers 3.8 min, 12 workers 5.7 min; two
# e2e runs at once were no faster in total and failed more, so they queue.
#
# Retries: the box is about half as fast per thread as the Mac, which widens
# a few spec races (a key press before React's effect attaches its listener,
# a Skip click that lands on the next onboarding step) enough that roughly
# one full run in two hits one, at 12 workers as at 20. Those are spec bugs
# to fix; until then the runner retries a failed test once (REMOTE_RETRIES,
# default 1) and Playwright lists it as flaky. Rerun one on the Mac for its
# trace.
#
# What made WebKit fast and stable there (2026-10-20):
#  - --pids-limit=-1: Podman's default cap of 2048 tasks per container was the
#    "Page crashed" cause. WebKit processes run many threads each, and every
#    refused clone() killed a page (pids.events counted hundreds per run).
#  - PW_TRACE=off: recording traces (screencast frames of a 2x iPad screen)
#    tripled WebKit's CPU time and pushed long specs past 30 s. Remote traces
#    never come back anyway; rerun a failure on the Mac for its trace.
#  - LP_NUM_THREADS=0: Mesa's software GL otherwise starts 32 threads per
#    WebKit page on a 48-core box; single-threaded it costs 30% less CPU.
#  - fakeaudiosink: there is no sound device, so GStreamer would probe six
#    audio sinks per AudioContext; a clocked null sink behaves like a speaker.
#  - specs that measure audio output run in a second, low-parallelism pass
#    (E2E_QUIET_WORKERS, see e2e-slot.sh): under full load their notes can
#    stay silent.
#
# Two commands in one run directory (verify-quick.sh runs its static gates,
# then decides where Playwright runs): REMOTE_RUN=<name> names the run, and
# REMOTE_KEEP=1 keeps its directory (node_modules, the build) afterwards. A
# later command with the same REMOTE_RUN reuses it without syncing again, and
# removes it unless kept; `--drop <name>` removes it otherwise.
#
# Configuration (never committed: the repo is public):
#   FRETWORK_REMOTE=user@host, or the first line of
#   "$(git rev-parse --git-common-dir)/fretwork-remote", shared by all worktrees.
#   FRETWORK_REMOTE=off (or an empty file) disables it.
# Usage: remote-run.sh <command...>
#        remote-run.sh --enabled    (exit 0 if a runner is configured)
#        remote-run.sh --queue-depth <kind>   (print the depth of the runner's
#                                   <kind> slot queue, e.g. e2e: holders plus
#                                   waiters; fails if it is unreachable)
#        remote-run.sh --drop <name>          (remove a kept run's directory)
set -euo pipefail

remote="${FRETWORK_REMOTE-}"
if [[ -z "$remote" ]]; then
  cfg="$(git rev-parse --git-common-dir 2>/dev/null)/fretwork-remote"
  [[ -f "$cfg" ]] && remote="$(head -1 "$cfg" | tr -d '[:space:]')"
fi
[[ "$remote" == off ]] && remote=""

if [[ "${1:-}" == --enabled ]]; then [[ -n "$remote" ]]; exit; fi
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
case "${1:-}" in
  --queue-depth)
    [[ -n "$remote" ]] || exit 1
    # The runner's slots are flock(1) locks, held from inside its containers.
    # Sent to bash on stdin, so the runner's login shell needn't be bash.
    source "$(dirname "$0")/slot-lib.sh"
    printf '%s\n' "$(declare -f queue_depth _slot_flock _slot_alive _ticket_live _lane_waiting)" \
      "FRETWORK_SLOT_FLOCK=1 queue_depth ~/fretwork-locks/${2:?--queue-depth needs a kind}" |
      ssh "${ssh_opts[@]}" "$remote" 'bash -s' 2>/dev/null
    exit ;;
  --drop)
    [[ -n "$remote" ]] || exit 0
    exec ssh "${ssh_opts[@]}" "$remote" "rm -rf ~/fretwork-runs/'${2:?--drop needs a run name}'" 2>/dev/null ;;
esac
[[ -n "$remote" ]] || exec "$@"

if ! ssh "${ssh_opts[@]}" "$remote" true 2>/dev/null; then
  echo "remote-run: $remote is unreachable; running here instead" >&2
  exec "$@"
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"
run="${REMOTE_RUN:-run-$(date +%s)-$$-$RANDOM}"
dir="fretwork-runs/$run"

# The audio pass runs here, alongside the runner. Specs that listen to real
# audio output (app/playwright.config.ts, "quiet") must run on few workers
# there, where WebKit's audio goes silent under load, and that pass took
# about a third of a remote verify. On this Mac, nearly idle while the
# runner works, they pass at the usual 4 workers. Only for the whole gate
# (`pnpm verify`) and a whole `pnpm e2e`: a command naming its own specs
# (verify:quick, `e2e <spec>`) runs both passes on the runner as before.
# REMOTE_AUDIO_HERE=0 turns it off.
quiet_pid=""
if [[ "${REMOTE_AUDIO_HERE:-1}" == 1 && -d "$root/app/node_modules" ]] &&
  [[ "$*" == "pnpm verify:here" || "$*" == "pnpm --filter app e2e" ]]; then
  quiet_log="$(mktemp "${TMPDIR:-/tmp}/fretwork-audio.XXXXXX")"
  # Its own process group (set -m), so an interrupt stops its browsers too.
  set -m
  # Through pnpm scripts, which put Playwright on PATH.
  (cd "$root/app" && pnpm build && PW_QUIET_PHASE=quiet pnpm e2e:only --pass-with-no-tests) \
    >"$quiet_log" 2>&1 </dev/null &
  quiet_pid=$!
  set +m
  echo "remote-run: the audio specs run on this Mac meanwhile (log: $quiet_log)" >&2
fi
stop_quiet() { [[ -n "$quiet_pid" ]] && kill -- -"$quiet_pid" 2>/dev/null; true; }

# Slots are shared by every run on the runner (see the top); the lane gets
# priority in them and more unit-test workers.
slots="CPU_SLOTS=${REMOTE_CPU_SLOTS:-1} E2E_SLOTS=${REMOTE_E2E_SLOTS:-1} FRETWORK_SLOT_FLOCK=1 FRETWORK_LOCK_DIR=/locks"
# Separate cores for static gates and Playwright (see the top).
slots="$slots CPU_SLOT_CPUSET=${REMOTE_CPU_CPUSET:-16-23,40-47} E2E_SLOT_CPUSET=${REMOTE_E2E_CPUSET:-0-15,24-39}"
pw="PW_WORKERS=${REMOTE_PW_WORKERS:-20} TEST_TIMEOUT_SCALE=${REMOTE_TIMEOUT_SCALE:-3} E2E_RETRIES=${REMOTE_RETRIES:-1} E2E_QUIET_WORKERS=2 PW_TRACE=off LP_NUM_THREADS=0 GST_PLUGIN_FEATURE_RANK=fakeaudiosink:MAX"
[[ -n "$quiet_pid" ]] && pw="$pw E2E_QUIET_ELSEWHERE=1"
# ship.sh's weekly safety net runs every test on all three iPads (app/playwright.config.ts).
[[ "${PW_FULL_MATRIX:-}" == 1 ]] && pw="$pw PW_FULL_MATRIX=1"
if [[ "${FRETWORK_LANE:-}" == 1 ]]; then
  workers="FRETWORK_LANE=1 VITEST_MAX_WORKERS=12 $pw"
else
  workers="VITEST_MAX_WORKERS=8 $pw"
fi

if [[ -n "${REMOTE_RUN:-}" ]] && ssh "${ssh_opts[@]}" "$remote" "test -d '$dir'" 2>/dev/null; then
  echo "remote-run: $(basename "$root") → $remote:$dir (reused)" >&2
else
  echo "remote-run: $(basename "$root") → $remote:$dir" >&2
  git ls-files -co --exclude-standard -z |
    while IFS= read -r -d '' f; do [[ -e "$f" ]] && printf '%s\0' "$f"; done |
    COPYFILE_DISABLE=1 tar --no-xattrs --null -T - -czf - |
    ssh "${ssh_opts[@]}" "$remote" "
      find ~/fretwork-runs -mindepth 1 -maxdepth 1 -mmin +360 -exec rm -rf {} + 2>/dev/null
      mkdir -p '$dir' && tar -xzf - -C '$dir'"
fi

cleanup() {
  stop_quiet
  local drop="rm -rf '$dir'"
  [[ "${REMOTE_KEEP:-}" == 1 ]] && drop=true
  ssh "${ssh_opts[@]}" "$remote" "podman rm -f -t 2 '$run' >/dev/null 2>&1; $drop" 2>/dev/null || true
}
trap cleanup EXIT

image="${REMOTE_IMAGE:-mcr.microsoft.com/playwright:v1.64.1-noble}"
path=/opt/node/bin:/tmp/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# The command travels base64-encoded, so its quoting doesn't have to survive two shells.
cmd64="$(printf '%q ' "$@" | base64 | tr -d '\n')"
# ssh runs in the background so a signal interrupts `wait` at once (bash defers
# traps while a foreground command runs); the EXIT trap then removes the
# container. A SIGKILL here can't be trapped: the container's `timeout` and the
# sweep above clean that up.
set +e
ssh -n "${ssh_opts[@]}" "$remote" "
  mkdir -p ~/.cache/pnpm-store ~/.cache/corepack ~/fretwork-locks
  echo '$cmd64' | base64 -d > '$dir/.cmd'
  cd ~/'$dir' && FRETWORK_LOCK_DIR=~/fretwork-locks FRETWORK_LANE=${FRETWORK_LANE:-} \\
    exec bash -c 'source scripts/slot-lib.sh && acquire_slot runs ${REMOTE_RUNS:-8} && \"\$@\"' _ \\
  podman run --rm --name '$run' --ipc=host --pids-limit=-1 \\
    -v /opt/node:/opt/node:ro -v ~/'$dir':/work -v ~/.cache/pnpm-store:/pnpm-store \\
    -v ~/.cache/corepack:/corepack -v ~/fretwork-locks:/locks -w /work \\
    -e PATH=$path -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -e COREPACK_HOME=/corepack \\
    -e npm_config_store_dir=/pnpm-store -e FRETWORK_REMOTE=off \\
    $(printf -- '-e %s ' $slots $workers) '$image' timeout 2h bash -c '
      mkdir -p /tmp/bin && corepack enable --install-directory /tmp/bin &&
      pnpm install --frozen-lockfile --prefer-offline --reporter=silent || exit 98
      exec bash .cmd'" &
ssh_pid=$!
trap 'kill "$ssh_pid" 2>/dev/null; stop_quiet; exit 130' INT
trap 'kill "$ssh_pid" 2>/dev/null; stop_quiet; exit 143' TERM
wait "$ssh_pid"
rc=$?
if [[ -n "$quiet_pid" ]]; then
  wait "$quiet_pid"
  quiet_rc=$?
  quiet_pid=""
  echo "remote-run: audio pass on this Mac (exit $quiet_rc):" >&2
  cat "$quiet_log" >&2
  rm -f "$quiet_log"
  ((rc == 0)) && rc=$quiet_rc
fi
set -e
exit "$rc"
