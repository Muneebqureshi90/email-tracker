<#
.SYNOPSIS
  Publishes only /t/, /c/ and /d/ of MailPulse on your fixed Tailscale address, shows the state, or
  removes the three mounts. Other Tailscale Serve/Funnel settings on this PC are left alone.
  /t/ is the open pixel, /c/ the tracked links, /d/ the tracked documents (viewer, download, read time).
.PARAMETER Action
  on (default): mount /t/, /c/ and /d/, then run check-public.ps1.
  status: show the Funnel configuration and run check-public.ps1.
  off: remove the mounts (recipients' opens, clicks and document views stop reaching MailPulse).
.PARAMETER Tailscale
  Path to tailscale.exe (default: C:\Program Files\Tailscale\tailscale.exe).
#>
param(
    [ValidateSet('on', 'status', 'off')][string]$Action = 'on',
    [string]$Tailscale = '',
    [string]$EnvFile = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $root 'infra\.env' }
if (-not $Tailscale) { $Tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }
if (-not (Test-Path $Tailscale)) {
    throw "Tailscale is not installed ($Tailscale). Install it from https://tailscale.com/download/windows (docs\SETUP.md section 2)."
}

$envValues = @{}
if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^([A-Z_]+)=(.*)$') { $envValues[$Matches[1]] = $Matches[2].Trim() }
    }
}
$localPort = if ($envValues['MAILPULSE_PUBLIC_HOST_PORT']) { [int]$envValues['MAILPULSE_PUBLIC_HOST_PORT'] } else { 8081 }

$status = & $Tailscale status --json | ConvertFrom-Json
if ($status.BackendState -ne 'Running') {
    throw "Tailscale is not signed in (state: $($status.BackendState)). Open the Tailscale app and sign in."
}
$publicHost = "$($status.Self.DNSName)".TrimEnd('.')
if (-not $publicHost) { throw 'Tailscale reports no DNS name. Turn on MagicDNS in the admin console (docs\SETUP.md section 2).' }
$publicUrl = "https://$publicHost"
$configured = $envValues['MAILPULSE_PUBLIC_BASE_URL']
if ($configured -and $configured.TrimEnd('/') -ne $publicUrl) {
    Write-Warning "infra\.env has MAILPULSE_PUBLIC_BASE_URL=$configured but this PC's Tailscale address is $publicUrl. Pixels point at the .env value."
}

function Set-Mount([string]$Prefix, [string]$Target) {
    & $Tailscale funnel --bg --https=443 "--set-path=$Prefix" $Target
    if ($LASTEXITCODE -ne 0) {
        throw "tailscale funnel failed for $Prefix. If it printed a link to allow Funnel, open it, approve, then run this script again."
    }
}
function Remove-Mount([string]$Prefix) {
    # Removing a mount that does not exist prints an error; that is fine here.
    $ErrorActionPreference = 'Continue'
    & $Tailscale funnel --https=443 "--set-path=$Prefix" off 2>&1 | Out-Null
}
function Test-Pixel {
    $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 20 "$publicUrl/t/mailpulse-mount-check.gif"
    return "$code" -eq '200'
}

switch ($Action) {
    'off' {
        Remove-Mount '/t'
        Remove-Mount '/c'
        Remove-Mount '/d'
        Write-Host "Removed the /t/, /c/ and /d/ mounts from $publicUrl."
        & $Tailscale funnel status
        return
    }
    'on' {
        $local = & curl.exe -s -o NUL -w '%{http_code}' --max-time 5 "http://127.0.0.1:$localPort/t/mailpulse-local-check.gif"
        if ("$local" -ne '200') { throw "MailPulse is not answering on 127.0.0.1:$localPort. Start it first: .\scripts\dev.ps1" }
        # Tailscale keeps the mount path when it forwards (mapping A). Some versions strip it, so if
        # the pixel does not answer, mount the bare port instead (mapping B). Spike 2 records which one.
        Set-Mount '/t' "http://127.0.0.1:$localPort/t"
        Set-Mount '/c' "http://127.0.0.1:$localPort/c"
        Set-Mount '/d' "http://127.0.0.1:$localPort/d"
        if (-not (Test-Pixel)) {
            Write-Host 'Mapping A did not reach the pixel; switching to mapping B.'
            Remove-Mount '/t'
            Remove-Mount '/c'
            Remove-Mount '/d'
            Set-Mount '/t' "http://127.0.0.1:$localPort"
            Set-Mount '/c' "http://127.0.0.1:$localPort"
            Set-Mount '/d' "http://127.0.0.1:$localPort"
        }
    }
}

& $Tailscale funnel status
& (Join-Path $PSScriptRoot 'check-public.ps1') -BaseUrl $publicUrl
Write-Host ''
Write-Host "Outside test: with Wi-Fi off, open $publicUrl/t/phone-check.gif on your phone. It shows a blank page (a 1x1 image)."
