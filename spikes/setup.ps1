<#
.SYNOPSIS
  One-time setup for the MailPulse Step 1 spikes (throwaway): writes the spike config and builds
  the test extension into spikes\extension\dist.
.PARAMETER AppId
  InboxSDK App ID from https://register.inboxsdk.com/. Without it Gmail shows a "register your
  App ID" bar, but the spike still works.
.EXAMPLE
  .\spikes\setup.ps1 -AppId sdk_mailpulse_0123456789
#>
param([string]$AppId = '')
$ErrorActionPreference = 'Stop'

$tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
if (-not (Test-Path $tailscale)) {
    throw 'Tailscale is not installed. Install it with: winget install --id Tailscale.Tailscale, or download the installer from https://tailscale.com/download/windows. Then open Tailscale and sign in.'
}
$state = & $tailscale status --json | ConvertFrom-Json
if ($state.BackendState -ne 'Running') {
    throw "Tailscale is not running or not signed in (state: $($state.BackendState)). Open Tailscale and sign in."
}
$publicHost = $state.Self.DNSName.TrimEnd('.')
Write-Host "Public address: https://$publicHost"

$configPath = Join-Path $PSScriptRoot 'extension\spike.config.json'
$config = [ordered]@{ publicBase = "https://$publicHost"; appId = $AppId } | ConvertTo-Json
[System.IO.File]::WriteAllText($configPath, $config)  # UTF-8 without BOM

Push-Location (Join-Path $PSScriptRoot 'extension')
try {
    npm ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    node build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'extension build failed' }
}
finally {
    Pop-Location
}
Write-Host ''
Write-Host "Next: chrome://extensions -> Developer mode -> Load unpacked -> $(Join-Path $PSScriptRoot 'extension\dist')"
