param(
    [string]$Root = $PSScriptRoot,
    [ValidateRange(1, 65535)]
    [int]$DebugPort = 9555,
    [string]$RequestFilePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RequestDir = Join-Path $Root "requests"
$ProcessingDir = Join-Path $Root "processing"
$ResponseDir = Join-Path $Root "responses"
$DefaultProfileDir = Join-Path $Root "chrome-profile"
$InstancesDir = Join-Path $Root "instances"
$LogFile = Join-Path $Root "bridge.log"
$ReadyFile = Join-Path $Root "broker-ready.json"
$BrokerPidFile = Join-Path $Root "broker.pid"
$BridgeScript = $MyInvocation.MyCommand.Path

foreach ($Directory in @($Root, $RequestDir, $ProcessingDir, $ResponseDir, $DefaultProfileDir, $InstancesDir)) {
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
}

function Write-Log {
    param([string]$Message)
    try {
        if ((Test-Path -LiteralPath $LogFile) -and (Get-Item -LiteralPath $LogFile).Length -gt 1MB) {
            Move-Item -LiteralPath $LogFile -Destination "$LogFile.1" -Force -ErrorAction Stop
        }
        $Timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffK"
        Add-Content -LiteralPath $LogFile -Value "$Timestamp $Message" -Encoding UTF8 -ErrorAction Stop
    }
    catch {
        # Concurrent request workers must never fail a browser operation because logging is busy.
    }
}

function Write-AtomicJson {
    param([string]$Path, [object]$Value)
    $TemporaryPath = "$Path.tmp-$PID"
    $Value | ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath $TemporaryPath -Encoding UTF8
    Move-Item -LiteralPath $TemporaryPath -Destination $Path -Force
}

function Find-Chrome {
    $Candidates = @()
    if ($env:ProgramFiles) {
        $Candidates += (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe")
    }
    if (${env:ProgramFiles(x86)}) {
        $Candidates += (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")
    }
    if ($env:LOCALAPPDATA) {
        $Candidates += (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
    }

    foreach ($Candidate in $Candidates) {
        if (Test-Path -LiteralPath $Candidate) {
            return $Candidate
        }
    }
    throw "Google Chrome was not found. Install Chrome for Windows first."
}

function Get-NormalizedPath {
    param([string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
}

function Get-CommandLineOptionValue {
    param([string]$CommandLine, [string]$Option)
    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $null
    }

    $EscapedOption = [regex]::Escape($Option)
    $Pattern = '(?i)(?:^|\s)"?--' + $EscapedOption + '=(?:"(?<quoted>[^"]+)"|(?<plain>[^\s"]+))"?'
    $Match = [regex]::Match($CommandLine, $Pattern)
    if (-not $Match.Success) {
        return $null
    }
    if ($Match.Groups['quoted'].Success) {
        return $Match.Groups['quoted'].Value
    }
    return $Match.Groups['plain'].Value
}

function Assert-InstanceId {
    param([string]$Instance)
    if ([string]::IsNullOrWhiteSpace($Instance)) {
        throw "Browser instance id must not be empty."
    }
    $Normalized = $Instance.ToLowerInvariant()
    if ($Normalized -notmatch '^[a-z0-9][a-z0-9._-]{0,63}$') {
        throw "Browser instance id must match [a-z0-9][a-z0-9._-]{0,63}."
    }
    return $Normalized
}

function Get-Sha256Hex {
    param([string]$Value)
    $Hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return (($Hasher.ComputeHash($Bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    }
    finally {
        $Hasher.Dispose()
    }
}

function Get-InstanceContext {
    param([string]$Instance)
    $InstanceId = Assert-InstanceId -Instance $Instance
    if ($InstanceId -eq 'default') {
        $ProfileDir = $DefaultProfileDir
        $FixedDebugPort = $DebugPort
    }
    else {
        $InstanceKey = Get-Sha256Hex -Value $InstanceId
        $ProfileDir = Join-Path (Join-Path $InstancesDir $InstanceKey) "chrome-profile"
        $FixedDebugPort = $null
    }

    return [pscustomobject]@{
        Instance = $InstanceId
        ProfileDir = $ProfileDir
        FixedDebugPort = $FixedDebugPort
        ActivePortFile = Join-Path $ProfileDir "DevToolsActivePort"
    }
}

function Test-ProcessUsesProfile {
    param([object]$Process, [string]$ProfileDir)
    $ConfiguredProfile = Get-CommandLineOptionValue -CommandLine ([string]$Process.CommandLine) -Option 'user-data-dir'
    if (-not $ConfiguredProfile) {
        return $false
    }
    try {
        return ((Get-NormalizedPath -Path $ConfiguredProfile) -ieq (Get-NormalizedPath -Path $ProfileDir))
    }
    catch {
        return $false
    }
}

function Get-AgentChromeProcesses {
    param([object]$Context)
    try {
        return @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
            Where-Object { Test-ProcessUsesProfile -Process $_ -ProfileDir $Context.ProfileDir })
    }
    catch {
        Write-Log "Chrome process discovery failed for instance=$($Context.Instance): $($_.Exception.Message)"
        return @()
    }
}

function Get-AgentChromeRootProcesses {
    param([object]$Context)
    $Processes = @(Get-AgentChromeProcesses -Context $Context)
    if ($Processes.Count -eq 0) {
        return @()
    }

    $ProcessIds = @{}
    foreach ($Process in $Processes) {
        $ProcessIds[[int]$Process.ProcessId] = $true
    }
    $Roots = @($Processes | Where-Object { -not $ProcessIds.ContainsKey([int]$_.ParentProcessId) })
    if ($Roots.Count -gt 0) {
        return $Roots
    }
    return $Processes
}

function Get-InstanceDebugPort {
    param([object]$Context)
    if ($null -ne $Context.FixedDebugPort) {
        return [int]$Context.FixedDebugPort
    }
    if (-not (Test-Path -LiteralPath $Context.ActivePortFile)) {
        return $null
    }

    try {
        $FirstLine = @(Get-Content -LiteralPath $Context.ActivePortFile -ErrorAction Stop)[0]
        $ParsedPort = 0
        if ([int]::TryParse([string]$FirstLine, [ref]$ParsedPort) -and $ParsedPort -ge 1 -and $ParsedPort -le 65535) {
            return $ParsedPort
        }
    }
    catch {
        Write-Log "Could not read DevToolsActivePort for instance=$($Context.Instance): $($_.Exception.Message)"
    }
    return $null
}

function Test-TcpPort {
    param([int]$Port)
    $Client = New-Object System.Net.Sockets.TcpClient
    try {
        $ConnectTask = $Client.ConnectAsync("127.0.0.1", $Port)
        return ($ConnectTask.Wait(400) -and $Client.Connected)
    }
    catch {
        return $false
    }
    finally {
        $Client.Dispose()
    }
}

function Test-CdpListenerOwnership {
    param([object]$Context, [int]$Port)
    try {
        $ManagedPids = @{}
        foreach ($Process in (Get-AgentChromeProcesses -Context $Context)) {
            $ManagedPids[[int]$Process.ProcessId] = $true
        }
        if ($ManagedPids.Count -eq 0) {
            return $false
        }

        $Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
        foreach ($Listener in $Listeners) {
            if ($ManagedPids.ContainsKey([int]$Listener.OwningProcess)) {
                return $true
            }
        }
        return $false
    }
    catch {
        Write-Log "Could not verify CDP listener ownership for instance=$($Context.Instance) port=$($Port): $($_.Exception.Message)"
        return $false
    }
}

function Test-CdpJson {
    param([object]$Context, [int]$Port)
    try {
        $Response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri "http://127.0.0.1:$Port/json/version"
        $Json = $Response.Content | ConvertFrom-Json
        if (
            -not $Json.Browser -or
            ([string]$Json.Browser -notmatch 'Chrome|Chromium') -or
            -not $Json.webSocketDebuggerUrl
        ) {
            return $false
        }
        $WebSocketUri = [System.Uri]([string]$Json.webSocketDebuggerUrl)
        if ($WebSocketUri.Port -ne $Port) {
            return $false
        }
        return (Test-CdpListenerOwnership -Context $Context -Port $Port)
    }
    catch {
        return $false
    }
}

function Test-AgentChrome {
    param([object]$Context)
    if (@(Get-AgentChromeProcesses -Context $Context).Count -eq 0) {
        return $false
    }
    $Port = Get-InstanceDebugPort -Context $Context
    return ($null -ne $Port -and (Test-CdpJson -Context $Context -Port $Port))
}

function Wait-ForAgentChrome {
    param([object]$Context, [int]$TimeoutSeconds = 20)
    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $Deadline) {
        $Port = Get-InstanceDebugPort -Context $Context
        if ($null -ne $Port -and (Test-AgentChrome -Context $Context)) {
            return $Port
        }
        Start-Sleep -Milliseconds 250
    }
    return $null
}

function Get-CanonicalUrl {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url) -or $Url -eq "about:blank") {
        return "about:blank"
    }
    if ($Url.ToCharArray() | Where-Object { [char]::IsControl($_) }) {
        throw "URL contains control characters."
    }

    $Parsed = $null
    if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$Parsed)) {
        throw "Invalid URL."
    }
    if ($Parsed.Scheme -notin @("http", "https")) {
        throw "Only http, https, and about:blank URLs are allowed."
    }
    return $Parsed.AbsoluteUri
}

function Get-BrokerProcessId {
    try {
        $SavedPid = (Get-Content -LiteralPath $BrokerPidFile -Raw -ErrorAction Stop).Trim()
        if ($SavedPid -match '^\d+$') {
            return [int]$SavedPid
        }
    }
    catch {
    }
    return $null
}

function Get-BridgeStatus {
    param([string]$Instance)
    $Context = Get-InstanceContext -Instance $Instance
    $Processes = @(Get-AgentChromeProcesses -Context $Context)
    $ProcessRunning = $Processes.Count -gt 0
    if (-not $ProcessRunning -and $Context.Instance -ne 'default') {
        Remove-Item -LiteralPath $Context.ActivePortFile -Force -ErrorAction SilentlyContinue
    }
    $Port = if ($ProcessRunning) { Get-InstanceDebugPort -Context $Context } else { $null }
    $CdpReachable = $ProcessRunning -and $null -ne $Port -and (Test-CdpJson -Context $Context -Port $Port)
    $CdpUrl = if ($null -ne $Port) { "http://127.0.0.1:$Port" } else { $null }

    return [ordered]@{
        instance = $Context.Instance
        brokerRunning = $true
        brokerPid = Get-BrokerProcessId
        chromeRunning = [bool]($ProcessRunning -and $CdpReachable)
        processRunning = [bool]$ProcessRunning
        cdpReachable = [bool]$CdpReachable
        debugPort = $Port
        cdpUrl = $CdpUrl
        profile = $Context.ProfileDir
    }
}

function Open-AgentChrome {
    param([string]$Instance, [string]$Url)

    $Context = Get-InstanceContext -Instance $Instance
    $CanonicalUrl = Get-CanonicalUrl -Url $Url
    New-Item -ItemType Directory -Force -Path $Context.ProfileDir | Out-Null

    $ExistingProcesses = @(Get-AgentChromeProcesses -Context $Context)
    $WasRunning = $ExistingProcesses.Count -gt 0
    if ($WasRunning -and -not (Test-AgentChrome -Context $Context)) {
        throw "Browser instance '$($Context.Instance)' has Chrome processes but its CDP endpoint is unhealthy. Close it before reopening."
    }
    if (-not $WasRunning -and $Context.Instance -eq 'default' -and (Test-TcpPort -Port $DebugPort)) {
        throw "Port $DebugPort is occupied by a process other than the default Agent Chrome."
    }
    if (-not $WasRunning -and $Context.Instance -ne 'default') {
        Remove-Item -LiteralPath $Context.ActivePortFile -Force -ErrorAction SilentlyContinue
    }

    $Chrome = Find-Chrome
    $LaunchPort = if ($Context.Instance -eq 'default') { $DebugPort } else { 0 }
    $QuotedProfile = '"' + $Context.ProfileDir.Replace('"', '\"') + '"'
    $QuotedUrl = '"' + $CanonicalUrl.Replace('"', '%22') + '"'
    $ArgumentLine = @(
        "--remote-debugging-port=$LaunchPort",
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=$QuotedProfile",
        "--profile-directory=Default",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=ProfilePicker",
        "--new-window",
        $QuotedUrl
    ) -join ' '

    $Process = Start-Process -FilePath $Chrome -ArgumentList $ArgumentLine -PassThru
    $ActivePort = Wait-ForAgentChrome -Context $Context
    if ($null -eq $ActivePort) {
        throw "Chrome started for browser instance '$($Context.Instance)', but its CDP endpoint did not become available."
    }

    Write-Log "Opened Agent Chrome instance=$($Context.Instance) port=$ActivePort runningBefore=$WasRunning launcherPid=$($Process.Id)"
    return (Get-BridgeStatus -Instance $Context.Instance)
}

function Stop-VerifiedProcessTree {
    param([int]$ProcessId)
    $Output = & "$env:SystemRoot\System32\taskkill.exe" /PID $ProcessId /T /F 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "taskkill failed for verified Chrome pid=$($ProcessId): $($Output -join ' ')"
        return $false
    }
    return $true
}

