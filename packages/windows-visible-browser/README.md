# @guwidoe/pi-windows-visible-browser

On-demand visible Windows Chrome automation for pi agents running inside WSL2.

A lightweight PowerShell broker runs in the logged-in Windows user session. Chrome remains closed until an agent runs `pi-browser open <url>`. The dedicated browser then exposes Chrome DevTools Protocol on Windows/WSL localhost for automation.

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

The Windows installer enables WSL mirrored networking while preserving and backing up an existing `.wslconfig`. Save WSL work, then run in Windows PowerShell:

```powershell
wsl --shutdown
```

After reopening WSL:

```bash
pi-browser open https://example.com
pi-browser status
pi-browser close
```

## Security

The bridge uses a dedicated Chrome profile and binds CDP to `127.0.0.1`. CDP has no authentication: while Agent Chrome is open, any local Windows or WSL process that can reach its port can control that profile. Do not use your normal Chrome profile, avoid high-value personal sessions, and close Agent Chrome promptly after each workflow.
