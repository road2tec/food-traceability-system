<#
.SYNOPSIS  Train and/or evaluate the AI model via ai-service scripts.
.PARAMETER Mode  train | evaluate | both (default both)
#>
param([ValidateSet('train', 'evaluate', 'both')][string]$Mode = 'both')
. (Join-Path $PSScriptRoot '_common.ps1')
$py = Get-VenvPython
if (-not $py) { Write-Err2 'ai-service venv missing; run setup.ps1'; exit 1 }
$ai = Join-Path $Root 'ai-service'
function Find-Script([string[]]$names) {
  foreach ($n in $names) { foreach ($d in 'scripts', 'app', 'training', '.') { $p = Join-Path $ai "$d\$n"; if (Test-Path $p) { return $p } } }
  return $null
}
Push-Location $ai
try {
  if ($Mode -ne 'evaluate') {
    $t = Find-Script @('train.py', 'train_model.py'); if (-not $t) { Write-Err2 'no train script found in ai-service'; exit 1 }
    Write-Step "train: $t"; & $py $t; if ($LASTEXITCODE -ne 0) { exit 1 }
  }
  if ($Mode -ne 'train') {
    $e = Find-Script @('evaluate.py', 'evaluate_model.py'); if (-not $e) { Write-Err2 'no evaluate script found in ai-service'; exit 1 }
    Write-Step "evaluate: $e"; & $py $e; if ($LASTEXITCODE -ne 0) { exit 1 }
  }
} finally { Pop-Location }
