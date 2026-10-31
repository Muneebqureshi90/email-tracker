<#
.SYNOPSIS
  Dumps the MailPulse database (pg_dump custom format) into backups\mailpulse-<timestamp>.dump.
.DESCRIPTION
  Subjects, addresses and link URLs stay encrypted inside the dump: keep the encryption key
  backed up separately (docs\SETUP.md section 4). Restore steps: docs\SETUP.md section 9.
  Without -Keep nothing is deleted. -Install registers a daily task that runs this script with the
  same -Keep, -CopyTo, -OutDir, -EnvFile and -ProjectName values; -Remove deletes that task.
.PARAMETER OutDir
  Target folder (default backups\ in the project; it is git-ignored).
.PARAMETER Keep
  After a successful backup, keep only the newest N dumps written by this script
  (mailpulse-YYYYMMDD-HHMMSS.dump) in OutDir and delete the older ones. Other files are never touched.
.PARAMETER CopyTo
  Also copy the new dump into this folder (a USB stick or second drive). If the folder is missing,
  the script warns and the backup still counts as done.
.PARAMETER Install
  Register the daily scheduled task "MailPulse backup" for the current user (no administrator rights).
.PARAMETER Remove
  Delete the "MailPulse backup" scheduled task.
.PARAMETER At
  Time of day for the daily task (default 03:00). A missed run starts as soon as the PC is available.
.EXAMPLE
  .\scripts\backup.ps1 -Keep 14 -CopyTo E:\MailPulse-backups -Install
#>
param(
    [string]$OutDir = '',
    [string]$EnvFile = '',
    [string]$ProjectName = 'mailpulse',
    [ValidateRange(1, 100000)]
    [int]$Keep = 0,
    [string]$CopyTo = '',
    [switch]$Install,
    [switch]$Remove,
    [string]$At = '03:00'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$taskName = 'MailPulse backup'

function Resolve-FullPath([string]$Path) {
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Format-TaskArg([string]$Value) {
    # A trailing backslash would escape the closing quote on the command line.
    if ($Value.EndsWith('\')) { $Value += '.' }
    return '"' + $Value + '"'
}

if ($Install -and $Remove) { throw 'Use either -Install or -Remove, not both.' }

if ($Remove) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "Scheduled task '$taskName' removed."
    } else {
        Write-Host "Scheduled task '$taskName' does not exist."
    }
    return
}

if ($Install) {
    $taskArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-File', (Format-TaskArg $PSCommandPath))
    if ($PSBoundParameters.ContainsKey('Keep')) { $taskArgs += @('-Keep', [string]$Keep) }
    if ($CopyTo) { $taskArgs += @('-CopyTo', (Format-TaskArg (Resolve-FullPath $CopyTo))) }
    if ($OutDir) { $taskArgs += @('-OutDir', (Format-TaskArg (Resolve-FullPath $OutDir))) }
    if ($EnvFile) { $taskArgs += @('-EnvFile', (Format-TaskArg (Resolve-FullPath $EnvFile))) }
    if ($PSBoundParameters.ContainsKey('ProjectName')) { $taskArgs += @('-ProjectName', (Format-TaskArg $ProjectName)) }

    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ($taskArgs -join ' ') -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Parse($At))
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
        -Principal $principal -Description 'Daily MailPulse database backup (scripts\backup.ps1).' -Force | Out-Null
    Write-Host "Scheduled task '$taskName' installed: daily at $At as $user."
    Write-Host "  powershell.exe $($taskArgs -join ' ')"
    Write-Host "Remove it with .\scripts\backup.ps1 -Remove"
    return
}

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

if ($CopyTo) {
    if (Test-Path -LiteralPath $CopyTo -PathType Container) {
        try {
            Copy-Item -LiteralPath $file -Destination $CopyTo -Force
            Write-Host "Copied to: $CopyTo"
        } catch {
            Write-Warning "Could not copy the backup to $CopyTo : $($_.Exception.Message)"
        }
    } else {
        Write-Warning "Copy folder $CopyTo is missing (USB stick not plugged in?). The backup stays in $OutDir only."
    }
}

if ($PSBoundParameters.ContainsKey('Keep')) {
    $old = @(Get-ChildItem -LiteralPath $OutDir -File -Filter 'mailpulse-*.dump' |
        Where-Object { $_.Name -match '^mailpulse-\d{8}-\d{6}\.dump$' } |
        Sort-Object Name -Descending |
        Select-Object -Skip $Keep)
    foreach ($f in $old) {
        Remove-Item -LiteralPath $f.FullName -Force
        Write-Host "Deleted old backup: $($f.Name)"
    }
}
