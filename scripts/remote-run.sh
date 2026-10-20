#!/usr/bin/env bash
# EXPERIMENTAL, and off unless configured. Status (2026-10-20): unit tests and
# builds are fine on the runner, but Playwright's WebKit crashes there under
# load (kernel 7.0 / Ubuntu 26.04 host, even inside the noble image). At 4
# workers a 48-test sample gave 46 passed and 2 failed; the 2 aren't diagnosed
# yet. A full remote e2e at that rate is slower than the Mac. See
# docs/handoff/06-pm-handoff.md before enabling it.
#
# Run a command on the remote test runner instead of this Mac, when one is
# configured and reachable. Otherwise run it here.
#
# The runner is a big Linux box (an unprivileged account, no sudo) that takes
# the CPU-heavy checks (`pnpm verify`, `pnpm verify:quick`) off the Mac, where
# test load used to cap the number of agents.
#
# What is sent: exactly the files this worktree's own checks would see, i.e.
# tracked plus untracked-but-not-ignored files, so uncommitted work is
# included, and ignored files (.env, node_modules, dist, credentials) never
# leave the machine. Deploy, smoke and the secret scan always stay local.
#
# Each run gets a fresh directory on the runner and runs in Playwright's own
# Ubuntu 24.04 image (rootless Podman; the runner's newer Ubuntu crashes
# Playwright's WebKit), with the runner's Node 22 mounted so it matches the Mac.
# It installs from a warm, shared pnpm store, runs the command with the remote
# disabled (so it runs there), streams the output back and exits with the
# command's status. One run per container (its own slots), and a host-side
# semaphore caps concurrent runs at REMOTE_RUNS (default 3): sharing slot locks
# across containers needed --pid=host, which made WebKit crash.
# A local interrupt removes the container. Stale run directories are swept.
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

# Defaults sized for the runner (48 cores): 6 concurrent static runs and 6
# Playwright runs, 8 workers each. The lane gets priority and more workers.
slots="CPU_SLOTS=1 E2E_SLOTS=1"
if [[ "${FRETWORK_LANE:-}" == 1 ]]; then
  workers="FRETWORK_LANE=1 VITEST_MAX_WORKERS=16 PW_WORKERS=${REMOTE_PW_WORKERS:-4}"
else
  workers="VITEST_MAX_WORKERS=8 PW_WORKERS=${REMOTE_PW_WORKERS:-4}"
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
    exec bash -c 'source scripts/slot-lib.sh && acquire_slot runs ${REMOTE_RUNS:-3} && \"\$@\"' _ \\
  podman run --rm --name '$run' --ipc=host \\
    -v /opt/node:/opt/node:ro -v ~/'$dir':/work -v ~/.cache/pnpm-store:/pnpm-store \\
    -v ~/.cache/corepack:/corepack -w /work \\
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
