#!/usr/bin/env bash
# Integrate the first WP in .orchestrator/lane-queue.txt (one ID per line, in
# order; put hotfixes at the top), then exit. Run it in the background and
# start it again after each result, so every ship produces its own notification.
#   - waits while load1 > LANE_MAX_LOAD (default 45): verify under heavy load
#     times out in Playwright;
#   - waits while the lane is busy (integrate.sh exit 2);
#   - retries transient failures up to 3 times: git exit 128, or a verify that
#     failed only on getcwd EINTR ("Interrupted system call");
#   - removes the WP from the queue whatever the outcome, and prints
#     INTEGRATE_EXIT <WP> = <rc> (see integrate.sh for the codes).
# Usage: lane-next.sh            (queue: add with `echo M1-04 >> .orchestrator/lane-queue.txt`)
source "$(dirname "$0")/common.sh"
Q="$ORCH/lane-queue.txt"
touch "$Q"
wp="$(grep -m1 -E '^M[0-9]+-[0-9]+$' "$Q" || true)"
[[ -n "$wp" ]] || { echo "LANE: queue empty"; exit 0; }
cd "$MAIN"
set +e
transient=0
while :; do
  while (($(sysctl -n vm.loadavg | awk '{printf "%d", $2}') > ${LANE_MAX_LOAD:-45})); do sleep 30; done
  "$SKILL_DIR/scripts/integrate.sh" "$wp"
  rc=$?
  if ((rc == 2)); then sleep 20; continue; fi
  if ((rc == 128 && transient < 3)); then transient=$((transient + 1)); sleep 10; continue; fi
  if ((rc == 4 && transient < 3)) && tail -40 "$ORCH/logs/$wp-integrate.log" | grep -q "Interrupted system call"; then
    echo "lane: $wp verify hit getcwd EINTR; retrying"
    transient=$((transient + 1))
    $STATE event verify-failed-env "$wp: getcwd EINTR during ship; auto-retry" >/dev/null 2>&1
    sleep 30
    continue
  fi
  break
done
grep -v -x "$wp" "$Q" >"$Q.tmp"
mv "$Q.tmp" "$Q"
echo "INTEGRATE_EXIT $wp = $rc"
echo "queue now: $(tr '\n' ' ' <"$Q")"