function Close-AgentChrome {
    param([string]$Instance)
    $Context = Get-InstanceContext -Instance $Instance
    $Stopped = @()
    foreach ($ChromeProcess in (Get-AgentChromeRootProcesses -Context $Context)) {
        if (Stop-VerifiedProcessTree -ProcessId ([int]$ChromeProcess.ProcessId)) {
            $Stopped += [int]$ChromeProcess.ProcessId
        }
    }

    $Deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $Deadline -and @(Get-AgentChromeProcesses -Context $Context).Count -gt 0) {
        Start-Sleep -Milliseconds 200
    }

    $ProcessRunning = @(Get-AgentChromeProcesses -Context $Context).Count -gt 0
    if (-not $ProcessRunning -and $Context.Instance -ne 'default') {
        Remove-Item -LiteralPath $Context.ActivePortFile -Force -ErrorAction SilentlyContinue
    }
    Write-Log "Close requested instance=$($Context.Instance) stoppedPids=$($Stopped -join ',') processRunning=$ProcessRunning"

    $Status = Get-BridgeStatus -Instance $Context.Instance
    $Status['stoppedPids'] = $Stopped
    return $Status
}

function Get-InstanceMutex {
    param([string]$Instance)
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $MutexSuffix = $Identity.User.Value.Replace('-', '_')
    $InstanceHash = Get-Sha256Hex -Value $Instance
    try {
        return New-Object System.Threading.Mutex($false, "Global\PiAgentBrowser-$MutexSuffix-$InstanceHash")
    }
    catch {
        return New-Object System.Threading.Mutex($false, "Local\PiAgentBrowser-$MutexSuffix-$InstanceHash")
    }
}

