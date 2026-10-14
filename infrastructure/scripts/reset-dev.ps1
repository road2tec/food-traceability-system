<#
.SYNOPSIS  Drop ONLY the food_traceability dev database. Requires -Force.
.PARAMETER Force  Required confirmation.
.PARAMETER Reseed Run seed.ps1 afterwards.
#>
param([switch]$Force, [switch]$Reseed)
. (Join-Path $PSScriptRoot '_common.ps1')
if (-not $Force) { Write-Err2 'Refusing: this DROPS the food_traceability database. Re-run with -Force.'; exit 2 }
$cfg = Read-DotEnv (Join-Path $Root '.env')
$uri = $cfg['MONGODB_URI']; if (-not $uri) { $uri = 'mongodb://127.0.0.1:27017/food_traceability' }
if ($uri -notmatch '/food_traceability(\?|$)') { Write-Err2 "MONGODB_URI does not point at food_traceability ($uri). Aborting."; exit 2 }
if ($uri -notmatch '127\.0\.0\.1|localhost') { Write-Err2 'MONGODB_URI is not local. Aborting.'; exit 2 }
$script = Join-Path $Root 'tests-e2e\lib\drop-db.mjs'
if (-not (Test-Path (Join-Path $Root 'tests-e2e\node_modules\mongodb'))) { Write-Err2 'Run setup.ps1 first (tests-e2e needs the mongodb driver).'; exit 1 }
$env:MONGODB_URI = $uri
& node $script
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Ok 'food_traceability dropped'
if ($Reseed) { & (Join-Path $PSScriptRoot 'seed.ps1') }
