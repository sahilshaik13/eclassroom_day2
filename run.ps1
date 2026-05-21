# E-Classroom dev launcher - API, worker, frontend only.
# Cloud: Supabase + Redis + Neon (all from backend/.env). No Docker required.

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

$ApiPort = 8080
$FrontendPort = 5174
$DevPorts = @($ApiPort, $FrontendPort)

function Get-DevShellExe {
    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($pwsh) { return $pwsh.Source }
    $winPs = Get-Command powershell.exe -ErrorAction SilentlyContinue
    if ($winPs) { return $winPs.Source }
    $fallback = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    if (Test-Path $fallback) { return $fallback }
    throw "No PowerShell executable found (pwsh or powershell.exe)."
}

function Stop-ListenersOnPort {
    param([int]$Port)

    $procIds = @()
    try {
        $procIds = @(
            Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique
        )
    } catch {
        Write-Warning "Could not inspect port $Port ($($_.Exception.Message))"
        return
    }

    foreach ($procId in $procIds) {
        if (-not $procId -or $procId -le 4) { continue }
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        Write-Host "  Port ${Port}: stopping $($proc.ProcessName) (PID $procId)" -ForegroundColor DarkYellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

function Clear-DevPorts {
    Write-Host "Freeing dev ports $($DevPorts -join ', ')..." -ForegroundColor Cyan
    foreach ($port in $DevPorts) {
        Stop-ListenersOnPort -Port $port
    }
    Start-Sleep -Seconds 1

    foreach ($port in $DevPorts) {
        $still = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($still) {
            Write-Warning "Port $port may still be in use. Close the old terminal or run as admin if needed."
        }
    }
}

function Start-DevTerminal($title, $command) {
    $shell = Get-DevShellExe
    $inner = "Set-Location -LiteralPath '$Root'; `$Host.UI.RawUI.WindowTitle = '$title'; $command"
    Start-Process -FilePath $shell -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-Command",
        $inner
    ) | Out-Null
}

function Wait-ForApiReady {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $healthUrl = "http://localhost:$Port/health"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    Write-Host "Waiting for API readiness at $healthUrl..." -ForegroundColor Cyan

    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -Method Get -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Write-Host "API is ready on port $Port." -ForegroundColor Green
                return $true
            }
        } catch {
            # API not yet accepting requests; retry.
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Warning "API did not become ready within ${TimeoutSeconds}s. Frontend will still be started."
    return $false
}

function Test-EnvUsesLocalhost($key) {
    $line = Select-String -Path "$Root\backend\.env" -Pattern "^\s*$key\s*=" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $line) { return $false }
    return $line.Line -match '127\.0\.0\.1|localhost'
}

Write-Host "E-Classroom dev launcher" -ForegroundColor Yellow
Write-Host "Supabase, Redis, Neon: cloud URLs in backend/.env" -ForegroundColor DarkGray

if (-not (Test-Path "$Root\backend\venv\Scripts\uvicorn.exe")) {
    throw "Backend venv missing. Run: cd backend; python -m venv venv; .\venv\Scripts\pip install -r requirements.txt"
}

if (Test-Path "$Root\backend\.env.local") {
    Write-Warning "Delete backend/.env.local - only backend/.env is loaded."
}
if (Test-EnvUsesLocalhost 'SUPABASE_URL') {
    Write-Warning "SUPABASE_URL still points at localhost. Set your cloud project URL in backend/.env"
}
if (Test-EnvUsesLocalhost 'REDIS_URL') {
    Write-Warning "REDIS_URL still points at localhost. Set your cloud Redis URL in backend/.env"
}
if (Test-EnvUsesLocalhost 'DATABASE_URL') {
    Write-Warning "DATABASE_URL still points at localhost. Set your Neon pooler URL in backend/.env"
}

# Validate multi-worker setup
if ($Workers -gt 0) {
    if (-not (Test-Path "$Root\backend\scripts\start_server.ps1")) {
        throw "Multi-worker script not found. Expected: backend\scripts\start_server.ps1"
    }
}

Clear-DevPorts

Start-DevTerminal "E-Classroom API :$ApiPort" "`$env:API_PORT='$ApiPort'; & '$Root\backend\scripts\dev_api.ps1'"
Wait-ForApiReady -Port $ApiPort -TimeoutSeconds 90 | Out-Null
Start-DevTerminal "E-Classroom Worker" "& '$Root\backend\scripts\dev_worker.ps1'"
Start-Sleep -Seconds 1
$syncFrontendEnv = Join-Path $Root 'frontend\scripts\sync-env-from-backend.ps1'
if (Test-Path $syncFrontendEnv) {
    & $syncFrontendEnv
}
Start-DevTerminal "E-Classroom Frontend :$FrontendPort" "cd frontend; if (-not (Test-Path node_modules)) { npm install }; npm run dev -- --port $FrontendPort --strictPort"

Write-Host ""
Write-Host "All services starting in separate windows." -ForegroundColor Green
Write-Host "  API:      http://localhost:$ApiPort"
Write-Host "  Frontend: http://localhost:$FrontendPort"
Write-Host "  Supabase: cloud (backend/.env)"
Write-Host "  Redis:    cloud (backend/.env REDIS_URL)"
Write-Host ""
Write-Host "────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "Commands:" -ForegroundColor DarkGray
Write-Host "  .\run.ps1                - Dev mode (single worker + reload)" -ForegroundColor DarkGray
Write-Host "  .\run.ps1 -Workers 4     - Production-like (4 workers)" -ForegroundColor DarkGray
Write-Host "  .\run.ps1 -ApiOnly       - API only" -ForegroundColor DarkGray
Write-Host "  .\run.ps1 -ApiOnly -Workers 8  - API with 8 workers" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Press Enter to close this launcher (services keep running)."
Read-Host | Out-Null
