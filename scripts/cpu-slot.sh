#!/usr/bin/env bash
# Machine-wide semaphore for the CPU-heavy, non-Playwright part of `pnpm verify`
# (typecheck, lint, unit tests with coverage, build). Parallel worktrees used to
# run these all at once and push load past 30 on 10 cores, which held the agent
# ceiling down. With this, extra agents queue for a slot instead.
# Holds one of CPU_SLOTS (default 2) lock dirs while running the command. The
# integration lane (FRETWORK_LANE=1) has a reserved slot of its own, so shipping
# never waits behind worker checks.
# Usage: cpu-slot.sh <command...>
set -euo pipefail
slots="${CPU_SLOTS:-2}"
lock_root="${FRETWORK_LOCK_DIR:-${TMPDIR:-/tmp}/fretwork-locks}/cpu"
mkdir -p "$lock_root"

if [[ "${FRETWORK_LANE:-}" == 1 ]]; then names=(lane); else
  names=()
  for ((i = 0; i < slots; i++)); do names+=("slot-$i"); done
fi

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
      break
    fi
    # Reclaim slots whose owner died without cleaning up.
    pid="$(cat "$dir/pid" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then rm -rf "$dir"; fi
  done
  if [[ -z "$acquired" ]]; then
    ((waited % 30 == 0)) && echo "cpu-slot: waiting for a free verify slot (${#names[@]} in use)…" >&2
    sleep 2
    waited=$((waited + 2))
  fi
done

echo "cpu-slot: acquired $(basename "$acquired")" >&2
"$@"
