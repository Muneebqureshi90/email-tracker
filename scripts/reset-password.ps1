<#
.SYNOPSIS
  Forgot your dashboard password? Writes a one-time reset code to the MailPulse log and prints it.
  Then open the dashboard, click "Forgot password?", enter the code and choose a new password
  (at least 12 characters). The code works once, for 15 minutes.
.PARAMETER EnvFile
  Environment file (default infra\.env).
.PARAMETER ProjectName
  Docker Compose project name (default mailpulse).
#>
param(
    [string]$EnvFile = '',
    [string]$ProjectName = 'mailpulse'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $root 'infra\.env' }
if (-not (Test-Path $EnvFile)) { throw "$EnvFile is missing." }

$privatePort = 8080
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^MAILPULSE_PRIVATE_HOST_PORT=(\d+)$') { $privatePort = [int]$Matches[1] }
}

try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$privatePort/api/auth/reset/request" -Method Post -UseBasicParsing -TimeoutSec 10 | Out-Null
} catch {
    throw "MailPulse did not accept the request on http://127.0.0.1:$privatePort. Is it running? (.\scripts\dev.ps1) $($_.Exception.Message)"
}

$compose = @('compose', '-p', $ProjectName, '--env-file', $EnvFile, '-f', (Join-Path $root 'infra\docker-compose.yml'))
$code = $null
for ($i = 0; $i -lt 10 -and -not $code; $i++) {
    Start-Sleep -Seconds 1
    $ErrorActionPreference = 'Continue'
    $log = (& docker @compose logs --since 2m backend 2>$null) -join "`n"
    $ErrorActionPreference = 'Stop'
    $found = [regex]::Matches($log, 'password reset code: ([A-Za-z0-9-]+)')
    if ($found.Count -gt 0) { $code = $found[$found.Count - 1].Groups[1].Value }
}
if (-not $code) { throw 'The reset code did not show up in the log. Run this script again.' }

Write-Host ''
Write-Host "Reset code: $code" -ForegroundColor Green
Write-Host "Open http://127.0.0.1:$privatePort/login, click 'Forgot password?', enter the code and a new password."
Write-Host 'The code works once, for 15 minutes.'
