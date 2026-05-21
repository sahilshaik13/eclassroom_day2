# Dev worker with ARQ and automatic restart if process exits.
# Used by run.ps1 (separate terminal). Ctrl+C stops this script; no auto-restart after that.

$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path $PSScriptRoot -Parent
Set-Location $BackendRoot

$Arq = Join-Path $BackendRoot "venv\Scripts\arq.exe"
if (-not (Test-Path $Arq)) {
    throw "ARQ executable missing. Run: cd backend; .\venv\Scripts\pip install -r requirements.txt"
}

$WorkerSettings = if ($env:ARQ_WORKER_SETTINGS) {
    $env:ARQ_WORKER_SETTINGS
} else {
    "app.worker.settings_local.LocalWorkerSettings"
}

$RestartDelaySec = 2

while ($true) {
    Write-Host "[dev_worker] Starting ARQ worker ($WorkerSettings) (Ctrl+C to stop)..." -ForegroundColor Cyan
    & $Arq $WorkerSettings
    $exitCode = $LASTEXITCODE

    # STATUS_CONTROL_C_EXIT — user pressed Ctrl+C in this window
    if ($exitCode -eq -1073741510) {
        Write-Host "[dev_worker] Stopped." -ForegroundColor Green
        break
    }

    Write-Host "[dev_worker] Worker exited (exit $exitCode). Restarting in ${RestartDelaySec}s..." -ForegroundColor Yellow
    Start-Sleep -Seconds $RestartDelaySec
}
