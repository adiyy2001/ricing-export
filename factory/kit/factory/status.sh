#!/usr/bin/env bash
set -u
mins="${1:-120}"
shift || true
base="$HOME/.local/share/factory"
running=$(ps -eo pid,etime,args | awk '$3 ~ /node$/ && /factory\/run\.mjs/' | cut -c1-120)
echo "conductors: ${running:-none}"
for data in "$base"/*/; do
  [ -d "$data" ] || continue
  log=$(ls -t "$data"conductor-*.log 2>/dev/null | head -1)
  [ -s "$log" ] && echo "$(basename "$data") $(basename "$log"): $(tail -n 1 "$log" | cut -c1-160)"
done
for repo in "$@"; do
  [ -d "$repo/waves" ] || continue
  for queue in "$repo"/waves/*/queue.json; do
    [ -f "$queue" ] || continue
    echo "$(basename "$repo") $(basename "$(dirname "$queue")"): $(cd "$repo" && node factory/run.mjs --queue "${queue#"$repo"/}" --status)"
  done
  find "$repo/waves" -path "*/blocked/*" -name "*.md" -type f -mmin -"$mins" 2>/dev/null | sed "s#^.*/waves/#new block $(basename "$repo"): #"
done
usage="${FACTORY_USAGE_FILE:-$HOME/.local/share/command-center/plan-limits.json}"
[ -s "$usage" ] && jq -r --argjson now "$(date +%s)" '"usage: 7d \(.rate_limits.seven_day.used_percentage // "?")%, snapshot age min: \((($now - .at) / 60) | floor)"' "$usage"
echo "load: $(cut -d' ' -f1-3 /proc/loadavg), mem free: $(LC_ALL=C free -g | awk '/Mem/{print $7}') GB"
