param(
  [int]$Port = 8787
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

if ([string]::IsNullOrWhiteSpace($env:POINTLINE_BOOTSTRAP_ADMIN_USERNAME) -or [string]::IsNullOrWhiteSpace($env:POINTLINE_BOOTSTRAP_ADMIN_PASSWORD)) {
  throw 'Set POINTLINE_BOOTSTRAP_ADMIN_USERNAME and POINTLINE_BOOTSTRAP_ADMIN_PASSWORD before starting Pointline.'
}

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw 'Set DATABASE_URL to a PostgreSQL connection string before starting Pointline. For Docker, copy .env.example and use docker compose up -d --build.'
}

npm run build:all
if ($LASTEXITCODE -ne 0) {
  throw "Pointline build failed with exit code $LASTEXITCODE"
}

$env:PORT = [string]$Port
Write-Host "Pointline is available at http://localhost:$Port/"
node (Join-Path $projectRoot 'server\node-server.mjs')
