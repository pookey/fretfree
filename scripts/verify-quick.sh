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

# Decide what runs, then run it as one command: on the remote test runner when
# one is configured (scripts/remote-run.sh), so it syncs and builds once.
static="./scripts/cpu-slot.sh pnpm verify:static"
case "$level" in
  full) steps="$static && pnpm --filter app e2e:only"; summary="static + full e2e matrix" ;;
  fast) steps="$static && pnpm --filter app e2e:fast"; summary="static + fast e2e" ;;
  own)
    if ((${#specs[@]} == 0)); then
      steps="$static"; summary="static; no e2e spec touches this change"
    else
      echo "verify-quick: e2e on own specs: ${specs[*]}"
      steps="$static && pnpm --filter app e2e:only $(printf '%q ' "${specs[@]}")"
      summary="static + ${#specs[@]} own spec(s)"
    fi ;;
esac

echo "verify-quick: static gates (base ${base:0:8})"
if [[ -n "$dry" ]]; then
  echo "would run: ./scripts/remote-run.sh bash -c \"$steps\""
  exit 0
fi
./scripts/remote-run.sh bash -c "$steps"
# A passing fast or full run covers drift up to this base: a later --preflight
# on the same base skips to own specs.
[[ "$level" != own ]] && echo "$merge_base" >"$stamp"
echo "verify-quick: PASS ($summary)"
