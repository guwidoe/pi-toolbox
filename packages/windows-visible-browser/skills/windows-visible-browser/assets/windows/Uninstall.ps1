param(
    [switch]$RemoveChromeProfile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$TaskName = "Pi Agent Browser Bridge"
$BrokerPidFile = Join-Path $Root "broker.pid"
$BridgeScript = Join-Path $Root "BrowserBridge.ps1"
$DefaultProfileDir = Join-Path $Root "chrome-profile"
$InstancesDir = Join-Path $Root "instances"

function Get-NormalizedPath {
    param([string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
}

function Get-CommandLineProfile {
    param([string]$CommandLine)
    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $null
    }
    $Match = [regex]::Match($CommandLine, '(?i)(?:^|\s)"?--user-data-dir=(?:"(?<quoted>[^"]+)"|(?<plain>[^\s"]+))"?')
    if (-not $Match.Success) {
        return $null
    }
    if ($Match.Groups['quoted'].Success) {
        return $Match.Groups['quoted'].Value
    }
    return $Match.Groups['plain'].Value
}

function Test-ManagedProfile {
    param([string]$Profile)
    try {
        $Normalized = Get-NormalizedPath -Path $Profile
        if ($Normalized -ieq (Get-NormalizedPath -Path $DefaultProfileDir)) {
            return $true
        }

        $InstancesRoot = (Get-NormalizedPath -Path $InstancesDir) + [System.IO.Path]::DirectorySeparatorChar
        if (-not $Normalized.StartsWith($InstancesRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $false
        }
        $Relative = $Normalized.Substring($InstancesRoot.Length)
        $Parts = @($Relative -split '[\\/]')
        return (
            $Parts.Count -eq 2 -and
            $Parts[0] -match '^[0-9a-f]{64}$' -and
            $Parts[1] -ieq 'chrome-profile'
        )
    }
    catch {
        return $false
    }
}

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

function Stop-RequestWorkers {
    $Workers = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match '^powershell(\.exe)?$' -and
            $_.CommandLine -and
            $_.CommandLine.Contains($BridgeScript) -and
            $_.CommandLine -match '(?i)(?:^|\s)-RequestFilePath(?:\s|=)'
        })
    foreach ($Worker in $Workers) {
        Stop-Process -Id ([int]$Worker.ProcessId) -Force -ErrorAction SilentlyContinue
    }

    $Deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $Deadline) {
        $Remaining = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -match '^powershell(\.exe)?$' -and
                $_.CommandLine -and
                $_.CommandLine.Contains($BridgeScript) -and
                $_.CommandLine -match '(?i)(?:^|\s)-RequestFilePath(?:\s|=)'
            })
        if ($Remaining.Count -eq 0) {
            return
        }
        Start-Sleep -Milliseconds 100
    }
    throw "Could not stop all Agent Chrome request workers."
}

Stop-RequestWorkers

$ManagedProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $Profile = Get-CommandLineProfile -CommandLine ([string]$_.CommandLine)
        $Profile -and (Test-ManagedProfile -Profile $Profile)
    })
$ManagedIds = @{}
foreach ($Process in $ManagedProcesses) {
    $ManagedIds[[int]$Process.ProcessId] = $true
}
$RootProcesses = @($ManagedProcesses | Where-Object { -not $ManagedIds.ContainsKey([int]$_.ParentProcessId) })
if ($RootProcesses.Count -eq 0 -and $ManagedProcesses.Count -gt 0) {
    $RootProcesses = $ManagedProcesses
}
foreach ($ChromeProcess in $RootProcesses) {
    $Output = & "$env:SystemRoot\System32\taskkill.exe" /PID ([int]$ChromeProcess.ProcessId) /T /F 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not stop Agent Chrome pid=$($ChromeProcess.ProcessId): $($Output -join ' ')"
    }
}

Remove-Item -LiteralPath (Join-Path $Root "broker-ready.json") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $BrokerPidFile -Force -ErrorAction SilentlyContinue

if ($RemoveChromeProfile) {
    Remove-Item -LiteralPath $DefaultProfileDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $InstancesDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Pi Agent Browser Bridge uninstalled." -ForegroundColor Green
if (-not $RemoveChromeProfile) {
    Write-Host "All dedicated Chrome profiles were retained. Use -RemoveChromeProfile to delete their login state."
}
Write-Host "The installer does not remove networkingMode=mirrored from .wslconfig."
