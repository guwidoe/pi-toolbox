---
name: windows-visible-browser
description: Open and automate an isolated visible Windows Chrome window on demand from Pi running in WSL. Use when the user needs to see or interact with the browser, manually authenticate, edit Google Docs through the UI, or perform any headed browser workflow. Chrome launches only for the requested workflow and should be closed afterward.
compatibility: Windows 11 with WSL2 mirrored networking and the Pi Agent Browser Bridge installed.
---

# Windows Visible Browser

Use the Windows browser bridge instead of launching headed Linux Chrome through WSLg.

## Open an isolated visible browser

```bash
browser_json="$(pi-browser open --json 'https://example.com')"
debug_port="$(jq -r '.result.debugPort' <<<"$browser_json")"
instance="$(jq -r '.result.instance' <<<"$browser_json")"
```

The command automatically uses `PI_SESSION_ID`, which gives concurrent Pi sessions separate Chrome profiles and CDP ports. Do not override the instance with `default` merely to reuse another agent's authenticated browser.

For a deliberately persistent profile, set a workflow-specific name:

```bash
browser_json="$(pi-browser open --instance ellis --json 'https://example.com')"
```

Explicit `--instance` takes precedence over `PI_BROWSER_INSTANCE`, then `PI_SESSION_ID`. Outside Pi, the fallback is the legacy `default` instance on port `9555`.

If authentication is needed, ask the user to sign in in that instance's window and confirm when ready.

## Automate through CDP

Use the returned port on every command and do **not** call `start.js`:

```bash
BROWSER_DEBUG_PORT="$debug_port" ./scripts/nav.js 'https://example.com'
BROWSER_DEBUG_PORT="$debug_port" ./scripts/eval.js 'document.title'
BROWSER_DEBUG_PORT="$debug_port" ./scripts/screenshot.js
```

For complex UI interactions, connect Playwright to `http://127.0.0.1:$debug_port` rather than launching another browser. Only interact with pages returned by that endpoint; never discover or connect to another instance's port.

## Status and cleanup

The same Pi session automatically selects the same instance:

```bash
pi-browser status
pi-browser close
```

For an explicit profile, repeat its name:

```bash
pi-browser status --instance ellis
pi-browser close --instance ellis
```

Close the workflow's browser after completion unless the user asks to leave it open. Never run `pi-browser close --instance default` when another agent may own that shared legacy instance.

## Install

From this skill directory, run:

```bash
./scripts/install.sh --windows-user YOUR_WINDOWS_USERNAME
```

Then double-click `Install.cmd` under:

```text
C:\Users\YOUR_WINDOWS_USERNAME\.pi-agent-browser
```

Reinstallation closes all managed Agent Chrome instances. After installation, save WSL work and run `wsl --shutdown` from Windows PowerShell. Reopen WSL and test with:

```bash
pi-browser open --instance test https://example.com
```

See [the package README](../../README.md) for design and security details.

## Troubleshooting

If the broker times out, note the request id in the error, inspect `bridge.log`, and query that instance's status because a timed-out request may have completed later. Also inspect the scheduled task named `Pi Agent Browser Bridge`.

If Chrome opens but CDP is unreachable, confirm `%USERPROFILE%\.wslconfig` contains:

```ini
[wsl2]
networkingMode=mirrored
```

Then run `wsl --shutdown` from Windows PowerShell.

If status reports a running Chrome process but unreachable CDP, close only that instance before reopening it.

## Security

Each instance has a dedicated Chrome profile, but CDP is unauthenticated. Never expose any CDP port beyond localhost or point the bridge at the user's normal Chrome profile. Any local Windows or WSL process that discovers a port can control that signed-in profile, so instance isolation prevents accidental interference rather than providing an authorization boundary. Avoid high-value personal sessions and close each Agent Chrome instance promptly.
