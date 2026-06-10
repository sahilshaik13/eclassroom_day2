# Rebuild the backend venv from scratch.
#
# When to use this:
#   - You moved the project to a new machine / new drive path and the
#     old shebangs are stale (the venv's .exe wrappers point to the
#     old Python location).
#   - The venv is corrupted (packages broken after a Python upgrade).
#   - You want a clean install to rule out dependency issues.
#
# What it does:
#   1. Backs up the current venv to venv.bak (if it exists).
#   2. Deletes the venv directory.
#   3. Creates a fresh venv at backend\venv.
#   4. Upgrades pip.
#   5. Installs backend\requirements.txt.
#   6. Installs the project itself in editable mode (so `app.*` imports
#      work without setting PYTHONPATH).
#   7. Runs the test suite to confirm everything is wired up.
#
# Usage:
#   powershell -File scripts\rebuild_venv.ps1
#
# To skip the test run (faster, e.g. in CI):
#   powershell -File scripts\rebuild_venv.ps1 -SkipTests
#
# To skip the backup (faster, when you're sure the old venv is junk):
#   powershell -File scripts\rebuild_venv.ps1 -NoBackup

[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$ScriptRoot = $PSScriptRoot
$BackendRoot = (Resolve-Path "$ScriptRoot\..\backend").Path
$VenvPath = Join-Path $BackendRoot "venv"
$Requirements = Join-Path $BackendRoot "requirements.txt"
$SetupPy = Join-Path $BackendRoot "setup.py"
$Pyproject = Join-Path $BackendRoot "pyproject.toml"

# Find a usable Python: prefer 3.10-3.12 (project/Docker pin). Avoid the
# Windows "py" launcher stub (py.exe) and bleeding-edge 3.13+ runtimes.
function Test-PythonVersion {
    param([string]$Exe)
    try {
        $versionOutput = (& $Exe --version 2>&1 | Out-String).Trim()
        if ($versionOutput -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            return ($major -eq 3 -and $minor -ge 10 -and $minor -le 12)
        }
    } catch {}
    return $false
}

function Find-Python {
    $candidates = @(
        "python3.10",
        "python3.11",
        "python3.12",
        "python",
        "python3"
    )
    foreach ($cmd in $candidates) {
        $exe = Get-Command $cmd -ErrorAction SilentlyContinue
        if (-not $exe) { continue }
        if ($exe.Source -match '\\py\.exe$') { continue }
        if (Test-PythonVersion $exe.Source) {
            return $exe.Source
        }
    }

    # Fallback: resolve a real interpreter via the Windows py launcher.
    $py = Get-Command "py" -ErrorAction SilentlyContinue
    if ($py) {
        foreach ($ver in @("3.12", "3.11", "3.10")) {
            $resolved = (& $py.Source "-$ver" -c "import sys; print(sys.executable)" 2>$null | Out-String).Trim()
            if ($LASTEXITCODE -eq 0 -and $resolved -and (Test-Path $resolved)) {
                if (Test-PythonVersion $resolved) {
                    return $resolved
                }
            }
        }
    }

    throw "No Python 3.10-3.12 found on PATH. Install Python 3.10, 3.11, or 3.12 first."
}

$Python = Find-Python
Write-Host "Using Python: $Python" -ForegroundColor Cyan
& $Python --version

# 1) Backup (optional)
if (Test-Path $VenvPath) {
    if ($NoBackup) {
        Write-Host "Removing existing venv (no backup)..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $VenvPath
    } else {
        $backupPath = Join-Path $BackendRoot "venv.bak"
        if (Test-Path $backupPath) {
            Write-Host "Removing old backup at venv.bak..." -ForegroundColor Yellow
            Remove-Item -Recurse -Force $backupPath
        }
        Write-Host "Backing up existing venv to venv.bak..." -ForegroundColor Cyan
        Move-Item -Path $VenvPath -Destination $backupPath
    }
}

# 2) Create fresh venv
Write-Host "Creating new venv at $VenvPath ..." -ForegroundColor Cyan
& $Python -m venv $VenvPath
if ($LASTEXITCODE -ne 0) {
    throw "venv creation failed"
}

# 3) Upgrade pip
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
$VenvPip = Join-Path $VenvPath "Scripts\pip.exe"

Write-Host "Upgrading pip ..." -ForegroundColor Cyan
& $VenvPython -m pip install --upgrade pip 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "pip upgrade failed (continuing with bundled pip)"
}

# 4) Install requirements
if (Test-Path $Requirements) {
    Write-Host "Installing requirements.txt ..." -ForegroundColor Cyan
    & $VenvPip install -r $Requirements 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "requirements.txt install failed"
    }
} else {
    Write-Warning "No requirements.txt found at $Requirements"
}

# 5) Install project in editable mode (if setup.py or pyproject.toml exists)
if ((Test-Path $SetupPy) -or (Test-Path $Pyproject)) {
    Write-Host "Installing project in editable mode ..." -ForegroundColor Cyan
    & $VenvPip install -e $BackendRoot 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Editable install failed (continuing - app may still work via PYTHONPATH)"
    }
} else {
    Write-Host "No setup.py or pyproject.toml - skipping editable install" -ForegroundColor DarkGray
}

# 6) Verify
Write-Host ""
Write-Host "Verifying install ..." -ForegroundColor Cyan
& $VenvPython -c "import sys; print('python:', sys.version.split()[0])"
& $VenvPython -c "import fastapi, uvicorn, arq, supabase, pytest; print('core packages OK')"

# 7) Run tests (optional)
if (-not $SkipTests) {
    Write-Host ""
    Write-Host "Running test suite ..." -ForegroundColor Cyan
    Push-Location $BackendRoot
    try {
        & $VenvPython -m pytest tests/ -v
    } catch {
        Write-Warning "Tests failed or pytest not installed. Run manually: pytest tests/ -v"
    } finally {
        Pop-Location
    }
} else {
    Write-Host ""
    Write-Host "Skipping tests (use -SkipTests=$false to enable)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Activate the new venv with:" -ForegroundColor Green
Write-Host "  $VenvPath\Scripts\Activate.ps1" -ForegroundColor White
