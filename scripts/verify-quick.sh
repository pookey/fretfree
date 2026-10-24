#!/usr/bin/env bash
# A cheaper check for a work-package branch than the full `pnpm verify`:
#  1. every static gate (typecheck, lint, format, unit + coverage, infra, build,
#     bundle budget), in a machine-wide CPU slot (scripts/cpu-slot.sh);
#  2. Playwright, at the smallest level the change allows:
#       own    the branch's own specs, on every project;
#       fast   `pnpm e2e:fast`: every spec on ipad-landscape plus the phone
#              smoke tests (a third of the matrix), when the change reaches
#              shared code or registers a new drill;
#       full   the whole matrix, only with --full.
# With a remote test runner, the static gates run there, and Playwright runs
# there or on this Mac, whichever has the shorter queue when it starts (below).
# The integration lane runs the whole matrix (`pnpm verify`) once per batch,
# and is the only full gate. Nothing else should run it: at 2 Playwright slots
# a full matrix per worker check kept 8 runs queued and the lane starved.
#
# A change stays "own" when every changed file is docs, an e2e spec, a new
# per-area engine config file, or a file inside an existing drill folder. A new
# drill.ts (a new registration changes what fresh sessions serve) or anything
# else (shell, session, screens, skills, theory, storage, helpers, config…)
# runs the fast suite.
#
# Usage: verify-quick.sh [--since <ref>] [--preflight] [--full] [--dry-run]
#   --since <ref>  judge only changes after <ref> (e.g. a fix round's starting
#                  commit). The default is the merge base with origin/main.
#   --preflight    the check after a rebase onto origin/main: if the last
#                  passing fast or full run of this worktree already used the
#                  same base, drift is impossible and only the own specs run.
#   --full         run the whole matrix.
#   --dry-run      print what would run, and run nothing.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

since="" full="" dry="" preflight=""
while (($#)); do
  case "$1" in
    --since) since="${2:?--since needs a ref}"; shift 2 ;;
    --preflight) preflight=1; shift ;;
    --full) full=1; shift ;;
    --dry-run) dry=1; shift ;;
    *) echo "verify-quick: unknown argument $1" >&2; exit 2 ;;
  esac
done
merge_base="$(git merge-base HEAD origin/main)"
base="${since:-$merge_base}"
# The base of the last passing fast/full run in this worktree (its own .git).
stamp="$(git rev-parse --git-dir)/fretwork-quick-base"

# Committed and uncommitted changes since base, with git's status letter.
changes="$(
  {
    git diff --name-status --no-renames "$base"
    git ls-files --others --exclude-standard | sed 's/^/A\t/'
  } | sort -u
)"

