# Shared helpers for the orchestrator scripts. Source, don't execute.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN="$(git -C "$SKILL_DIR" rev-parse --path-format=absolute --git-common-dir | sed 's#/\.git$##')"
ORCH="$MAIN/.orchestrator"
WORKTREES="$ORCH/worktrees"
STATE="node $SKILL_DIR/scripts/state.mjs"
BACKLOG="node $SKILL_DIR/scripts/backlog.mjs"
MAX_PANES_PER_TAB="${MAX_PANES_PER_TAB:-4}"
mkdir -p "$ORCH/reports" "$ORCH/briefs" "$ORCH/logs" "$WORKTREES"

die() { echo "orchestrator: $*" >&2; exit 1; }
need_herdr() { [[ "${HERDR_ENV:-}" == 1 ]] || die "not running inside Herdr (HERDR_ENV != 1)"; }
lower() { tr '[:upper:]' '[:lower:]' <<<"$1"; }
agent_name() { echo "$1-$(lower "$2")"; } # agent_name wp M1-04 → wp-m1-04
worker_field() { $STATE show | jq -r --arg wp "$1" --arg f "$2" '.workers[$wp][$f] // empty'; }
agent_status() { herdr agent get "$1" 2>/dev/null | jq -r '.result.agent.agent_status // "none"' || echo none; }

# Find room for a new pane in an orchestrator-created tab (≤ MAX_PANES_PER_TAB
# panes, splitting the largest pane along its long side), or create a new tab.
# Prints the new pane ID. Never touches tabs the orchestrator didn't create.
place_pane() {
  local cwd="$1" tab count pane rect dir
  for tab in $($STATE show | jq -r '.tabs[].tab_id'); do
    count="$(herdr tab get "$tab" 2>/dev/null | jq -r '.result.tab.pane_count // 0')" || count=0
    if [[ "$count" == 0 ]]; then $STATE tab-drop "$tab"; continue; fi
    [[ "$count" -ge "$MAX_PANES_PER_TAB" ]] && continue
    pane="$(herdr pane list --workspace "$HERDR_WORKSPACE_ID" | jq -r --arg t "$tab" \
      '[.result.panes[] | select(.tab_id == $t)][0].pane_id')"
    rect="$(herdr pane layout --pane "$pane" | jq -c '.result.layout.panes | max_by(.rect.width * .rect.height)')"
    pane="$(jq -r '.pane_id' <<<"$rect")"
    # Terminal cells are ~2:1, so split right only when clearly wide.
    if (($(jq -r '.rect.width' <<<"$rect") > 2 * $(jq -r '.rect.height' <<<"$rect"))); then dir=right; else dir=down; fi
    herdr pane split "$pane" --direction "$dir" --cwd "$cwd" --no-focus | jq -r '.result.pane.pane_id'
    return
  done
  local n label out
  n=$(($($STATE show | jq '.tabs | length') + 1))
  label="fretwork-workers-$n"
  out="$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$cwd" --label "$label" --no-focus)"
  $STATE tab-add "$(jq -r '.result.tab.tab_id' <<<"$out")" "$label" >/dev/null
  jq -r '.result.root_pane.pane_id' <<<"$out"
}

# Fill {{PLACEHOLDERS}} in a template from environment variables of the same name.
render() {
  node -e '
    const fs = require("fs");
    const t = fs.readFileSync(process.argv[1], "utf8");
    process.stdout.write(t.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
      if (process.env[k] === undefined) throw new Error("template variable not set: " + k);
      return process.env[k];
    }));
  ' "$1"
}
