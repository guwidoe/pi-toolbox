# Pi Agent Browser Bridge

Launches a visible Windows Chrome window only when a Pi agent requests one from WSL.

## Design

- A small PowerShell broker runs in the logged-in Windows user session.
- Chrome is not kept permanently open.
- WSL writes commands to the `requests` folder.
- The broker launches a visible Chrome window with a dedicated profile.
- Chrome DevTools Protocol (CDP) is available on Windows/WSL localhost port `9555`.
- `pi-browser close` closes only the dedicated agent Chrome profile.

A Windows service is deliberately not used because services run in non-interactive Session 0 and cannot display windows on the user's desktop.

## Install

Double-click `Install.cmd`, or open Windows PowerShell and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "$env:USERPROFILE\.pi-agent-browser\Install.ps1"
```

Then save WSL work and run:

```powershell
wsl --shutdown
```

Reopen WSL and test:

```bash
pi-browser open https://example.com
pi-browser status
pi-browser close
```

The first browser launch uses a fresh, dedicated profile. Sign in to websites there if an automated workflow needs authentication. Do not use this profile as your normal personal browser.

## Uninstall

Double-click `Uninstall.cmd`, or run:

```powershell
& "$env:USERPROFILE\.pi-agent-browser\Uninstall.ps1"
```

To also delete the dedicated Chrome profile and its login state:

```powershell
& "$env:USERPROFILE\.pi-agent-browser\Uninstall.ps1" -RemoveChromeProfile
```

## Security

CDP grants complete control over the dedicated browser profile. The debugging endpoint is bound to `127.0.0.1` and must not be exposed to the LAN. Any local Windows or WSL process that can reach port `9555` can control the signed-in agent profile while Chrome is open. Avoid high-value personal sessions, use only the dedicated profile, and close Agent Chrome promptly after each workflow. Requests use a directory owned by the current Windows user.
