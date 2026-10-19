#!/usr/bin/env bash
# A cheaper check for a work-package branch than the full `pnpm verify`:
#  1. every static gate (typecheck, lint, format, unit + coverage, infra, build,
#     bundle budget), in a machine-wide CPU slot (scripts/cpu-slot.sh);
#  2. Playwright on the branch's own specs only, unless the change can reach
#     other specs, in which case the full suite runs.
# The integration lane still runs the full `pnpm verify` before every ship.
#
# A change stays "local" when every changed file is docs, an e2e spec, a new
# per-area engine config file, or a file inside an existing drill folder. A new
# drill.ts (a new registration changes what fresh sessions serve) or anything
# else (shell, session, screens, skills, theory, storage, helpers, config…)
# runs the full e2e suite.
#
# Usage: verify-quick.sh [--since <ref>] [--full] [--dry-run]
#   --since <ref>  judge only changes after <ref> (e.g. a fix round's starting
#                  commit). The default is the merge base with origin/main.
#   --full         always run the full e2e suite.
#   --dry-run      print what would run, and run nothing.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

since="" full="" dry=""
while (($#)); do
  case "$1" in
    --since) since="${2:?--since needs a ref}"; shift 2 ;;
    --full) full=1; shift ;;
    --dry-run) dry=1; shift ;;
    *) echo "verify-quick: unknown argument $1" >&2; exit 2 ;;
  esac
done
base="${since:-$(git merge-base HEAD origin/main)}"

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

run() { if [[ -n "$dry" ]]; then echo "would run: $*"; else "$@"; fi; }

echo "verify-quick: static gates (base ${base:0:8})"
run ./scripts/cpu-slot.sh pnpm verify:static

if [[ -n "$full" || -z "$local_only" ]]; then
  if [[ -z "$full" ]]; then
    echo "verify-quick: full e2e, because the change reaches beyond its own drill and specs:"
    printf '  %s\n' "${reasons[@]:0:8}"
  fi
  run pnpm --filter app e2e:only
  echo "verify-quick: PASS (static + full e2e)"
  exit 0
fi

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

if ((${#specs[@]} == 0)); then
  echo "verify-quick: PASS (static; no e2e spec touches this change)"
  exit 0
fi
IFS=$'\n' read -r -d '' -a specs < <(printf '%s\n' "${specs[@]}" | sort -u) || true
echo "verify-quick: e2e on own specs: ${specs[*]}"
run pnpm --filter app e2e:only "${specs[@]}"
echo "verify-quick: PASS (static + ${#specs[@]} own spec(s))"
