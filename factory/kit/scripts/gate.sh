#!/usr/bin/env bash
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
all_steps=(style tests-guard factory-unit install lint types unit build)
steps=("$@")
[ "${#steps[@]}" -eq 0 ] && steps=("${all_steps[@]}")

export CI=true
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

run_step() {
  case "$1" in
    style) node "$root/factory/guards.mjs" style "${FACTORY_START_SHA:-HEAD}" ;;
    tests-guard) node "$root/factory/guards.mjs" tests "${FACTORY_START_SHA:-HEAD}" ;;
    factory-unit) node --test "$root"/factory/*.test.mjs ;;
    install) (cd "$root" && pnpm install --frozen-lockfile) ;;
    lint) (cd "$root" && pnpm lint) ;;
    types) (cd "$root" && pnpm typecheck) ;;
    unit) (cd "$root" && pnpm test) ;;
    build) (cd "$root" && pnpm build) ;;
    *) echo "unknown step $1"; return 2 ;;
  esac
}

run_steps() {
  local log
  log="$(mktemp)"
  for step in "${steps[@]}"; do
    local started=$SECONDS
    if run_step "$step" >"$log" 2>&1; then
      echo "ok $step $((SECONDS - started))s"
    else
      echo "FAIL $step $((SECONDS - started))s"
      tail -n "${FACTORY_GATE_TAIL:-60}" "$log"
      rm -f "$log"
      return 1
    fi
  done
  rm -f "$log"
  echo "GATE OK"
}

if [ -n "${FACTORY_HEAVY_LOCK:-}" ]; then
  exec 8>"$FACTORY_HEAVY_LOCK"
  flock 8
fi
run_steps
