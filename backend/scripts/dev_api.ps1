# Dev API server with uvicorn --reload and automatic restart if the reloader exits.
# Used by run.ps1 (separate terminal). Ctrl+C stops this script; no auto-restart after that.

$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path $PSScriptRoot -Parent
Set-Location $BackendRoot

$Port = if ($env:API_PORT) { $env:API_PORT } else { 8080 }
$Uvicorn = Join-Path $BackendRoot "venv\Scripts\uvicorn.exe"
if (-not (Test-Path $Uvicorn)) {
    throw "Backend venv missing. Run: cd backend; python -m venv venv; .\venv\Scripts\pip install -r requirements.txt"
}

$UvicornArgs = @(
    "app.main:app",
    "--reload",
    "--reload-dir", "app",
    "--reload-delay", "0.5",
    "--reload-exclude", "*.pyc",
    "--reload-exclude", "*__pycache__*",
    "--port", $Port
)

$RestartDelaySec = 2

while ($true) {
    Write-Host "[dev_api] Starting uvicorn on port $Port (Ctrl+C to stop)..." -ForegroundColor Cyan
    & $Uvicorn @UvicornArgs
    $exitCode = $LASTEXITCODE

    # STATUS_CONTROL_C_EXIT — user pressed Ctrl+C in this window
    if ($exitCode -eq -1073741510) {
        Write-Host "[dev_api] Stopped." -ForegroundColor Green
        break
    }

    Write-Host "[dev_api] Process ended (exit $exitCode). Restarting in ${RestartDelaySec}s..." -ForegroundColor Yellow
    Start-Sleep -Seconds $RestartDelaySec
}
