#!/usr/bin/env bash
# Machine-wide semaphore for the CPU-heavy, non-Playwright part of `pnpm verify`
# (typecheck, lint, unit tests with coverage, build). Parallel worktrees used to
# run these all at once and push load past 30 on 10 cores, which held the agent
# ceiling down. With this, extra agents queue for a slot instead.
# Holds one of CPU_SLOTS (default 2) slots while running the command. The
# integration lane (FRETWORK_LANE=1) takes the next free slot ahead of
# everyone else (scripts/slot-lib.sh).
# Usage: cpu-slot.sh <command...>
set -euo pipefail
source "$(dirname "$0")/slot-lib.sh"
acquire_slot cpu "${CPU_SLOTS:-2}"
"$@"
