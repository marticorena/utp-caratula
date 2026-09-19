$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    throw 'Primero instala las dependencias siguiendo README.md.'
}
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el frontend.' }
Write-Host 'Carátula: http://127.0.0.1:8000 (Ctrl+C para detener)'
& '.venv/Scripts/python.exe' -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
