<#
.SYNOPSIS  Install dependencies for all components. Never overwrites an existing .env.
.PARAMETER SkipPython  Skip ai-service venv creation.
#>
param([switch]$SkipPython)
. (Join-Path $PSScriptRoot '_common.ps1')

function Install-Node([string]$Dir, [string]$Label) {
  if (-not (Test-Path (Join-Path $Dir 'package.json'))) { Write-Warn2 "$Label : no package.json at $Dir (skipped)"; return }
  Write-Step "npm install: $Label"
  Push-Location $Dir
  try {
    if (Test-Path 'package-lock.json') { & npm.cmd ci } else { & npm.cmd install }
    if ($LASTEXITCODE -ne 0) { throw "npm failed for $Label" }
    Write-Ok $Label
  } finally { Pop-Location }
}

# .env files (never overwrite)
$envFile = Join-Path $Root '.env'
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $Root '.env.example') $envFile; Write-Ok 'created .env from .env.example' }
else { Write-Host '  .env exists - not touched' }
foreach ($c in 'client', 'server', 'ai-service') {
  $ex = Join-Path $Root "$c\.env.example"; $dst = Join-Path $Root "$c\.env"
  if ((Test-Path $ex) -and -not (Test-Path $dst)) { Copy-Item $ex $dst; Write-Ok "created $c\.env" }
}

Install-Node (Join-Path $Root 'server') 'server'
Install-Node (Join-Path $Root 'client') 'client'
Install-Node (Join-Path $Root 'tests-e2e') 'tests-e2e'

if (-not $SkipPython) {
  $ai = Join-Path $Root 'ai-service'
  if (Test-Path (Join-Path $ai 'requirements.txt')) {
    Write-Step 'ai-service venv'
    if (-not (Test-Path (Join-Path $ai '.venv\Scripts\python.exe'))) {
      & py.exe -3.10 -m venv (Join-Path $ai '.venv')
      if ($LASTEXITCODE -ne 0) { & python.exe -m venv (Join-Path $ai '.venv') }
    }
    $py = Get-VenvPython
    if (-not $py) { throw 'venv creation failed (see docs/TROUBLESHOOTING.md)' }
    & $py -m pip install --upgrade pip
    & $py -m pip install -r (Join-Path $ai 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }
    Write-Ok 'ai-service deps'
  } else { Write-Warn2 'ai-service/requirements.txt not found (skipped)' }
}
Write-Ok 'setup complete'
