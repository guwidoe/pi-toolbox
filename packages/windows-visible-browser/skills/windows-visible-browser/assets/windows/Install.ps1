param(
    [switch]$SkipMirroredNetworking,
    [ValidateRange(1, 65535)]
    [int]$DebugPort = 9555
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$BridgeScript = Join-Path $Root "BrowserBridge.ps1"
$TaskName = "Pi Agent Browser Bridge"
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$UserId = $Identity.Name
$ReadyFile = Join-Path $Root "broker-ready.json"
$BrokerPidFile = Join-Path $Root "broker.pid"

if (-not (Test-Path -LiteralPath $BridgeScript)) {
    throw "Missing bridge script: $BridgeScript"
}

$ParserTokens = $null
$ParserErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
    $BridgeScript,
    [ref]$ParserTokens,
    [ref]$ParserErrors
)
if ($ParserErrors.Count -gt 0) {
    $Messages = ($ParserErrors | ForEach-Object { $_.Message }) -join "; "
    throw "BrowserBridge.ps1 has PowerShell syntax errors: $Messages"
}

foreach ($Directory in @("requests", "processing", "responses", "chrome-profile", "instances")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Root $Directory) | Out-Null
}

function Enable-MirroredNetworking {
    $WslConfig = Join-Path $env:USERPROFILE ".wslconfig"
    if (Test-Path -LiteralPath $WslConfig) {
        $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Copy-Item -LiteralPath $WslConfig -Destination "$WslConfig.backup-$Timestamp" -Force
        $ExistingLines = @(Get-Content -LiteralPath $WslConfig)
    }
    else {
        $ExistingLines = @()
    }

    $Lines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($Line in $ExistingLines) {
        $Lines.Add([string]$Line)
    }

    $SectionStart = -1
    for ($Index = 0; $Index -lt $Lines.Count; $Index++) {
        if ($Lines[$Index] -match '^\s*\[wsl2\]\s*$') {
            $SectionStart = $Index
            break
        }
    }

    if ($SectionStart -lt 0) {
        if ($Lines.Count -gt 0 -and $Lines[$Lines.Count - 1] -ne "") {
            $Lines.Add("")
        }
        $Lines.Add("[wsl2]")
        $Lines.Add("networkingMode=mirrored")
    }
    else {
        $SectionEnd = $Lines.Count
        for ($Index = $SectionStart + 1; $Index -lt $Lines.Count; $Index++) {
            if ($Lines[$Index] -match '^\s*\[.+\]\s*$') {
                $SectionEnd = $Index
                break
            }
        }

        $NetworkingLine = -1
        for ($Index = $SectionStart + 1; $Index -lt $SectionEnd; $Index++) {
            if ($Lines[$Index] -match '^\s*networkingMode\s*=') {
                $NetworkingLine = $Index
                break
            }
        }

        if ($NetworkingLine -ge 0) {
            $Lines[$NetworkingLine] = "networkingMode=mirrored"
        }
        else {
            $Lines.Insert($SectionStart + 1, "networkingMode=mirrored")
        }
    }

    Set-Content -LiteralPath $WslConfig -Value $Lines -Encoding UTF8
    Write-Host "Ensured WSL mirrored networking in $WslConfig."
}

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
        $DefaultProfile = Get-NormalizedPath -Path (Join-Path $Root "chrome-profile")
        if ($Normalized -ieq $DefaultProfile) {
            return $true
        }

        $InstancesRoot = (Get-NormalizedPath -Path (Join-Path $Root "instances")) + [System.IO.Path]::DirectorySeparatorChar
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

function Stop-ManagedChromeInstances {
    $Managed = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $Profile = Get-CommandLineProfile -CommandLine ([string]$_.CommandLine)
            $Profile -and (Test-ManagedProfile -Profile $Profile)
        })
    if ($Managed.Count -eq 0) {
        return
    }

    Write-Warning "Installation is closing $($Managed.Count) managed Agent Chrome process(es)."
    $ManagedIds = @{}
    foreach ($Process in $Managed) {
        $ManagedIds[[int]$Process.ProcessId] = $true
    }
    $Roots = @($Managed | Where-Object { -not $ManagedIds.ContainsKey([int]$_.ParentProcessId) })
    if ($Roots.Count -eq 0) {
        $Roots = $Managed
    }
    foreach ($Process in $Roots) {
        $Output = & "$env:SystemRoot\System32\taskkill.exe" /PID ([int]$Process.ProcessId) /T /F 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not stop Agent Chrome pid=$($Process.ProcessId): $($Output -join ' ')"
        }
    }
}

function Stop-ExistingBroker {
    if (-not (Test-Path -LiteralPath $BrokerPidFile)) {
        return
    }
    $SavedPid = (Get-Content -LiteralPath $BrokerPidFile -Raw).Trim()
    if ($SavedPid -notmatch '^\d+$') {
        return
    }

    $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $SavedPid" -ErrorAction SilentlyContinue
    if (
        $Process -and
        $Process.Name -match '^powershell(\.exe)?$' -and
        $Process.CommandLine -and
        $Process.CommandLine.Contains($BridgeScript)
    ) {
        Stop-Process -Id ([int]$SavedPid) -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
}

if (-not $SkipMirroredNetworking) {
    Enable-MirroredNetworking
}

$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Stop-ExistingBroker
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
else {
    Stop-ExistingBroker
}

Stop-RequestWorkers
Stop-ManagedChromeInstances

Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $BrokerPidFile -Force -ErrorAction SilentlyContinue

$TaskArguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$BridgeScript`" -DebugPort $DebugPort"
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $TaskArguments
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Description "Launches isolated visible Chrome instances on demand for Pi agents running in WSL." `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings | Out-Null

$InstallStarted = [DateTimeOffset]::UtcNow
Start-ScheduledTask -TaskName $TaskName

$Ready = $null
$Deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $Deadline) {
    if (Test-Path -LiteralPath $ReadyFile) {
        try {
            $Candidate = Get-Content -LiteralPath $ReadyFile -Raw | ConvertFrom-Json
            $StartedAt = [DateTimeOffset]::Parse([string]$Candidate.startedAt)
            $BrokerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($Candidate.brokerPid)" -ErrorAction SilentlyContinue
            if (
                $Candidate.ready -eq $true -and
                $StartedAt -ge $InstallStarted.AddSeconds(-1) -and
                $BrokerProcess -and
                $BrokerProcess.CommandLine.Contains($BridgeScript)
            ) {
                $Ready = $Candidate
                break
            }
        }
        catch {
            # The broker may still be replacing the readiness file atomically.
        }
    }
    Start-Sleep -Milliseconds 250
}

if ($Ready) {
    Write-Host "Browser bridge installed; the default instance uses CDP port $DebugPort and named instances use dynamic ports." -ForegroundColor Green
}
else {
    $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $TaskState = if ($Task) { [string]$Task.State } else { "missing" }
    Write-Warning "The task was registered but the broker did not report ready. Task state: $TaskState. Check $Root\bridge.log."
}

Write-Host ""
Write-Host "One restart is required for mirrored networking:" -ForegroundColor Yellow
Write-Host "  1. Finish or save work in WSL."
Write-Host "  2. Run: wsl --shutdown"
Write-Host "  3. Reopen WSL/Pi."
Write-Host ""
Write-Host "After restart, test from WSL with: pi-browser open https://example.com"
