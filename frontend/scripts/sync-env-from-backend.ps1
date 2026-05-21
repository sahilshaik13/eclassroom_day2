# Copy cloud Supabase settings from backend/.env into frontend/.env (VITE_* vars).
$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$backendEnv = Join-Path $Root 'backend\.env'
$frontendEnv = Join-Path $Root 'frontend\.env'

if (-not (Test-Path $backendEnv)) {
    throw "Missing $backendEnv"
}

function Get-EnvValue($path, $key) {
    $line = Select-String -Path $path -Pattern "^\s*$key\s*=" | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line.Line -replace "^\s*$key\s*=\s*", '').Trim().Trim('"')
}

$url = Get-EnvValue $backendEnv 'SUPABASE_URL'
$anon = Get-EnvValue $backendEnv 'SUPABASE_ANON_KEY'
if (-not $url -or -not $anon) {
    throw 'SUPABASE_URL and SUPABASE_ANON_KEY must be set in backend/.env'
}

$apiBase = Get-EnvValue $frontendEnv 'VITE_API_BASE_URL'
if (-not $apiBase) { $apiBase = 'http://localhost:8080' }

$useRt = Get-EnvValue $backendEnv 'USE_SUPABASE_REALTIME'
if (-not $useRt) {
    $useRt = Get-EnvValue $frontendEnv 'VITE_USE_REALTIME'
}
if (-not $useRt) { $useRt = 'true' }

$content = @"
# Auto-synced from backend/.env — run: frontend/scripts/sync-env-from-backend.ps1
VITE_API_BASE_URL=$apiBase
VITE_SUPABASE_URL=$url
VITE_SUPABASE_ANON_KEY=$anon

VITE_USE_REALTIME=$useRt
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($frontendEnv, $content.TrimEnd() + "`n", $utf8NoBom)
Write-Host "Wrote $frontendEnv (Supabase -> $url)" -ForegroundColor Green
Write-Host 'Restart the Vite dev server (npm run dev) so env vars reload.' -ForegroundColor Yellow
