<#
.SYNOPSIS
  Builds the dashboard and the document viewer, then builds and starts MailPulse (PostgreSQL + backend
  with both inside)
  in Docker, and waits until it is healthy.
.PARAMETER EnvFile
  Environment file (default infra\.env).
.PARAMETER ProjectName
  Docker Compose project name (default mailpulse). Use another name for a throwaway copy.
#>
param(
    [string]$EnvFile = '',
    [string]$ProjectName = 'mailpulse'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $root 'infra\.env' }
if (-not (Test-Path $EnvFile)) { throw "$EnvFile is missing. Run .\scripts\new-env.ps1 first." }

# The backend image serves the dashboard and the document viewer (/d/), so build both first
# (needs Node.js; Docker does not).
foreach ($app in 'dashboard', 'viewer') {
    Push-Location (Join-Path $root $app)
    try {
        $marker = 'node_modules\.package-lock.json'
        if (-not (Test-Path $marker) -or (Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item $marker).LastWriteTime) {
            & npm ci --no-audit --no-fund --loglevel=error
            if ($LASTEXITCODE -ne 0) { throw "npm ci failed in $app" }
        }
        & npm run --silent build
        if ($LASTEXITCODE -ne 0) { throw "Build failed in $app" }
    } finally {
        Pop-Location
    }
}

$compose = @('compose', '-p', $ProjectName, '--env-file', $EnvFile, '-f', (Join-Path $root 'infra\docker-compose.yml'))
& docker @compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

$privatePort = 8080
$publicPort = 8081
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^MAILPULSE_PRIVATE_HOST_PORT=(\d+)$') { $privatePort = [int]$Matches[1] }
    if ($line -match '^MAILPULSE_PUBLIC_HOST_PORT=(\d+)$') { $publicPort = [int]$Matches[1] }
}

$deadline = (Get-Date).AddMinutes(3)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$privatePort/actuator/health" -TimeoutSec 3
        if ($health.status -eq 'UP') { $healthy = $true; break }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $healthy) { throw "Backend did not become healthy. Check: docker $($compose -join ' ') logs backend" }

Write-Host ''
Write-Host "MailPulse is running."
Write-Host "  Dashboard and API (this PC only): http://127.0.0.1:$privatePort"
Write-Host "  Public tracking routes:     http://127.0.0.1:$publicPort/t/... (Tailscale Funnel exposes /t/ and /c/)"
Write-Host "  First run? Find the one-time setup code with:"
Write-Host "    docker $($compose -join ' ') logs backend | Select-String 'setup code'"
