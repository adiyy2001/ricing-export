#!/usr/bin/env bash
input=$(cat)
limits_dir="$HOME/.local/share/command-center"
if [ -d "$limits_dir" ]; then
  account=$(jq -r '.oauthAccount.emailAddress // empty' "$HOME/.claude.json" 2>/dev/null)
  snapshot=$(jq -c --arg now "$(date +%s)" --arg account "$account" 'select(.rate_limits != null) | {at: ($now | tonumber), rate_limits} + (if $account == "" then {} else {account: $account} end)' <<<"$input" 2>/dev/null)
  if [ -n "$snapshot" ]; then
    tmp="$limits_dir/.plan-limits.$$"
    printf '%s\n' "$snapshot" >"$tmp" && mv -f "$tmp" "$limits_dir/plan-limits.json"
  fi
fi
jq -r '
  def k: if . >= 1000000 then "\(. / 100000 | floor / 10)M" elif . >= 1000 then "\(. / 1000 | floor)k" else "\(.)" end;
  def pct: if . == null then "?" else "\(. | floor)%" end;
  (.context_window.current_usage // {}) as $u
  | (($u.input_tokens // 0) + ($u.cache_creation_input_tokens // 0) + ($u.cache_read_input_tokens // 0)) as $ctx
  | [
      (.model.display_name // "?"),
      (.effort.level // empty),
      ("ctx " + ($ctx | k) + (if $ctx > 200000 then " /clear?" else "" end)),
      ("5h " + (.rate_limits.five_hour.used_percentage | pct)),
      ("7d " + (.rate_limits.seven_day.used_percentage | pct)),
      (if .prompt_cache.warm == false then "cache cold" else empty end)
    ]
  | join(" · ")
' <<<"$input" 2>/dev/null || echo "statusline: jq error"
