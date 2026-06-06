# E-Classroom dev launcher - API, worker, frontend only.

# Cloud: Supabase + Redis + Neon (all from backend/.env). No Docker required.



$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot

Set-Location $Root



$ApiPort = 8080

$FrontendPort = 5174

$DevPorts = @($ApiPort, $FrontendPort)



$script:DevTerminalProcesses = @()

$script:StoppingDev = $false

$script:DetachMarkerPath = Join-Path $Root ".dev-launcher.detach"

$script:PidFilePath = Join-Path $Root ".dev-launcher.pids"



function Get-DevShellExe {

    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue

    if ($pwsh) { return $pwsh.Source }

    $winPs = Get-Command powershell.exe -ErrorAction SilentlyContinue

    if ($winPs) { return $winPs.Source }

    $fallback = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

    if (Test-Path $fallback) { return $fallback }

    throw "No PowerShell executable found (pwsh or powershell.exe)."

}



function Add-DevLauncherPid {

    param([int]$ProcessId)

    if (-not $ProcessId -or $ProcessId -le 4) { return }

    $ids = @()

    if (Test-Path $script:PidFilePath) {

        $ids = @(Get-Content $script:PidFilePath -ErrorAction SilentlyContinue | ForEach-Object { [int]$_ })

    }

    if ($ids -notcontains $ProcessId) {

        $ids += $ProcessId

        $ids | ForEach-Object { "$_" } | Set-Content -Path $script:PidFilePath -Encoding ascii

    }

}



function Clear-DevLauncherPidFile {

    Remove-Item $script:PidFilePath -Force -ErrorAction SilentlyContinue

}



function Get-DevLauncherPidFile {

    if (-not (Test-Path $script:PidFilePath)) { return @() }

    return @(Get-Content $script:PidFilePath -ErrorAction SilentlyContinue | ForEach-Object {

        $n = 0

        if ([int]::TryParse($_.Trim(), [ref]$n)) { $n }

    } | Where-Object { $_ -gt 4 })

}



function Stop-ProcessTree {

    param([int]$ProcessId)

    if (-not $ProcessId -or $ProcessId -le 4) { return }

    $null = & taskkill.exe /PID $ProcessId /T /F 2>$null

}



function Stop-ListenersOnPort {

    param([int]$Port)

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

        Stop-ProcessTree -ProcessId $procId

    }

}



function Clear-DevPorts {

    Write-Host "Freeing dev ports $($DevPorts -join ', ')..." -ForegroundColor Cyan

    foreach ($port in $DevPorts) {

        Stop-ListenersOnPort -Port $port

    }

    Start-Sleep -Milliseconds 400

}



function Get-DevWindowTitles {

    @(

        "E-Classroom API :$ApiPort",

        "E-Classroom Worker",

        "E-Classroom Frontend :$FrontendPort"

    )

}



function Stop-DevTerminalsByWindowTitle {

    $titles = Get-DevWindowTitles

    foreach ($name in @('powershell', 'pwsh', 'WindowsTerminal')) {

        Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {

            try {

                $title = $_.MainWindowTitle

                if (-not $title) { return }

                foreach ($expected in $titles) {

                    if ($title -eq $expected -or $title.StartsWith($expected)) {

                        Write-Host "  Closing window: $title (PID $($_.Id))" -ForegroundColor DarkYellow

                        Stop-ProcessTree -ProcessId $_.Id

                        break

                    }

                }

            } catch { }

        }

    }

}



function Stop-DevTerminalsByCommandLine {

    $markers = @(

        'dev_api.ps1',

        'dev_worker.ps1',

        'backend\scripts\dev_api.ps1',

        'backend\scripts\dev_worker.ps1'

    )

    try {

        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |

            Where-Object { $_.Name -match '^(powershell|pwsh)(\.exe)?$' } |

            ForEach-Object {

                $cmd = $_.CommandLine

                if (-not $cmd) { return }

                $hit = $false

                foreach ($m in $markers) {

                    if ($cmd -like "*$m*") { $hit = $true; break }

                }

                if (-not $hit) { return }

                Write-Host "  Stopping dev shell PID $($_.ProcessId)" -ForegroundColor DarkYellow

                Stop-ProcessTree -ProcessId $_.ProcessId

            }

    } catch {

        Write-Warning "Command-line process scan failed: $($_.Exception.Message)"

    }

}



