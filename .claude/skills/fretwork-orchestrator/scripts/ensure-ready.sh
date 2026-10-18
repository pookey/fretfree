#!/usr/bin/env bash
# Wait until the Claude agent in <pane> is ready for input, handling the
# first-run "trust this folder" prompt — but only for project-created worktrees.
# Usage: ensure-ready.sh <pane-id> <cwd> [agent-name] [timeout-seconds]
source "$(dirname "$0")/common.sh"
need_herdr
pane="$1" cwd="$2" name="${3:-}" timeout="${4:-120}"
deadline=$((SECONDS + timeout))

while ((SECONDS < deadline)); do
  status="$(agent_status "$pane")"
  screen="$(herdr pane read "$pane" --source visible --lines 80 2>/dev/null || true)"
  if grep -qiE 'trust (this|the files in this) folder|Do you trust' <<<"$screen"; then
    case "$cwd" in
      "$WORKTREES"/*) ;;
      *) echo "ensure-ready: trust prompt for $cwd, which is not a project worktree; refusing" >&2; exit 3 ;;
    esac
    choice="$(grep -E 'Yes, I trust this folder' <<<"$screen" | head -1)"
    [[ -n "$choice" ]] || { echo "ensure-ready: unrecognised trust dialog:" >&2; echo "$screen" >&2; exit 4; }
    if [[ "$choice" == *"❯"* ]]; then
      herdr pane send-keys "$pane" enter >/dev/null
    else
      num="$(sed -E 's/.*([0-9])\. *Yes, I trust this folder.*/\1/' <<<"$choice")"
      herdr pane send-keys "$pane" "$num" >/dev/null
    fi
    echo "ensure-ready: accepted trust prompt for $cwd"
    sleep 3
    continue
  fi
  case "$status" in
    idle | done)
      if [[ -n "$name" ]] && [[ "$(herdr agent get "$pane" | jq -r '.result.agent.name // empty')" != "$name" ]]; then
        herdr agent rename "$pane" "$name" >/dev/null
      fi
      exit 0
      ;;
    blocked)
      echo "ensure-ready: $pane is blocked on something other than the trust prompt:" >&2
      echo "$screen" | grep -v '^\s*$' | tail -30 >&2
      exit 5
      ;;
  esac
  sleep 2
done
echo "ensure-ready: timed out waiting for $pane" >&2
exit 6
