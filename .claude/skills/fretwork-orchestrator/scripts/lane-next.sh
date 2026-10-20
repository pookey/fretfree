#!/usr/bin/env bash
# Integrate the first LANE_BATCH (default 4) WPs in .orchestrator/lane-queue.txt
# (one ID per line, in order; put hotfixes at the top) as one batch: one
# verify, one ship. Then exit. Run it in the background and start it again
# after each result, so every ship produces its own notification.
#   - if the batch fails verify, re-runs its WPs one at a time to find the culprit;
#   - waits while load1 > LANE_MAX_LOAD (default 45): verify under heavy load
#     times out in Playwright;
#   - waits while the lane is busy (integrate.sh exit 2);
#   - retries transient failures up to 3 times: git exit 128, or a verify that
#     failed only on getcwd EINTR ("Interrupted system call");
#   - removes the WPs from the queue whatever the outcome, and prints one
#     INTEGRATE_EXIT <WP> = <rc> line per WP (see integrate.sh for the codes).
# Usage: lane-next.sh            (queue: add with `echo M1-04 >> .orchestrator/lane-queue.txt`)
#        LANE_BATCH=1 lane-next.sh   (one WP at a time, the old behaviour)
source "$(dirname "$0")/common.sh"
Q="$ORCH/lane-queue.txt"
touch "$Q"
mapfile -t wps < <(grep -E '^M[0-9]+-[0-9]+$' "$Q" | head -n "${LANE_BATCH:-4}")
((${#wps[@]} > 0)) || { echo "LANE: queue empty"; exit 0; }
cd "$MAIN"
set +e

declare -A result
# integrate <WP…>: run integrate.sh with the lane's waits and retries; sets rc
# and out (its output).
integrate() {
  local transient=0
  while :; do
    while (($(sysctl -n vm.loadavg | awk '{printf "%d", $2}') > ${LANE_MAX_LOAD:-45})); do sleep 30; done
    out="$("$SKILL_DIR/scripts/integrate.sh" "$@" 2>&1)"
    rc=$?
    echo "$out"
    if ((rc == 2)); then sleep 20; continue; fi
    if ((rc == 128 && transient < 3)); then transient=$((transient + 1)); sleep 10; continue; fi
    if ((rc == 4 && transient < 3)) && tail -40 "$ORCH/logs/$1-integrate.log" | grep -q "Interrupted system call"; then
      echo "lane: $* verify hit getcwd EINTR; retrying"
      transient=$((transient + 1))
      $STATE event verify-failed-env "$*: getcwd EINTR during ship; auto-retry" >/dev/null 2>&1
      sleep 30
      continue
    fi
    return
  done
}

integrate "${wps[@]}"
for wp in $(sed -n 's/^SKIPPED \([^ ]*\) .*/\1/p' <<<"$out"); do result[$wp]=3; done
shipped="$(sed -n 's/^BATCH //p' <<<"$out" | tail -1)"
if ((rc == 4)) && (($(wc -w <<<"$shipped") > 1)); then
  echo "lane: batch failed verify; re-running $shipped one at a time"
  for wp in $shipped; do
    integrate "$wp"
    result[$wp]=$rc
    ((rc == 5 || rc == 6)) && break # stop the line: leave the rest queued
  done
elif [[ -n "$shipped" ]]; then
  for wp in $shipped; do result[$wp]=$rc; done
else
  # integrate.sh stopped before naming a batch (a precondition failed): report
  # its exit code for every WP it wasn't explicit about.
  for wp in "${wps[@]}"; do [[ -n "${result[$wp]:-}" ]] || result[$wp]=$rc; done
fi

for wp in "${wps[@]}"; do
  [[ -n "${result[$wp]:-}" ]] || continue
  grep -v -x "$wp" "$Q" >"$Q.tmp"
  mv "$Q.tmp" "$Q"
  echo "INTEGRATE_EXIT $wp = ${result[$wp]}"
done
echo "queue now: $(tr '\n' ' ' <"$Q")"
