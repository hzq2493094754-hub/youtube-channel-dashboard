$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$secretPath = Join-Path $root '.secrets\youtube-api-key.dpapi'
$collector = Join-Path $PSScriptRoot 'collect_youtube.py'
$sourceDataDirectory = Join-Path $root 'public\data'
$siteDataDirectory = Join-Path $root 'dist\data'
$bundledPython = 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$python = if (Get-Command python -ErrorAction SilentlyContinue) { (Get-Command python).Source } elseif (Test-Path $bundledPython) { $bundledPython } else { throw 'Python was not found. Install Python 3 or update this script.' }

if (-not (Test-Path $secretPath)) { throw 'Missing encrypted YouTube API key. Run set_youtube_key.ps1 first.' }
$secure = Get-Content -LiteralPath $secretPath -Raw | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:YOUTUBE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & $python $collector
  if ($LASTEXITCODE -ne 0) { throw "Collector failed with exit code $LASTEXITCODE" }
  foreach ($dataFile in @('owned-dashboard.json', 'benchmark-dashboard.json')) {
    Copy-Item -LiteralPath (Join-Path $sourceDataDirectory $dataFile) -Destination (Join-Path $siteDataDirectory $dataFile) -Force
  }
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  Remove-Item Env:YOUTUBE_API_KEY -ErrorAction SilentlyContinue
}
