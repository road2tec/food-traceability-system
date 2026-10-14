<#
.SYNOPSIS  Run each test suite and print a summary table. E2E needs a running stack (use -SkipE2E to omit).
#>
param([switch]$SkipE2E, [switch]$SkipPython)
. (Join-Path $PSScriptRoot '_common.ps1')
$script:results = @()
function Add-Result([string]$Suite, [string]$Result, [string]$Note) {
  $script:results += [pscustomobject]@{ Suite = $Suite; Result = $Result; Note = $Note }
}
function Run-Suite([string]$Name, [string]$Cwd, [string]$File, [string[]]$A) {
  if (-not (Test-Path $Cwd)) { Add-Result $Name 'SKIPPED' 'directory missing'; return }
  Write-Step $Name
  $code = 99
  Push-Location $Cwd
  try { & $File @A; $code = $LASTEXITCODE } catch { $code = 99 } finally { Pop-Location }
  if ($code -eq 0) { Add-Result $Name 'PASS' 'exit 0' } else { Add-Result $Name 'FAIL' "exit $code" }
}
function Has-Script([string]$Dir, [string]$Name) {
  $p = Join-Path $Dir 'package.json'
  return ((Test-Path $p) -and ((Get-Content $p -Raw) -match "`"$Name`"\s*:"))
}
foreach ($c in 'server', 'client') {
  $d = Join-Path $Root $c
  if (Has-Script $d 'test') { Run-Suite "$c tests" $d 'npm.cmd' @('test') }
  else { Add-Result "$c tests" 'SKIPPED' 'no npm test script' }
}
if (-not $SkipPython) {
  $py = Get-VenvPython
  if ($py) { Run-Suite 'ai-service pytest' (Join-Path $Root 'ai-service') $py @('-m', 'pytest', '-q') }
  else { Add-Result 'ai-service pytest' 'SKIPPED' 'venv missing' }
}
if (-not $SkipE2E) {
  if (Test-HttpOk 'http://127.0.0.1:4000/api/v1/health') { Run-Suite 'e2e (live stack)' (Join-Path $Root 'tests-e2e') 'npm.cmd' @('test') }
  else { Add-Result 'e2e (live stack)' 'SKIPPED' 'stack not running' }
}
Write-Host ''
$script:results | Format-Table -AutoSize
if (@($script:results | Where-Object { $_.Result -eq 'FAIL' }).Count -gt 0) { exit 1 }
