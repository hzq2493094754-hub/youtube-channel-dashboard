param(
  [Parameter(Mandatory)]
  [Security.SecureString]$ApiKey
)

$root = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $root '.secrets'
$secretPath = Join-Path $secretDirectory 'youtube-api-key.dpapi'
New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null
$ApiKey | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -NoNewline -Encoding utf8
Write-Output 'YouTube API key stored for the current Windows user.'
