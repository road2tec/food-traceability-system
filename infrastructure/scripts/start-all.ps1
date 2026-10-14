<#
.SYNOPSIS  Start ai-service, server, client as background processes. PID files + logs in infrastructure\.run\
.PARAMETER NoClient  Do not start the Vite client.
.PARAMETER Seed      Run server seed before starting the server.
#>
param([switch]$NoClient, [switch]$Seed)
. (Join-Path $PSScriptRoot '_common.ps1')

function Start-Bg([string]$Name, [string]$File, [string[]]$ArgList, [string]$Cwd) {
  $pidFile = Join-Path $RunDir "$Name.pid"
  if (Test-Path $pidFile) {
    $old = (Get-Content $pidFile | Select-Object -First 1).Trim()
    if ($old -match '^\d+$' -and (Get-Process -Id ([int]$old) -ErrorAction SilentlyContinue)) { Write-Host "  $Name already running (pid $old)"; return }
  }
  $out = Join-Path $RunDir "$Name.out.log"; $err = Join-Path $RunDir "$Name.err.log"
  $p = Start-Process -FilePath $File -ArgumentList $ArgList -WorkingDirectory $Cwd -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  Set-Content -Path $pidFile -Value $p.Id
  Write-Ok "$Name started (pid $($p.Id)); logs: $out"
}

Write-Step 'MongoDB'
if (-not (Test-PortOpen 27017)) { Write-Err2 'MongoDB is not listening on 27017. Start the service (net start MongoDB) - see docs/TROUBLESHOOTING.md'; exit 1 }
Write-Ok 'mongod reachable on 27017'

$portNames = @{ 8001 = 'ai-service'; 4000 = 'server'; 5173 = 'client' }
foreach ($p in 8001, 4000, 5173) {
  $pf = Join-Path $RunDir ("{0}.pid" -f $portNames[$p])
  if ((Test-PortOpen $p) -and -not (Test-Path $pf)) {
    Write-Warn2 "port $p already in use by a process not started by this script"
  }
}

# ai-service
$py = Get-VenvPython
$aiDir = Join-Path $Root 'ai-service'
if ($py) {
  $mod = 'app.main:app'
  if (-not (Test-Path (Join-Path $aiDir 'app\main.py')) -and (Test-Path (Join-Path $aiDir 'main.py'))) { $mod = 'main:app' }
  Start-Bg 'ai-service' $py @('-m', 'uvicorn', $mod, '--host', '127.0.0.1', '--port', '8001') $aiDir
} else { Write-Warn2 'ai-service venv missing - run setup.ps1. Server will report predictions UPSTREAM_UNAVAILABLE.' }

if ($Seed) { & (Join-Path $PSScriptRoot 'seed.ps1') }

Start-Bg 'server' 'npm.cmd' @('run', 'start') (Join-Path $Root 'server')
if (-not $NoClient) { Start-Bg 'client' 'npm.cmd' @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173') (Join-Path $Root 'client') }

Write-Step 'Waiting for health'
$ok = $true
if ($py) { if (Wait-Http 'http://127.0.0.1:8001/health' 90) { Write-Ok 'ai-service healthy' } else { Write-Err2 'ai-service not healthy (see .run\ai-service.err.log)'; $ok = $false } }
if (Wait-Http 'http://127.0.0.1:4000/api/v1/health' 90) { Write-Ok 'server healthy' } else { Write-Err2 'server not healthy (see .run\server.err.log)'; $ok = $false }
if (-not $NoClient) { if (Wait-Http 'http://127.0.0.1:5173/' 90) { Write-Ok 'client up' } else { Write-Err2 'client not up (see .run\client.err.log)'; $ok = $false } }
if (-not $ok) { exit 1 }
Write-Ok 'stack is up: client http://localhost:5173  api http://localhost:4000/api/v1  ai http://localhost:8001'
