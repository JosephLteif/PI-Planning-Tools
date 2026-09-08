param(
  [int]$Port = 8787
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

if ([string]::IsNullOrWhiteSpace($env:POINTLINE_BOOTSTRAP_ADMIN_USERNAME) -or [string]::IsNullOrWhiteSpace($env:POINTLINE_BOOTSTRAP_ADMIN_PASSWORD)) {
  throw 'Set POINTLINE_BOOTSTRAP_ADMIN_USERNAME and POINTLINE_BOOTSTRAP_ADMIN_PASSWORD before starting Pointline.'
}

npm run build:all
if ($LASTEXITCODE -ne 0) {
  throw "Pointline build failed with exit code $LASTEXITCODE"
}

$env:PORT = [string]$Port
$env:POINTLINE_DB_PATH = Join-Path $projectRoot 'data\pointline.sqlite'
Write-Host "Pointline is available at http://localhost:$Port/"
node (Join-Path $projectRoot 'server\node-server.mjs')
