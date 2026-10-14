<# .SYNOPSIS Seed demo data via the server's own seed script (npm run seed). #>
. (Join-Path $PSScriptRoot '_common.ps1')
$srv = Join-Path $Root 'server'
$pkg = Join-Path $srv 'package.json'
if (-not (Test-Path $pkg)) { Write-Err2 'server/package.json missing'; exit 1 }
if (-not ((Get-Content $pkg -Raw) -match '"seed"')) { Write-Err2 'server has no "seed" npm script yet'; exit 1 }
Push-Location $srv
try { & npm.cmd run seed; if ($LASTEXITCODE -ne 0) { exit 1 } } finally { Pop-Location }
Write-Ok 'seed done'
