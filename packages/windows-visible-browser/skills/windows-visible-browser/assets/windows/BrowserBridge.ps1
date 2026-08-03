param(
    [string]$Root = $PSScriptRoot,
    [ValidateRange(1, 65535)]
    [int]$DebugPort = 9555
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RequestDir = Join-Path $Root "requests"
$ProcessingDir = Join-Path $Root "processing"
$ResponseDir = Join-Path $Root "responses"
$ProfileDir = Join-Path $Root "chrome-profile"
$LogFile = Join-Path $Root "bridge.log"
$ReadyFile = Join-Path $Root "broker-ready.json"
$BrokerPidFile = Join-Path $Root "broker.pid"
$BridgeScript = $MyInvocation.MyCommand.Path

foreach ($Directory in @($Root, $RequestDir, $ProcessingDir, $ResponseDir, $ProfileDir)) {
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
}

function Write-Log {
    param([string]$Message)
    if ((Test-Path -LiteralPath $LogFile) -and (Get-Item -LiteralPath $LogFile).Length -gt 1MB) {
        Move-Item -LiteralPath $LogFile -Destination "$LogFile.1" -Force
    }
    $Timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffK"
    Add-Content -LiteralPath $LogFile -Value "$Timestamp $Message" -Encoding UTF8
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

function Test-TcpPort {
    $Client = New-Object System.Net.Sockets.TcpClient
    try {
        $ConnectTask = $Client.ConnectAsync("127.0.0.1", $DebugPort)
        return ($ConnectTask.Wait(400) -and $Client.Connected)
    }
    catch {
        return $false
    }
    finally {
        $Client.Dispose()
    }
}

function Get-AgentChromeProcesses {
    try {
        return @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine.Contains("--user-data-dir=") -and
                $_.CommandLine.Contains($ProfileDir)
            })
    }
    catch {
        Write-Log "Chrome process discovery failed: $($_.Exception.Message)"
        return @()
    }
}

function Test-CdpJson {
    try {
        $Response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri "http://127.0.0.1:$DebugPort/json/version"
        $Json = $Response.Content | ConvertFrom-Json
        return (
            $Json.Browser -and
            ([string]$Json.Browser -match 'Chrome|Chromium') -and
            $Json.webSocketDebuggerUrl
        )
    }
    catch {
        return $false
    }
}

function Test-AgentChrome {
    return ((Get-AgentChromeProcesses).Count -gt 0 -and (Test-CdpJson))
}

function Wait-ForAgentChrome {
    param([int]$TimeoutSeconds = 20)
    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $Deadline) {
        if (Test-AgentChrome) {
            return $true
        }
        Start-Sleep -Milliseconds 250
    }
    return $false
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

function Open-AgentChrome {
    param([string]$Url)

    $CanonicalUrl = Get-CanonicalUrl -Url $Url
    $WasRunning = Test-AgentChrome
    if (-not $WasRunning -and (Test-TcpPort)) {
        throw "Port $DebugPort is occupied by a process other than the dedicated Agent Chrome."
    }

    $Chrome = Find-Chrome
    $QuotedProfile = '"' + $ProfileDir.Replace('"', '\"') + '"'
    $QuotedUrl = '"' + $CanonicalUrl.Replace('"', '%22') + '"'
    $ArgumentLine = @(
        "--remote-debugging-port=$DebugPort",
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
    if (-not (Wait-ForAgentChrome)) {
        throw "Chrome started, but the dedicated CDP endpoint did not become available on port $DebugPort."
    }

    Write-Log "Opened Agent Chrome request; runningBefore=$WasRunning launcherPid=$($Process.Id)"
    return [ordered]@{
        chromeRunning = $true
        debugPort = $DebugPort
        cdpUrl = "http://127.0.0.1:$DebugPort"
        profile = $ProfileDir
    }
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
    $Stopped = @()
    foreach ($ChromeProcess in (Get-AgentChromeProcesses)) {
        if (Stop-VerifiedProcessTree -ProcessId ([int]$ChromeProcess.ProcessId)) {
            $Stopped += [int]$ChromeProcess.ProcessId
        }
    }

    $Deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $Deadline -and (Test-AgentChrome)) {
        Start-Sleep -Milliseconds 200
    }

    $StillRunning = Test-AgentChrome
    Write-Log "Close requested; stoppedPids=$($Stopped -join ',') stillRunning=$StillRunning"
    return [ordered]@{
        chromeRunning = $StillRunning
        stoppedPids = $Stopped
        debugPort = $DebugPort
    }
}

function Get-BridgeStatus {
    return [ordered]@{
        brokerRunning = $true
        brokerPid = $PID
        chromeRunning = (Test-AgentChrome)
        debugPort = $DebugPort
        cdpUrl = "http://127.0.0.1:$DebugPort"
        profile = $ProfileDir
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
    if ($Id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
        throw "Request id is not a valid UUIDv4."
    }
    if ($Action -notin @("open", "close", "status")) {
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

        switch ($Action) {
            "open" {
                $RequestUrl = if ($PropertyNames -contains "url") { [string]$Request.url } else { "about:blank" }
                $Result = Open-AgentChrome -Url $RequestUrl
            }
            "close" { $Result = Close-AgentChrome }
            "status" { $Result = Get-BridgeStatus }
        }

        $Response = [ordered]@{
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
            id = $Id
            ok = $false
            action = $Action
            timestamp = (Get-Date).ToString("o")
            error = $_.Exception.Message
        }
    }

    Write-AtomicJson -Path $ResponsePath -Value $Response
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
    # The previous broker crashed; ownership is granted to this process.
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
        brokerPid = $PID
        debugPort = $DebugPort
        script = $BridgeScript
        startedAt = (Get-Date).ToString("o")
    })
    Write-Log "Broker started pid=$PID debugPort=$DebugPort"

    Get-ChildItem -LiteralPath $ResponseDir -Filter "*.json" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-1) } |
        Remove-Item -Force -ErrorAction SilentlyContinue

    while ($true) {
        $Requests = Get-ChildItem -LiteralPath $RequestDir -Filter "*.json" -File -ErrorAction SilentlyContinue |
            Sort-Object CreationTimeUtc

        foreach ($RequestFile in $Requests) {
            $ClaimedPath = Join-Path $ProcessingDir $RequestFile.Name
            $Claimed = $false
            try {
                Move-Item -LiteralPath $RequestFile.FullName -Destination $ClaimedPath -ErrorAction Stop
                $Claimed = $true
                Process-Request -RequestFile (Get-Item -LiteralPath $ClaimedPath)
            }
            catch {
                Write-Log "Could not process request $($RequestFile.Name): $($_.Exception.Message)"
            }
            finally {
                if ($Claimed) {
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
