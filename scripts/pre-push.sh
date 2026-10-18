#!/usr/bin/env bash
# Git pre-push hook (installed by simple-git-hooks on `pnpm install`).
# Verifies exactly what is being pushed, in isolation from the working tree:
#  1. secret-scans the pushed commits;
#  2. skips verification for docs-only pushes;
#  3. reuses the result if this SHA was already verified (e.g. by `pnpm ship`);
#  4. otherwise runs `pnpm verify` in a temporary clean worktree of the commit.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source scripts/lib.sh
zero=0000000000000000000000000000000000000000
stamps="$(git rev-parse --git-common-dir)/fretwork-verified"
touch "$stamps"

while read -r _local_ref local_sha _remote_ref remote_sha; do
  [[ "$local_sha" == "$zero" ]] && continue
  if [[ "$remote_sha" == "$zero" ]]; then
    base="$(git merge-base origin/main "$local_sha" 2>/dev/null || true)"
  else
    base="$remote_sha"
  fi
  range="${base:+$base..}$local_sha"

  ./scripts/secret-scan.sh "$range" || { echo "pre-push: secret scan failed" >&2; exit 1; }

  changed="$(git diff --name-only "${base:-$(git hash-object -t tree /dev/null)}" "$local_sha")"
  if [[ -n "$changed" ]] && ! grep -qvE '^(docs/.*|.*\.md|LICENSE)$' <<<"$changed"; then
    echo "pre-push: docs-only change; skipping verify for ${local_sha:0:8}"
    continue
  fi
  if grep -qx "$local_sha" "$stamps"; then
    echo "pre-push: ${local_sha:0:8} already verified"
    continue
  fi

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/fretwork-verify.XXXXXX")"
  cleanup() { git worktree remove --force "$tmp" >/dev/null 2>&1 || rm -rf "$tmp"; }
  trap cleanup EXIT
  echo "pre-push: verifying ${local_sha:0:8} in a clean worktree ($tmp)"
  git worktree add --detach "$tmp" "$local_sha" >/dev/null
  (cd "$tmp" && pnpm install --frozen-lockfile --prefer-offline --ignore-scripts >/dev/null && pnpm verify) </dev/null
  echo "$local_sha" >> "$stamps"
  cleanup
  trap - EXIT
done
