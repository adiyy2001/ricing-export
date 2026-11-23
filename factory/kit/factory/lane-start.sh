#!/usr/bin/env bash
set -euo pipefail
track=$1
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data="${FACTORY_DATA_DIR:-$HOME/.local/share/factory/$(basename "$repo")}"
mkdir -p "$data"
exec 9>"$data/conductor.lock"
flock -n 9 || { echo "a conductor already runs in $repo"; exit 0; }
cd "$repo"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CONFIG_DIR
export FACTORY_LOG_DIR="$data"
export FACTORY_HEAVY_LOCK="${FACTORY_HEAVY_LOCK:-$HOME/.local/share/factory/gate.lock}"
exec nice -n 10 node factory/run.mjs --queue "waves/$track/queue.json" --loop >> "$data/conductor-$track.log" 2>&1
