#!/bin/sh
set -eu
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir "$root/bin"
cat > "$root/bin/docker" <<'MOCK'
#!/bin/sh
if [ "$1" = inspect ]; then
  printf '%s\n' "$WATCHDOG_TEST_HEALTH"
else
  echo restarted >> "$WATCHDOG_TEST_CALLS"
fi
MOCK
printf '#!/bin/sh\nexit 0\n' > "$root/bin/logger"
chmod +x "$root/bin/docker" "$root/bin/logger"
export PATH="$root/bin:$PATH" FOREST_WATCHDOG_STATE_DIR="$root/state" WATCHDOG_TEST_CALLS="$root/calls"
export WATCHDOG_TEST_HEALTH='true healthy 2020-01-01T00:00:00Z'
sh scripts/forest-api-watchdog.sh
test ! -f "$root/calls"
export WATCHDOG_TEST_HEALTH="true unhealthy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
sh scripts/forest-api-watchdog.sh
test ! -f "$root/calls"
export WATCHDOG_TEST_HEALTH='true unhealthy 2020-01-01T00:00:00Z'
sh scripts/forest-api-watchdog.sh
test "$(wc -l < "$root/calls")" -eq 2
sh scripts/forest-api-watchdog.sh
test "$(wc -l < "$root/calls")" -eq 2
now=$(date +%s)
for container in forest-core-server forest-vendor-integration; do
  printf '%s\n' "$((now-700))" "$((now-800))" "$((now-900))" > "$root/state/$container.restarts"
done
sh scripts/forest-api-watchdog.sh
test "$(wc -l < "$root/calls")" -eq 2
echo 'Watchdog checks passed: healthy/startup skipped, unhealthy recovered, cooldown enforced'