function Process-Request {
    param([System.IO.FileInfo]$RequestFile)

    $Request = Get-Content -LiteralPath $RequestFile.FullName -Raw | ConvertFrom-Json
    $PropertyNames = @($Request.PSObject.Properties.Name)
    if ($PropertyNames -notcontains "id" -or $PropertyNames -notcontains "action") {
        throw "Request is missing id or action."
    }

    $Id = [string]$Request.id
    $Action = [string]$Request.action
    $SupportedActions = @("open", "close", "status", "open-instance", "close-instance", "status-instance")
    if ($Id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
        throw "Request id is not a valid UUIDv4."
    }
    if ($Action -notin $SupportedActions) {
        throw "Unsupported action: $Action"
    }

    $ResponsePath = Join-Path $ResponseDir "$Id.json"
    try {
        if ($PropertyNames -contains "expiresAtEpoch") {
            $Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            if ([long]$Request.expiresAtEpoch -lt $Now) {
                throw "Request expired before it could be processed."
            }
        }

        $IsNamedAction = $Action.EndsWith('-instance')
        if ($IsNamedAction -and $PropertyNames -notcontains 'instance') {
            throw "Named browser request is missing instance."
        }
        $Instance = if ($IsNamedAction) { Assert-InstanceId -Instance ([string]$Request.instance) } else { 'default' }
        $BaseAction = if ($IsNamedAction) { $Action.Substring(0, $Action.Length - 9) } else { $Action }

        $InstanceMutex = Get-InstanceMutex -Instance $Instance
        $InstanceMutexAcquired = $false
        try {
            try {
                $InstanceMutexAcquired = $InstanceMutex.WaitOne(30000, $false)
            }
            catch [System.Threading.AbandonedMutexException] {
                $InstanceMutexAcquired = $true
            }
            if (-not $InstanceMutexAcquired) {
                throw "Timed out waiting for browser instance '$Instance' to become available."
            }

            if ($PropertyNames -contains "expiresAtEpoch") {
                $Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
                if ([long]$Request.expiresAtEpoch -lt $Now) {
                    throw "Request expired while waiting for browser instance '$Instance'."
                }
            }

            switch ($BaseAction) {
                "open" {
                    $RequestUrl = if ($PropertyNames -contains "url") { [string]$Request.url } else { "about:blank" }
                    $Result = Open-AgentChrome -Instance $Instance -Url $RequestUrl
                }
                "close" { $Result = Close-AgentChrome -Instance $Instance }
                "status" { $Result = Get-BridgeStatus -Instance $Instance }
            }
        }
        finally {
            if ($InstanceMutexAcquired) {
                $InstanceMutex.ReleaseMutex()
            }
            $InstanceMutex.Dispose()
        }

        $Response = [ordered]@{
            protocolVersion = 2
            id = $Id
            ok = $true
            action = $Action
            timestamp = (Get-Date).ToString("o")
            result = $Result
        }
    }
    catch {
        Write-Log "Request id=$Id action=$Action failed: $($_.Exception.Message)"
        $Response = [ordered]@{
            protocolVersion = 2
            id = $Id
            ok = $false
            action = $Action
            timestamp = (Get-Date).ToString("o")
            error = $_.Exception.Message
        }
    }

    Write-AtomicJson -Path $ResponsePath -Value $Response
}

