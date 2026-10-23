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
# Configuration (never committed: the repo is public):
#   FRETWORK_REMOTE=user@host, or the first line of
#   "$(git rev-parse --git-common-dir)/fretwork-remote", shared by all worktrees.
#   FRETWORK_REMOTE=off (or an empty file) disables it.
# Usage: remote-run.sh <command...>
#        remote-run.sh --enabled    (exit 0 if a runner is configured)
set -euo pipefail

remote="${FRETWORK_REMOTE-}"
if [[ -z "$remote" ]]; then
  cfg="$(git rev-parse --git-common-dir 2>/dev/null)/fretwork-remote"
  [[ -f "$cfg" ]] && remote="$(head -1 "$cfg" | tr -d '[:space:]')"
fi
[[ "$remote" == off ]] && remote=""

if [[ "${1:-}" == --enabled ]]; then [[ -n "$remote" ]]; exit; fi
[[ -n "$remote" ]] || exec "$@"

ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
if ! ssh "${ssh_opts[@]}" "$remote" true 2>/dev/null; then
  echo "remote-run: $remote is unreachable; running here instead" >&2
  exec "$@"
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"
run="run-$(date +%s)-$$-$RANDOM"
dir="fretwork-runs/$run"

# Slots are shared by every run on the runner (see the top); the lane gets
# priority in them and more unit-test workers.
slots="CPU_SLOTS=${REMOTE_CPU_SLOTS:-1} E2E_SLOTS=${REMOTE_E2E_SLOTS:-1} FRETWORK_SLOT_FLOCK=1 FRETWORK_LOCK_DIR=/locks"
# Separate cores for static gates and Playwright (see the top).
slots="$slots CPU_SLOT_CPUSET=${REMOTE_CPU_CPUSET:-16-23,40-47} E2E_SLOT_CPUSET=${REMOTE_E2E_CPUSET:-0-15,24-39}"
pw="PW_WORKERS=${REMOTE_PW_WORKERS:-20} E2E_RETRIES=${REMOTE_RETRIES:-1} E2E_QUIET_WORKERS=2 PW_TRACE=off LP_NUM_THREADS=0 GST_PLUGIN_FEATURE_RANK=fakeaudiosink:MAX"
# ship.sh's weekly safety net runs every test on all three iPads (app/playwright.config.ts).
[[ "${PW_FULL_MATRIX:-}" == 1 ]] && pw="$pw PW_FULL_MATRIX=1"
if [[ "${FRETWORK_LANE:-}" == 1 ]]; then
  workers="FRETWORK_LANE=1 VITEST_MAX_WORKERS=12 $pw"
else
  workers="VITEST_MAX_WORKERS=8 $pw"
fi

echo "remote-run: $(basename "$root") → $remote:$dir" >&2
git ls-files -co --exclude-standard -z |
  while IFS= read -r -d '' f; do [[ -e "$f" ]] && printf '%s\0' "$f"; done |
  COPYFILE_DISABLE=1 tar --no-xattrs --null -T - -czf - |
  ssh "${ssh_opts[@]}" "$remote" "
    find ~/fretwork-runs -mindepth 1 -maxdepth 1 -mmin +360 -exec rm -rf {} + 2>/dev/null
    mkdir -p '$dir' && tar -xzf - -C '$dir'"

cleanup() {
  ssh "${ssh_opts[@]}" "$remote" "podman rm -f -t 2 '$run' >/dev/null 2>&1; rm -rf '$dir'" 2>/dev/null || true
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
trap 'kill "$ssh_pid" 2>/dev/null; exit 130' INT
trap 'kill "$ssh_pid" 2>/dev/null; exit 143' TERM
wait "$ssh_pid"
rc=$?
set -e
exit "$rc"
