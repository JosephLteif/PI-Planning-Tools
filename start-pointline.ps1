param(
  [int]$Port = 4174
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

Write-Host "Pointline is available at http://localhost:$Port/"
python -m http.server $Port --bind 127.0.0.1
