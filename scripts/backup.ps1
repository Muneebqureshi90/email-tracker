<#
.SYNOPSIS
  Dumps the MailPulse database (pg_dump custom format) into backups\mailpulse-<timestamp>.dump.
  Subjects, addresses and link URLs stay encrypted inside the dump: keep the encryption key
  backed up separately (docs\SETUP.md section 4). Restore steps: docs\SETUP.md section 6.
.PARAMETER OutDir
  Target folder (default backups\ in the project; it is git-ignored).
#>
param(
    [string]$OutDir = '',
    [string]$EnvFile = '',
    [string]$ProjectName = 'mailpulse'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $OutDir) { $OutDir = Join-Path $root 'backups' }
if (-not $EnvFile) { $EnvFile = Join-Path $root 'infra\.env' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$compose = @('compose', '-p', $ProjectName, '--env-file', $EnvFile, '-f', (Join-Path $root 'infra\docker-compose.yml'))
$file = Join-Path $OutDir ("mailpulse-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

# pg_dump writes inside the container; docker cp copies the file byte for byte
# (PowerShell 5.1 pipes would corrupt binary output).
& docker @compose exec -T db pg_dump -U mailpulse -d mailpulse -Fc -f /tmp/mailpulse-backup.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed. Is MailPulse running (.\scripts\dev.ps1)?' }
& docker @compose cp db:/tmp/mailpulse-backup.dump $file
if ($LASTEXITCODE -ne 0) { throw 'Copying the dump out of the container failed' }
& docker @compose exec -T db rm -f /tmp/mailpulse-backup.dump | Out-Null

$size = (Get-Item $file).Length
Write-Host "Backup written: $file ($size bytes)"
