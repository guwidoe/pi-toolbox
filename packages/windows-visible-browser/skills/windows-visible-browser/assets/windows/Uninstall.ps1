param(
    [switch]$RemoveChromeProfile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$TaskName = "Pi Agent Browser Bridge"
$BrokerPidFile = Join-Path $Root "broker.pid"
$BridgeScript = Join-Path $Root "BrowserBridge.ps1"
$ProfileDir = Join-Path $Root "chrome-profile"

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

if (Test-Path -LiteralPath $BrokerPidFile) {
    $SavedPid = (Get-Content -LiteralPath $BrokerPidFile -Raw).Trim()
    if ($SavedPid -match '^\d+$') {
        $BrokerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $SavedPid" -ErrorAction SilentlyContinue
        if (
            $BrokerProcess -and
            $BrokerProcess.Name -match '^powershell(\.exe)?$' -and
            $BrokerProcess.CommandLine -and
            $BrokerProcess.CommandLine.Contains($BridgeScript)
        ) {
            Stop-Process -Id ([int]$SavedPid) -Force -ErrorAction SilentlyContinue
        }
    }
}

$ChromeProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine.Contains("--user-data-dir=") -and
        $_.CommandLine.Contains($ProfileDir)
    })
foreach ($ChromeProcess in $ChromeProcesses) {
    $Output = & "$env:SystemRoot\System32\taskkill.exe" /PID ([int]$ChromeProcess.ProcessId) /T /F 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not stop Agent Chrome pid=$($ChromeProcess.ProcessId): $($Output -join ' ')"
    }
}

Remove-Item -LiteralPath (Join-Path $Root "broker-ready.json") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $BrokerPidFile -Force -ErrorAction SilentlyContinue

if ($RemoveChromeProfile) {
    Remove-Item -LiteralPath $ProfileDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Pi Agent Browser Bridge uninstalled." -ForegroundColor Green
if (-not $RemoveChromeProfile) {
    Write-Host "The dedicated Chrome profile was retained. Use -RemoveChromeProfile to delete it."
}
Write-Host "The installer does not remove networkingMode=mirrored from .wslconfig."
