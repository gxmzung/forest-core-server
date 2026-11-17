#!/bin/sh
set -eu
umask 077
state_dir=${FOREST_WATCHDOG_STATE_DIR:-/var/lib/forest-api-watchdog}
mkdir -p "$state_dir"
exec 9>"$state_dir/lock"
flock -n 9 || exit 0
now=$(date +%s)
for container in forest-core-server forest-vendor-integration; do
  info=$(docker inspect --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.State.StartedAt}}' "$container" 2>/dev/null) || continue
  read -r running health started <<EOF
$info
EOF
  [ "$running" = true ] && [ "$health" = unhealthy ] || continue
  started_at=$(date -d "$started" +%s) || continue
  [ "$((now - started_at))" -ge 180 ] || continue
  history="$state_dir/$container.restarts"
  touch "$history"
  last=$(tail -1 "$history")
  last=${last:-0}
  [ "$((now - last))" -ge 600 ] || continue
  recent=$(awk -v cutoff="$((now - 3600))" '$1 > cutoff {n++} END {print n+0}' "$history")
  [ "$recent" -lt 3 ] || continue
  logger -t forest-api-watchdog "Restarting unhealthy $container; persistent data retained"
  docker restart --time 10 "$container" >/dev/null
  printf '%s\n' "$now" >> "$history"
done
