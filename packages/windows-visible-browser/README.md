# @guwidoe/pi-windows-visible-browser

On-demand, isolated Windows Chrome automation for pi agents running inside WSL2.

A lightweight PowerShell broker runs in the logged-in Windows user session. Chrome remains closed until an agent runs `pi-browser open <url>`. Each Pi session receives a separate Chrome profile and dynamically allocated Chrome DevTools Protocol (CDP) port, so concurrent agents cannot accidentally navigate or close each other's browser.

## Why a broker?

Windows services run in non-interactive Session 0 and cannot display GUI windows. The broker therefore runs as a limited, interactive scheduled task and receives requests through a user-owned file queue on the Windows filesystem.

## Install

After installing this pi package, run from WSL:

```bash
./skills/windows-visible-browser/scripts/install.sh --windows-user YOUR_WINDOWS_USERNAME
```

Then double-click:

```text
C:\Users\YOUR_WINDOWS_USERNAME\.pi-agent-browser\Install.cmd
```

Installation or reinstallation closes managed Agent Chrome instances. The Windows installer enables WSL mirrored networking while preserving and backing up an existing `.wslconfig`. Save WSL work, then run in Windows PowerShell:

```powershell
wsl --shutdown
```

## Use

Inside Pi, `PI_SESSION_ID` automatically selects an isolated browser instance:

```bash
pi-browser open https://example.com
pi-browser status
pi-browser close
```

For a stable profile that can be reused across Pi sessions, select a name explicitly or through the environment:

```bash
pi-browser open --instance ellis https://example.com
PI_BROWSER_INSTANCE=ellis pi-browser status
PI_BROWSER_INSTANCE=ellis pi-browser close
```

Use `--json` to obtain the dynamically allocated port for automation:

```bash
browser_json="$(pi-browser open --json https://example.com)"
debug_port="$(jq -r '.result.debugPort' <<<"$browser_json")"
BROWSER_DEBUG_PORT="$debug_port" ./scripts/eval.js 'document.title'
```

Commands run outside Pi without `PI_SESSION_ID` retain the legacy `default` profile on port `9555`. Explicit `--instance` takes precedence over `PI_BROWSER_INSTANCE` and `PI_SESSION_ID`.

## Security

Every instance uses a dedicated Chrome profile and binds CDP to `127.0.0.1`. CDP has no authentication: while an instance is open, any local Windows or WSL process that can reach its port can control that profile. Instance isolation prevents accidental coordination failures but is not an authorization boundary. Do not use a normal Chrome profile, avoid high-value personal sessions, and close each Agent Chrome instance promptly after its workflow.
