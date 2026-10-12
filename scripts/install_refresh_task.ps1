$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$updater = Join-Path $PSScriptRoot 'update_dashboard.ps1'
$taskName = 'YouTube Channel Dashboard Refresh'
$command = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$updater`""
& schtasks.exe /Create /TN $taskName /TR $command /SC DAILY /ST 08:00 /F /RL LIMITED | Out-Null
Write-Output "Scheduled task '$taskName' runs daily at 08:00."
