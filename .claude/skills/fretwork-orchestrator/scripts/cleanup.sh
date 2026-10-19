#!/usr/bin/env bash
# Close the panes this orchestrator created for a WP, remove its worktree and
# (if merged) its branch, and drop it from state. Never closes other panes.
# Usage: cleanup.sh <WP> [--keep-branch]
source "$(dirname "$0")/common.sh"
need_herdr
WP="${1:?WP}"
# Forward reviewers' downstream notes ("- M1-09: …" plus indented continuation
# lines) into those packages' notes, which spawn.sh puts in their briefs.
for review in "$ORCH/reports/$WP".review*.md; do
  [[ -f "$review" ]] || continue
  awk -v wp="$WP" -v dir="$ORCH/notes" '
    /^## Downstream notes/ { on = 1; next }
    /^## / { on = 0 }
    !on { next }
    # "- M3-11: …", and the drift reviewers produce: "- **M3-11**: …",
    # "- M3-11 (context panel): …", "- M3-09 / later views: …".
    /^- \**M[0-9]+-[0-9]+\**[^:]*:/ {
      match($0, /M[0-9]+-[0-9]+/); target = substr($0, RSTART, RLENGTH)
      rest = $0; sub(/^[^:]*: */, "", rest)
      file = dir "/" target ".md"
      print "- From the " wp " review:" (rest == "" ? "" : " " rest) >> file
      next
    }
    /^[ \t]+/ && file != "" { print >> file; next }
    { file = "" }
  ' "$review"
done
for pane in $($STATE show | jq -r --arg wp "$WP" '.workers[$wp] | [.pane, .reviewer.pane] | map(select(. != null)) | .[]'); do
  herdr pane close "$pane" >/dev/null 2>&1 || true
done
wt="$WORKTREES/$WP"
# Dev servers and test runners can outlive their pane; stop anything still running from the worktree.
pkill -f "$wt/" 2>/dev/null && sleep 2 || true
[[ -d "$wt" ]] && git -C "$MAIN" worktree remove --force "$wt"
if [[ "${2:-}" != --keep-branch ]] && git -C "$MAIN" merge-base --is-ancestor "wp/$WP" main 2>/dev/null; then
  git -C "$MAIN" branch -d "wp/$WP" >/dev/null
fi
$STATE worker "$WP" '{"status":"done","pane":null,"reviewer":null}' >/dev/null
for tab in $($STATE show | jq -r '.tabs[].tab_id'); do
  herdr tab get "$tab" >/dev/null 2>&1 || $STATE tab-drop "$tab"
done
echo "cleaned up $WP"
