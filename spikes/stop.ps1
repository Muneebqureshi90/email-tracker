<#
.SYNOPSIS
  Turns Tailscale Funnel off after the spikes. Close the logger window yourself.
  Note: "funnel reset" clears every Funnel/Serve setting on this PC.
#>
$ErrorActionPreference = 'Stop'
$tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
& $tailscale funnel reset
if ($LASTEXITCODE -ne 0) { throw 'tailscale funnel reset failed' }
Write-Host 'Funnel is off: nothing on this PC is reachable from the internet now.'
Write-Host 'Close the logger window to stop logging.'
