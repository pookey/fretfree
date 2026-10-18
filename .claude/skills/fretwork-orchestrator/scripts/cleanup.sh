#!/usr/bin/env bash
# Close the panes this orchestrator created for a WP, remove its worktree and
# (if merged) its branch, and drop it from state. Never closes other panes.
# Usage: cleanup.sh <WP> [--keep-branch]
source "$(dirname "$0")/common.sh"
need_herdr
WP="${1:?WP}"
# Forward reviewers' downstream notes ("- M1-09: …") into those packages' briefs.
for review in "$ORCH/reports/$WP".review*.md; do
  [[ -f "$review" ]] || continue
  sed -n '/^## Downstream notes/,/^## /p' "$review" | grep -E '^- M[0-9]+-[0-9]+:' |
    while IFS= read -r line; do
      target="$(sed -E 's/^- (M[0-9]+-[0-9]+):.*/\1/' <<<"$line")"
      echo "- From the $WP review: ${line#*: }" >>"$ORCH/notes/$target.md"
    done
done
for pane in $($STATE show | jq -r --arg wp "$WP" '.workers[$wp] | [.pane, .reviewer.pane] | map(select(. != null)) | .[]'); do
  herdr pane close "$pane" >/dev/null 2>&1 || true
done
wt="$WORKTREES/$WP"
[[ -d "$wt" ]] && git -C "$MAIN" worktree remove --force "$wt"
if [[ "${2:-}" != --keep-branch ]] && git -C "$MAIN" merge-base --is-ancestor "wp/$WP" main 2>/dev/null; then
  git -C "$MAIN" branch -d "wp/$WP" >/dev/null
fi
$STATE worker "$WP" '{"status":"done","pane":null,"reviewer":null}' >/dev/null
for tab in $($STATE show | jq -r '.tabs[].tab_id'); do
  herdr tab get "$tab" >/dev/null 2>&1 || $STATE tab-drop "$tab"
done
echo "cleaned up $WP"
