#!/usr/bin/env bash
# One-line status per in-flight work package, plus usage-limit detection.
# Exit code 10 if any agent shows a usage/rate-limit message (back off!).
source "$(dirname "$0")/common.sh"
need_herdr
limit=0
printf '%-7s %-12s %-10s %-9s %-7s %-8s %s\n' WP STATE AGENT STATUS REPORT REVIEW NEXT
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
  settled=no
  [[ "$status" == idle* || "$status" == done* ]] && settled=yes
  next="wait"
  case "$st:$settled" in
    working:yes | fixing:yes) [[ $rep == yes ]] && next="review: spawn.sh $wp reviewer" || next="read agent (settled without report)" ;;
    reviewing:yes)
      case "$verdict" in
        APPROVE) next="integrate.sh $wp" ;;
        CHANGES) next="send-brief.sh $wp fix" ;;
        *) next="read reviewer (settled without verdict)" ;;
      esac ;;
    *:no) [[ "$status" == blocked* ]] && next="read + decide (blocked)" ;;
  esac
  printf '%-7s %-12s %-10s %-9s %-7s %-8s %s\n' "$wp" "$st" "$target" "$status" "$rep" "$verdict" "$next"
done < <($STATE show | jq -r '.workers[] | select(.status != "done") | [.wp, .status, .agent, .pane, (.reviewer.agent // "")] | @tsv')
$STATE sample >/dev/null
((limit == 0)) || { echo "poll: usage/rate limit detected; pause new spawns" >&2; exit 10; }
