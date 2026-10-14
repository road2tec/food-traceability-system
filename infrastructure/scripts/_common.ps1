# Shared helpers (dot-source). PowerShell 5.1 compatible.
$ErrorActionPreference = 'Stop'
$script:Root   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:RunDir = Join-Path $Root 'infrastructure\.run'
if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Force -Path $RunDir | Out-Null }

function Write-Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "[OK]   $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Err2($m) { Write-Host "[FAIL] $m" -ForegroundColor Red }

function Get-VenvPython {
  $p = Join-Path $Root 'ai-service\.venv\Scripts\python.exe'
  if (Test-Path $p) { return $p }
  return $null
}

function Test-PortOpen([int]$Port, [string]$HostName = '127.0.0.1') {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $c.BeginConnect($HostName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false)
    if ($ok -and $c.Connected) { $c.EndConnect($iar); return $true }
    return $false
  } catch { return $false } finally { $c.Close() }
}

function Test-HttpOk([string]$Url, [int]$TimeoutSec = 4) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300)
  } catch { return $false }
}

function Wait-Http([string]$Url, [int]$TimeoutSec = 60) {
  $end = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $end) {
    if (Test-HttpOk $Url) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Read-DotEnv([string]$Path) {
  $h = @{}
  if (Test-Path $Path) {
    foreach ($line in Get-Content $Path) {
      if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
      $i = $line.IndexOf('=')
      $h[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
    }
  }
  return $h
}

function Stop-PidFile([string]$Name) {
  $f = Join-Path $RunDir "$Name.pid"
  if (-not (Test-Path $f)) { Write-Host "  $Name : no pid file"; return }
  $procId = (Get-Content $f | Select-Object -First 1).Trim()
  if ($procId -match '^\d+$') {
    $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
    if ($p) {
      & taskkill.exe /PID $procId /T /F | Out-Null   # kills the whole tree (npm -> node)
      Write-Ok "$Name stopped (pid $procId)"
    } else { Write-Host "  $Name : pid $procId not running (stale)" }
  }
  Remove-Item $f -Force -ErrorAction SilentlyContinue
}
