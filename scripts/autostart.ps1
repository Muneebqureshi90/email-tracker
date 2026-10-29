<#
.SYNOPSIS
  Starts MailPulse when you sign in to Windows: waits for Docker Desktop, starts the containers,
  and makes sure the Tailscale Funnel mounts exist. Writes a log to %LOCALAPPDATA%\MailPulse.
.PARAMETER Install
  Adds a "MailPulse" shortcut to your Startup folder that runs this script hidden at sign-in.
  No administrator rights are needed.
.PARAMETER Remove
  Removes that shortcut.
#>
param(
    [switch]$Install,
    [switch]$Remove,
    [string]$ProjectName = 'mailpulse',
    [string]$EnvFile = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'MailPulse.lnk'

if ($Install) {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($shortcut)
    $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $link.WorkingDirectory = $root
    $link.Description = 'Starts MailPulse (Docker containers and Tailscale Funnel mounts)'
    $link.Save()
    Write-Host "Installed $shortcut"
    Write-Host 'Also turn on Docker Desktop > Settings > General > "Start Docker Desktop when you sign in to your computer".'
    return
}
if ($Remove) {
    Remove-Item $shortcut -ErrorAction SilentlyContinue
    Write-Host "Removed $shortcut"
    return
}

$logDir = Join-Path $env:LOCALAPPDATA 'MailPulse'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'autostart.log'
function Write-Log([string]$Message) {
    Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message)
}

try {
    Write-Log 'Sign-in start'
    $deadline = (Get-Date).AddMinutes(10)
    $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    $launched = $false
    while ($true) {
        $ErrorActionPreference = 'Continue'
        docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
        $dockerExit = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($dockerExit -eq 0) { break }
        if (-not $launched -and (Test-Path $dockerDesktop)) {
            Start-Process -FilePath $dockerDesktop
            $launched = $true
            Write-Log 'Started Docker Desktop'
        }
        if ((Get-Date) -gt $deadline) { throw 'Docker did not start within 10 minutes' }
        Start-Sleep -Seconds 10
    }

    $envFile = if ($EnvFile) { $EnvFile } else { Join-Path $root 'infra\.env' }
    $compose = @('compose', '-p', $ProjectName, '--env-file', $envFile, '-f', (Join-Path $root 'infra\docker-compose.yml'))
    $ErrorActionPreference = 'Continue'
    & docker @compose up -d 2>&1 | ForEach-Object { Write-Log "docker: $_" }
    $upExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($upExit -ne 0) { throw 'docker compose up failed' }

    $privatePort = 8080
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^MAILPULSE_PRIVATE_HOST_PORT=(\d+)$') { $privatePort = [int]$Matches[1] }
    }
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        try {
            if ((Invoke-RestMethod -Uri "http://127.0.0.1:$privatePort/actuator/health" -TimeoutSec 3).status -eq 'UP') { $healthy = $true; break }
        } catch {
            Start-Sleep -Seconds 3
        }
    }
    if (-not $healthy) { throw 'Backend did not become healthy' }
    Write-Log 'Backend healthy'

    # Separate process: Windows PowerShell 5.1 turns redirected stderr of native tools into errors.
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'funnel.ps1') -Action on -EnvFile $envFile 2>&1 |
        ForEach-Object { Write-Log "funnel: $_" }
    $funnelExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($funnelExit -ne 0) { throw 'funnel.ps1 failed (see the funnel lines above)' }
    Write-Log 'Done'
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
