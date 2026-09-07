param(
  [int]$Port = 4174
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

node (Join-Path $projectRoot 'scripts\build-site.cjs') $projectRoot
if ($LASTEXITCODE -ne 0) {
  throw "Pointline build failed with exit code $LASTEXITCODE"
}

$siteRoot = Join-Path $projectRoot 'dist'
Set-Location -LiteralPath $siteRoot

Write-Host "Pointline is available at http://localhost:$Port/"
python -m http.server $Port --bind 127.0.0.1