if (-not [string]::IsNullOrWhiteSpace($RequestFilePath)) {
    try {
        Process-Request -RequestFile (Get-Item -LiteralPath $RequestFilePath -ErrorAction Stop)
    }
    catch {
        Write-Log "Request worker failed for path=$($RequestFilePath): $($_.Exception.Message)"
    }
    finally {
        Remove-Item -LiteralPath $RequestFilePath -Force -ErrorAction SilentlyContinue
    }
    exit 0
}

function Start-RequestWorker {
    param([string]$ClaimedPath)
    $PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $Arguments = @(
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle Hidden',
        '-ExecutionPolicy Bypass',
        "-File `"$BridgeScript`"",
        "-Root `"$Root`"",
        "-DebugPort $DebugPort",
        "-RequestFilePath `"$ClaimedPath`""
    ) -join ' '
    Start-Process -FilePath $PowerShell -ArgumentList $Arguments -WindowStyle Hidden | Out-Null
}

$Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$MutexSuffix = $Identity.User.Value.Replace('-', '_')
try {
    $Mutex = New-Object System.Threading.Mutex($false, "Global\PiAgentBrowserBridge-$MutexSuffix")
}
catch {
    $Mutex = New-Object System.Threading.Mutex($false, "Local\PiAgentBrowserBridge-$MutexSuffix")
}
$MutexAcquired = $false
try {
    $MutexAcquired = $Mutex.WaitOne(0, $false)
}
catch [System.Threading.AbandonedMutexException] {
    $MutexAcquired = $true
}
if (-not $MutexAcquired) {
    Write-Log "Another broker instance is already running; exiting."
    exit 0
}

try {
    Set-Content -LiteralPath $BrokerPidFile -Value $PID -Encoding ASCII
    Write-AtomicJson -Path $ReadyFile -Value ([ordered]@{
        ready = $true
        protocolVersion = 2
        brokerPid = $PID
        debugPort = $DebugPort
        script = $BridgeScript
        startedAt = (Get-Date).ToString("o")
    })
    Write-Log "Broker started pid=$PID defaultDebugPort=$DebugPort protocolVersion=2"

    Get-ChildItem -LiteralPath $ResponseDir -Filter "*.json" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-1) } |
        Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath $ProcessingDir -Filter "*.json" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-1) } |
        Remove-Item -Force -ErrorAction SilentlyContinue

    while ($true) {
        $Requests = Get-ChildItem -LiteralPath $RequestDir -Filter "*.json" -File -ErrorAction SilentlyContinue |
            Sort-Object CreationTimeUtc

        foreach ($RequestFile in $Requests) {
            $ClaimedPath = Join-Path $ProcessingDir $RequestFile.Name
            $Dispatched = $false
            try {
                Move-Item -LiteralPath $RequestFile.FullName -Destination $ClaimedPath -ErrorAction Stop
                Start-RequestWorker -ClaimedPath $ClaimedPath
                $Dispatched = $true
            }
            catch {
                Write-Log "Could not dispatch request $($RequestFile.Name): $($_.Exception.Message)"
            }
            finally {
                if (-not $Dispatched -and (Test-Path -LiteralPath $ClaimedPath)) {
                    Remove-Item -LiteralPath $ClaimedPath -Force -ErrorAction SilentlyContinue
                }
            }
        }
        Start-Sleep -Milliseconds 250
    }
}
finally {
    Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $BrokerPidFile -Force -ErrorAction SilentlyContinue
    if ($MutexAcquired) {
        $Mutex.ReleaseMutex()
    }
    $Mutex.Dispose()
    Write-Log "Broker stopped."
}
