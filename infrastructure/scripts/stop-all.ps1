<# .SYNOPSIS Stop processes started by start-all.ps1 (via PID files). Does not stop MongoDB. #>
. (Join-Path $PSScriptRoot '_common.ps1')
foreach ($n in 'client', 'server', 'ai-service') { Stop-PidFile $n }
