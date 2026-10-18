#!/usr/bin/env bash
# One-line status per in-flight work package, plus usage-limit detection.
# Exit code 10 if any agent shows a usage/rate-limit message (back off!).
source "$(dirname "$0")/common.sh"
need_herdr
limit=0
printf '%-7s %-12s %-28s %-9s %-7s %s\n' WP STATE AGENT STATUS REPORT REVIEW
while IFS=$'\t' read -r wp st agent pane rv; do
  [[ -z "$wp" ]] && continue
  target="${rv:-$agent}"
  status="$(agent_status "$target")"
  rep=no; [[ -f "$ORCH/reports/$wp.md" ]] && rep=yes
  verdict="-"
  [[ -f "$ORCH/reports/$wp.review.md" ]] && verdict="$(grep -m1 -oE 'VERDICT: *(APPROVE|CHANGES)' "$ORCH/reports/$wp.review.md" | awk '{print $2}' || echo '?')"
  if herdr agent read "$target" --source recent-unwrapped --lines 40 2>/dev/null |
    grep -qiE 'usage limit|rate limit|limit reached|reached your .*limit|try again (at|in) '; then
    status="$status!LIMIT"
    limit=1
  fi
  printf '%-7s %-12s %-28s %-9s %-7s %s\n' "$wp" "$st" "$target" "$status" "$rep" "$verdict"
done < <($STATE show | jq -r '.workers[] | select(.status != "done") | [.wp, .status, .agent, .pane, (.reviewer.agent // "")] | @tsv')
$STATE sample >/dev/null
((limit == 0)) || { echo "poll: usage/rate limit detected; pause new spawns" >&2; exit 10; }