function Stop-AllDevLaunchedProcesses {

    if ($script:StoppingDev) { return }

    if (Test-Path $script:DetachMarkerPath) { return }



    $script:StoppingDev = $true

    Write-Host ""

    Write-Host "Stopping dev services and closing external terminals..." -ForegroundColor Yellow



    $pidSet = [System.Collections.Generic.HashSet[int]]::new()

    foreach ($id in @($script:DevTerminalProcesses | ForEach-Object { $_.Id }) + (Get-DevLauncherPidFile)) {

        if ($id -gt 4) { [void]$pidSet.Add($id) }

    }



    foreach ($procId in $pidSet) {

        if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {

            Write-Host "  Closing tracked shell PID $procId" -ForegroundColor DarkYellow

            Stop-ProcessTree -ProcessId $procId

        }

    }



    Stop-DevTerminalsByWindowTitle

    Stop-DevTerminalsByCommandLine

    Clear-DevPorts



    $script:DevTerminalProcesses = @()

    Clear-DevLauncherPidFile

    Write-Host "All dev terminals stopped." -ForegroundColor Green

}



function Register-DevLauncherCleanup {

    Remove-Item $script:DetachMarkerPath -Force -ErrorAction SilentlyContinue

    Clear-DevLauncherPidFile



    $global:EClassroomDevLauncherDetachFile = $script:DetachMarkerPath

    $null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {

        if (Test-Path $global:EClassroomDevLauncherDetachFile) { return }

        Stop-AllDevLaunchedProcesses

    }



    try {

        $cancelEvent = [Console]::CancelKeyPress

        if ($null -ne $cancelEvent) {

            [Console]::TreatControlCAsInput = $false

            [void]$cancelEvent.Add({

                param($sender, $e)

                $e.Cancel = $true

                Stop-AllDevLaunchedProcesses

                [Environment]::Exit(0)

            })

        }

    } catch { }

}



function Start-DevTerminal {

    param(

        [string]$Title,

        [string]$Command

    )

    $shell = Get-DevShellExe

    $inner = "Set-Location -LiteralPath '$Root'; `$Host.UI.RawUI.WindowTitle = '$Title'; $Command"

    $proc = Start-Process -FilePath $shell -ArgumentList @(

        "-NoExit", "-NoProfile", "-Command", $inner

    ) -PassThru



    if ($proc) {

        Start-Sleep -Milliseconds 250

        $live = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue

        if ($live) {

            $script:DevTerminalProcesses += $live

            Add-DevLauncherPid -ProcessId $live.Id

        }

    }

    return $proc

}



function Wait-ForApiReady {

    param([int]$Port, [int]$TimeoutSeconds = 60)

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

        } catch { }

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



Register-DevLauncherCleanup



trap {

    if (

        $_.Exception -is [System.Management.Automation.PipelineStoppedException] -or

        $_.FullyQualifiedErrorId -match 'PipelineStopped|CtrlC|OperationCanceled|UserCancelled'

    ) {

        Stop-AllDevLaunchedProcesses

        exit 0

    }

    throw $_

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



if ($Workers -gt 0) {

    if (-not (Test-Path "$Root\backend\scripts\start_server.ps1")) {

        throw "Multi-worker script not found. Expected: backend\scripts\start_server.ps1"

    }

}



Clear-DevPorts



Start-DevTerminal -Title "E-Classroom API :$ApiPort" -Command "`$env:API_PORT='$ApiPort'; & '$Root\backend\scripts\dev_api.ps1'"

Wait-ForApiReady -Port $ApiPort -TimeoutSeconds 90 | Out-Null

Start-DevTerminal -Title "E-Classroom Worker" -Command "& '$Root\backend\scripts\dev_worker.ps1'"

Start-Sleep -Seconds 1

$syncFrontendEnv = Join-Path $Root 'frontend\scripts\sync-env-from-backend.ps1'

if (Test-Path $syncFrontendEnv) { & $syncFrontendEnv }

Start-DevTerminal -Title "E-Classroom Frontend :$FrontendPort" -Command "cd frontend; if (-not (Test-Path node_modules)) { npm install }; npm run dev -- --port $FrontendPort --strictPort"



Write-Host ""

Write-Host "All services starting in separate windows." -ForegroundColor Green

Write-Host "  API:      http://localhost:$ApiPort"

Write-Host "  Frontend: http://localhost:$FrontendPort"

Write-Host ""

Write-Host "Press Ctrl+C to stop all services and close dev terminal windows." -ForegroundColor Cyan

Write-Host "Press Enter to exit this launcher only (services keep running)." -ForegroundColor DarkGray



try {

    Read-Host | Out-Null

    $null = New-Item -Path $script:DetachMarkerPath -ItemType File -Force

} catch {

    Stop-AllDevLaunchedProcesses

    exit 0

}


