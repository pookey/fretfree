#!/usr/bin/env bash
# Block until some in-flight WP needs orchestrator action, then print poll.sh's
# table plus a "WATCH: <WP>:<reason> …" line. Run it in the background; its exit
# is the wake-up. Exit 10 means a usage limit (pause spawns).
# A working/fixing WP counts only when its agent is idle, its screen shows
# "REPORTED <WP>", either no background shell is still running (workers often
# run pnpm verify in the background and go idle) or REPORTED is its last
# message, and its state hasn't changed in
# the last 3 minutes (a brief sent just now can leave the old REPORTED on screen).
# Reviewer verdicts and blocked agents always count.
# Usage: watch.sh [timeout-seconds, default 1200]
source "$(dirname "$0")/common.sh"
need_herdr
max="${1:-1200}" start="$(date +%s)"
set +e
while :; do
  out="$("$SKILL_DIR/scripts/poll.sh" 2>&1)"
  rc=$?
  if ((rc == 10)); then echo "$out"; echo "WATCH: usage limit"; exit 10; fi
  act=""
  while read -r line; do
    wp="$(awk '{print $1}' <<<"$line")" st="$(awk '{print $2}' <<<"$line")" agent="$(awk '{print $3}' <<<"$line")"
    case "$line" in
      *"(blocked)"*) act+="$wp:blocked "; continue ;;
      *"integrate.sh"* | *"send-brief.sh"* | *"read reviewer"*) act+="$wp:review-done "; continue ;;
    esac
    [[ "$st" == working || "$st" == fixing ]] || continue
    upd="$(worker_field "$wp" updatedAt)"
    if [[ -n "$upd" ]] && (($(date +%s) - $(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${upd%.*}" +%s 2>/dev/null || echo 0) < 180)); then continue; fi
    s="$(agent_status "$agent")"
    [[ "$s" == idle || "$s" == done ]] || continue
    scr="$(herdr agent read "$agent" --source visible --lines 30 2>/dev/null)"
    grep -q "REPORTED $wp" <<<"$scr" || continue
    # A shell left running (a dev server, a monitor) used to hide a finished
    # report for an hour. With a shell open, REPORTED still counts if it is the
    # agent's last message: after a stale one it would have said more.
    if grep -qE "shells? still running" <<<"$scr"; then
      grep -E "^⏺ " <<<"$scr" | tail -1 | grep -q "REPORTED $wp" || continue
    fi
    act+="$wp:reported "
  done < <(grep -E '^M[0-9]+-[0-9]+ ' <<<"$out")
  if [[ -n "$act" ]]; then echo "$out"; echo "WATCH: $act"; exit 0; fi
  if (($(date +%s) - start > max)); then echo "$out"; echo "WATCH: timeout"; exit 0; fi
  sleep 60
done
