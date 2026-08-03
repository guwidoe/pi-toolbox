---
name: windows-visible-browser
description: Open and automate a visible Windows Chrome window on demand from pi running in WSL. Use when the user needs to see or interact with the browser, manually authenticate, edit Google Docs through the UI, or perform any headed browser workflow. Chrome launches only for the requested workflow and should be closed afterward.
compatibility: Windows 11 with WSL2 mirrored networking and the Pi Agent Browser Bridge installed.
---

# Windows Visible Browser

Use the Windows browser bridge instead of launching headed Linux Chrome through WSLg.

## Open a visible browser

```bash
pi-browser open 'https://example.com'
```

This launches visible Windows Chrome with a dedicated persistent agent profile. If authentication is needed, ask the user to sign in in that window and confirm when ready.

## Automate through CDP

The browser exposes CDP at `http://127.0.0.1:9555`.

From the installed `web-browser` skill directory, set the port on every command and do **not** call `start.js`:

```bash
BROWSER_DEBUG_PORT=9555 ./scripts/nav.js 'https://example.com'
BROWSER_DEBUG_PORT=9555 ./scripts/eval.js 'document.title'
BROWSER_DEBUG_PORT=9555 ./scripts/screenshot.js
```

For complex UI interactions, connect Playwright to the existing CDP endpoint rather than launching another browser.

## Status and cleanup

```bash
pi-browser status
pi-browser close
```

Close the dedicated browser after completing the workflow unless the user asks to leave it open.

## Install

From this skill directory, run:

```bash
./scripts/install.sh --windows-user YOUR_WINDOWS_USERNAME
```

Then double-click `Install.cmd` under:

```text
C:\Users\YOUR_WINDOWS_USERNAME\.pi-agent-browser
```

After installation, save WSL work and run `wsl --shutdown` from Windows PowerShell. Reopen WSL and test with:

```bash
pi-browser open https://example.com
```

See [the package README](../../README.md) for design and security details.

## Troubleshooting

If the broker times out, inspect `bridge.log` in the Windows bridge directory and the scheduled task named `Pi Agent Browser Bridge`.

If Chrome opens but CDP is unreachable, confirm `%USERPROFILE%\.wslconfig` contains:

```ini
[wsl2]
networkingMode=mirrored
```

Then run `wsl --shutdown` from Windows PowerShell.

## Security

The Chrome profile is dedicated to agent workflows. Never expose port 9555 beyond localhost or point the bridge at the user's normal Chrome profile. Any local Windows or WSL process that can reach port 9555 can control the signed-in profile while Chrome is open, so avoid high-value personal sessions and close Agent Chrome promptly after each workflow.
