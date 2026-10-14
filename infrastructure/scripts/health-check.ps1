<# .SYNOPSIS Poll health endpoints once (or wait up to -Wait seconds each). Exit 0 only if required services are up. #>
param([int]$Wait = 0)
. (Join-Path $PSScriptRoot '_common.ps1')
$targets = @(
  @{ n = 'server /api/v1/health'; u = 'http://127.0.0.1:4000/api/v1/health'; req = $true },
  @{ n = 'ai-service /health';    u = 'http://127.0.0.1:8001/health';        req = $true },
  @{ n = 'client';                u = 'http://127.0.0.1:5173/';              req = $false }
)
$fail = 0
foreach ($t in $targets) {
  if ($Wait -gt 0) { $up = Wait-Http $t.u $Wait } else { $up = Test-HttpOk $t.u }
  if ($up) { Write-Ok $t.n } elseif ($t.req) { Write-Err2 $t.n; $fail++ } else { Write-Warn2 "$($t.n) not up (optional)" }
}
try {
  $h = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/v1/health' -TimeoutSec 4
  if ($h.data) { $d = $h.data } else { $d = $h }
  Write-Host ('  health payload: ' + ($d | ConvertTo-Json -Compress -Depth 5))
} catch { }
if ($fail -gt 0) { exit 1 }
