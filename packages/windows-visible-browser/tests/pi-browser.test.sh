#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cli="$repo_dir/skills/windows-visible-browser/scripts/pi-browser"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

new_bridge() {
  local bridge
  bridge="$(mktemp -d "$tmp/bridge.XXXXXX")"
  mkdir -p "$bridge/requests" "$bridge/responses"
  : >"$bridge/BrowserBridge.ps1"
  printf '%s\n' "$bridge"
}

respond_ok() {
  local bridge="$1"
  local expected_action="$2"
  local expected_instance="$3"
  local request_file id instance

  for _ in {1..80}; do
    request_file="$(find "$bridge/requests" -maxdepth 1 -name '*.json' -type f -print -quit)"
    [[ -n "$request_file" ]] && break
    sleep 0.05
  done
  [[ -n "${request_file:-}" ]]
  jq -e --arg action "$expected_action" '.action == $action' "$request_file" >/dev/null
  if [[ -n "$expected_instance" ]]; then
    jq -e --arg instance "$expected_instance" '.instance == $instance' "$request_file" >/dev/null
    instance="$expected_instance"
  else
    jq -e 'has("instance") | not' "$request_file" >/dev/null
    instance="default"
  fi

  id="$(jq -r '.id' "$request_file")"
  jq -n \
    --arg id "$id" \
    --arg action "$expected_action" \
    --arg instance "$instance" \
    '{protocolVersion:2,id:$id,ok:true,action:$action,result:{instance:$instance,chromeRunning:true,processRunning:true,cdpReachable:true,debugPort:9777,cdpUrl:"http://127.0.0.1:9777",profile:"test"}}' \
    >"$bridge/responses/$id.json"
  rm -f "$request_file"
}

run_status_test() {
  local bridge="$1"
  local expected_action="$2"
  local expected_instance="$3"
  shift 3

  respond_ok "$bridge" "$expected_action" "$expected_instance" &
  local responder=$!
  local output
  output="$(PI_BROWSER_BRIDGE_DIR="$bridge" "$@")"
  wait "$responder"
  jq -e --arg instance "${expected_instance:-default}" '.result.instance == $instance' <<<"$output" >/dev/null
}

bridge="$(new_bridge)"
run_status_test "$bridge" status "" env -u PI_BROWSER_INSTANCE -u PI_SESSION_ID "$cli" status --json

bridge="$(new_bridge)"
run_status_test "$bridge" status-instance session-a env -u PI_BROWSER_INSTANCE PI_SESSION_ID=Session-A "$cli" status --json

bridge="$(new_bridge)"
run_status_test "$bridge" status-instance explicit env PI_BROWSER_INSTANCE=environment PI_SESSION_ID=session "$cli" status --instance ExPliCit --json

bridge="$(new_bridge)"
if PI_BROWSER_BRIDGE_DIR="$bridge" PI_SESSION_ID='../escape' "$cli" status --json >/dev/null 2>&1; then
  printf '%s\n' 'invalid instance unexpectedly succeeded' >&2
  exit 1
fi
if find "$bridge/requests" -maxdepth 1 -name '*.json' -type f | grep -q .; then
  printf '%s\n' 'invalid instance wrote a broker request' >&2
  exit 1
fi

bridge="$(new_bridge)"
(
  for _ in {1..80}; do
    request_file="$(find "$bridge/requests" -maxdepth 1 -name '*.json' -type f -print -quit)"
    [[ -n "$request_file" ]] && break
    sleep 0.05
  done
  [[ -n "${request_file:-}" ]]
  jq -e '.action == "status-instance" and .instance == "named"' "$request_file" >/dev/null
  id="$(jq -r '.id' "$request_file")"
  jq -n --arg id "$id" '{id:$id,ok:false,action:"status-instance",error:"Unsupported action: status-instance"}' >"$bridge/responses/$id.json"
  rm -f "$request_file"
) &
responder=$!
if PI_BROWSER_BRIDGE_DIR="$bridge" PI_SESSION_ID=named "$cli" status --json >/dev/null 2>&1; then
  printf '%s\n' 'named request unexpectedly fell back after broker rejection' >&2
  exit 1
fi
wait "$responder"

bridge="$(new_bridge)"
(
  for _ in {1..80}; do
    request_file="$(find "$bridge/requests" -maxdepth 1 -name '*.json' -type f -print -quit)"
    [[ -n "$request_file" ]] && break
    sleep 0.05
  done
  [[ -n "${request_file:-}" ]]
  jq -e '.action == "status" and (has("instance") | not)' "$request_file" >/dev/null
  id="$(jq -r '.id' "$request_file")"
  jq -n --arg id "$id" '{id:$id,ok:true,action:"status",result:{chromeRunning:true,debugPort:9555,cdpUrl:"http://127.0.0.1:9555",profile:"legacy"}}' >"$bridge/responses/$id.json"
  rm -f "$request_file"
) &
responder=$!
legacy_status="$(PI_BROWSER_BRIDGE_DIR="$bridge" env -u PI_BROWSER_INSTANCE -u PI_SESSION_ID "$cli" status)"
wait "$responder"
grep -F 'Instance: default' <<<"$legacy_status" >/dev/null
grep -F 'Chrome process: running' <<<"$legacy_status" >/dev/null
grep -F 'CDP: http://127.0.0.1:9555' <<<"$legacy_status" >/dev/null

bridge="$(new_bridge)"
(
  for _ in {1..80}; do
    request_file="$(find "$bridge/requests" -maxdepth 1 -name '*.json' -type f -print -quit)"
    [[ -n "$request_file" ]] && break
    sleep 0.05
  done
  [[ -n "${request_file:-}" ]]
  jq -e '.action == "close" and (has("instance") | not)' "$request_file" >/dev/null
  id="$(jq -r '.id' "$request_file")"
  jq -n --arg id "$id" '{id:$id,ok:true,action:"close",result:{chromeRunning:false,debugPort:9555}}' >"$bridge/responses/$id.json"
  rm -f "$request_file"
) &
responder=$!
legacy_close="$(PI_BROWSER_BRIDGE_DIR="$bridge" env -u PI_BROWSER_INSTANCE -u PI_SESSION_ID "$cli" close)"
wait "$responder"
grep -F 'Visible Agent Chrome closed.' <<<"$legacy_close" >/dev/null

printf '%s\n' 'pi-browser CLI tests passed'