local_only=1
reasons=()
while IFS=$'\t' read -r status path; do
  [[ -z "$path" ]] && continue
  case "$path" in
    docs/* | *.md) ;;
    app/e2e/helpers* ) local_only=""; reasons+=("$path") ;;
    app/e2e/*.spec.ts) ;;
    app/src/engine/config/*)
      # A new per-area file only feeds the new code; edits to an existing one
      # (session.ts, adaptive.ts, …) can change every drill.
      if [[ "$status" != A || "$path" == */*/*/*/*/*/* ]]; then local_only=""; reasons+=("$path"); fi ;;
    app/src/drills/*/drill.ts)
      if [[ "$status" == A ]]; then local_only=""; reasons+=("$path (new drill)"); fi ;;
    app/src/drills/*/*) ;;
    *) local_only=""; reasons+=("$path") ;;
  esac
done <<<"$changes"

# Own specs: changed spec files, plus specs that drive a changed drill (by its
# test-id prefix, e.g. "d5-").
specs=()
while IFS=$'\t' read -r status path; do
  case "$path" in
    app/e2e/*.spec.ts) [[ "$status" != D ]] && specs+=("${path#app/}") ;;
    app/src/drills/*/*)
      folder="${path#app/src/drills/}"; folder="${folder%%/*}"
      id="${folder%%-*}"
      while IFS= read -r spec; do specs+=("${spec#app/}"); done < <(grep -l -E "['\"\`]$id-" app/e2e/*.spec.ts || true) ;;
  esac
done <<<"$changes"
if ((${#specs[@]})); then
  IFS=$'\n' read -r -d '' -a specs < <(printf '%s\n' "${specs[@]}" | sort -u) || true
fi

# Pick the level.
level=own
if [[ -n "$full" ]]; then level=full
elif [[ -z "$local_only" ]]; then
  level=fast
  if [[ -n "$preflight" && "$(cat "$stamp" 2>/dev/null || true)" == "$merge_base" ]]; then
    echo "verify-quick: preflight on an unchanged base (${merge_base:0:8}); the last fast run still holds, so only own specs run"
    level=own
  else
    echo "verify-quick: fast e2e (ipad-landscape + phone smoke), because the change reaches beyond its own drill and specs:"
    printf '  %s\n' "${reasons[@]:0:8}"
  fi
fi

# Decide what runs.
static="./scripts/cpu-slot.sh pnpm verify:static"
e2e=""
case "$level" in
  full) e2e="pnpm --filter app e2e:only"; summary="static + full e2e matrix" ;;
  fast) e2e="pnpm --filter app e2e:fast"; summary="static + fast e2e" ;;
  own)
    if ((${#specs[@]} == 0)); then
      summary="static; no e2e spec touches this change"
    else
      echo "verify-quick: e2e on own specs: ${specs[*]}"
      e2e="pnpm --filter app e2e:only $(printf '%q ' "${specs[@]}")"
      summary="static + ${#specs[@]} own spec(s)"
    fi ;;
esac

# With a remote test runner (scripts/remote-run.sh), a worker check runs its
# static gates there, then decides where Playwright runs when it gets to it:
# the runner has one e2e slot, and with five or six checks queued for it, runs
# waited 20-26 minutes while this Mac's two sat idle. When the runner's e2e
# queue is E2E_OFFLOAD_DEPTH (2) or more deep and a local slot is free, it
# runs here, against a local build of the same tree (e2e_host, slot-lib.sh).
# The lane, and a check with no e2e, run as one command on the runner.
split=""
if [[ -n "$e2e" && "${FRETWORK_LANE:-}" != 1 && -d app/node_modules ]] && ./scripts/remote-run.sh --enabled; then
  split=1
fi

if [[ -z "$split" ]]; then
  steps="$static${e2e:+ && $e2e}"
  echo "verify-quick: static gates (base ${base:0:8})"
  if [[ -n "$dry" ]]; then
    echo "would run: ./scripts/remote-run.sh bash -c \"$steps\""
    exit 0
  fi
  # One command, so the runner syncs and builds once.
  ./scripts/remote-run.sh bash -c "$steps"
else
  # Both steps share one run directory on the runner. The static step marks
  # its build, so the e2e step builds again only where that build isn't (here,
  # or on the runner if the static step fell back to this Mac).
  run="quick-$(date +%s)-$$-$RANDOM"
  built="app/dist/.built-by-$run"
  e2e_step="{ [[ -e $built ]] || ./scripts/cpu-slot.sh pnpm --filter app build; } && $e2e"

  # Sets host to local or remote, and says why.
  choose_host() {
    local remote_depth local_depth slots="${E2E_SLOTS:-2}"
    if ! remote_depth="$(./scripts/remote-run.sh --queue-depth e2e)"; then
      echo "verify-quick: the test runner is unreachable, so e2e runs on this Mac"
      host=local
      return
    fi
    local_depth="$(source scripts/slot-lib.sh && queue_depth "$lock_base/e2e")"
    host="$(source scripts/slot-lib.sh && e2e_host "$remote_depth" "$local_depth" "$slots")"
    if [[ "$host" == local ]]; then
      echo "verify-quick: e2e on this Mac, against a local build: the runner's e2e queue is $remote_depth deep, and $local_depth of $slots e2e slots here are taken"
    elif ((remote_depth >= ${E2E_OFFLOAD_DEPTH:-2})); then
      echo "verify-quick: e2e on the runner: its e2e queue is $remote_depth deep, but no e2e slot here is free ($local_depth queued for $slots)"
    else
      echo "verify-quick: e2e on the runner: its e2e queue is $remote_depth deep"
    fi
  }

  echo "verify-quick: static gates on the runner (base ${base:0:8}), then e2e on the runner or this Mac, whichever is free"
  if [[ -n "$dry" ]]; then
    echo "would run: REMOTE_RUN=$run REMOTE_KEEP=1 ./scripts/remote-run.sh bash -c \"$static && touch $built\""
    choose_host
    if [[ "$host" == local ]]; then
      echo "would run: bash -c \"$e2e_step\""
    else
      echo "would run: REMOTE_RUN=$run ./scripts/remote-run.sh bash -c \"$e2e_step\""
    fi
    exit 0
  fi
  trap './scripts/remote-run.sh --drop "$run" || true' EXIT
  REMOTE_RUN="$run" REMOTE_KEEP=1 ./scripts/remote-run.sh bash -c "$static && touch $built"
  choose_host
  if [[ "$host" == local ]]; then
    ./scripts/remote-run.sh --drop "$run" || true
    bash -c "$e2e_step"
  else
    REMOTE_RUN="$run" ./scripts/remote-run.sh bash -c "$e2e_step"
  fi
fi
# A passing fast or full run covers drift up to this base: a later --preflight
# on the same base skips to own specs.
[[ "$level" != own ]] && echo "$merge_base" >"$stamp"
echo "verify-quick: PASS ($summary)"
