$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$updater = Join-Path $PSScriptRoot 'update_dashboard.ps1'
$taskName = 'YouTube Channel Dashboard Refresh'
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$updater`""
& schtasks.exe /Create /TN $taskName /TR $command /SC MINUTE /MO 30 /F /RL LIMITED | Out-Null
Write-Output "Scheduled task '$taskName' runs every 30 minutes."
