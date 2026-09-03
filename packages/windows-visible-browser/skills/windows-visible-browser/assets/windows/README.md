# Pi Agent Browser Bridge

Launches isolated visible Windows Chrome windows when Pi agents request them from WSL.

## Design

- A small PowerShell broker runs in the logged-in Windows user session.
- Chrome is not kept permanently open.
- WSL writes commands to the `requests` folder.
- Each named browser instance has its own persistent profile.
- Named instances use dynamically allocated loopback CDP ports.
- The legacy `default` instance retains `chrome-profile` and port `9555`.
- Close operations target only the exact selected profile.

A Windows service is deliberately not used because services run in non-interactive Session 0 and cannot display windows on the user's desktop.

## Install

Double-click `Install.cmd`, or open Windows PowerShell and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "$env:USERPROFILE\.pi-agent-browser\Install.ps1"
```

Installation closes any currently managed Agent Chrome instances. Then save WSL work and run:

```powershell
wsl --shutdown
```

Reopen WSL and test:

```bash
pi-browser open --instance test https://example.com
pi-browser status --instance test
pi-browser close --instance test
```

Inside Pi, `PI_SESSION_ID` automatically selects an isolated instance. An explicit `--instance` or `PI_BROWSER_INSTANCE` can select a stable profile across sessions. Commands outside Pi without either environment variable use the legacy `default` profile.

The first launch of each instance uses a fresh profile. Sign in to websites there only if that workflow needs authentication. Do not use these profiles as normal personal browsers.

## Uninstall

Double-click `Uninstall.cmd`, or run:

```powershell
& "$env:USERPROFILE\.pi-agent-browser\Uninstall.ps1"
```

To also delete every dedicated Chrome profile and its login state:

```powershell
& "$env:USERPROFILE\.pi-agent-browser\Uninstall.ps1" -RemoveChromeProfile
```

## Security

CDP grants complete control over its browser profile. Every debugging endpoint is bound to `127.0.0.1` and must not be exposed to the LAN. Any local Windows or WSL process that discovers an active port can control that instance. Separate profiles prevent accidental interference between agents but are not an authorization boundary. Avoid high-value personal sessions and close Agent Chrome instances promptly. Requests use a directory owned by the current Windows user.
