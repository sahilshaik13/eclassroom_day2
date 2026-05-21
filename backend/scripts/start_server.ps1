# PowerShell script to start ThinkTarteeb server with multiple workers
# Usage: .\scripts\start_server.ps1 [-Workers 4] [-BindHost 0.0.0.0] [-Port 8080] [-Reload]

param(
    [int]$Workers = (Get-CimInstance Win32_Processor).NumberOfLogicalProcessors,
    [string]$BindHost = "0.0.0.0",
    [int]$Port = 8080,
    [switch]$Reload,
    [string]$LogLevel = "info"
)

Write-Host "Starting ThinkTarteeb server" -ForegroundColor Green
Write-Host "Binding to ${BindHost}:${Port}" -ForegroundColor Cyan
Write-Host "Workers: $Workers" -ForegroundColor Cyan
Write-Host "Log level: $LogLevel" -ForegroundColor Cyan

if ($Reload) {
    Write-Host "Auto-reload enabled (single worker)" -ForegroundColor Yellow
    uvicorn app.main:app --host $BindHost --port $Port --reload --log-level $LogLevel
} else {
    # Production mode with multiple workers
    python scripts/start_server.py --workers $Workers --host $BindHost --port $Port --log-level $LogLevel
}
