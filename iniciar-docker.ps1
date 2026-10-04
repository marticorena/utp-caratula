$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Carátula: http://127.0.0.1:8000. Docker reconstruirá la imagen al cambiar el código.'
Write-Host 'Mantén esta terminal abierta para seguir los cambios. Ctrl+C detiene la supervisión.'
docker compose up --build --watch
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar Docker con supervisión de cambios.' }
