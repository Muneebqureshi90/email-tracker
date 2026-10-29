<#
.SYNOPSIS
  Starts the spike logger in its own window, publishes only /t/ through Tailscale Funnel, and
  self-tests the public address. Throwaway Step 1 tooling.
#>
$ErrorActionPreference = 'Stop'
$tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$publicHost = ((& $tailscale status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
$server = Join-Path $PSScriptRoot 'logger\server.mjs'

function Get-Status([string]$Url, [switch]$Head) {
    $curlArgs = @('-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '20')
    if ($Head) { $curlArgs += '-I' }
    return (& curl.exe @curlArgs $Url)
}

Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', "node `"$server`"") | Out-Null
Start-Sleep -Seconds 2
$local = Get-Status 'http://127.0.0.1:8081/t/selftest-local.gif'
Write-Host "Logger (local) GET /t/selftest-local.gif -> $local (expect 200)"
if ($local -ne '200') { throw 'Logger is not answering on 127.0.0.1:8081. Check the logger window for errors.' }

Write-Host 'Publishing /t/ through Tailscale Funnel (the first time it may print a link to approve Funnel)...'
& $tailscale funnel --bg --https=443 --set-path=/t http://127.0.0.1:8081/t
if ($LASTEXITCODE -ne 0) { throw 'tailscale funnel failed. If it printed a link, open it, approve, then run this script again.' }

$get = Get-Status "https://$publicHost/t/selftest-0001.gif"
if ($get -ne '200') {
    Write-Host "Path mapping A returned $get; trying mapping B"
    & $tailscale funnel --https=443 --set-path=/t off
    & $tailscale funnel --bg --https=443 --set-path=/t http://127.0.0.1:8081
    $get = Get-Status "https://$publicHost/t/selftest-0002.gif"
}
$head = Get-Status "https://$publicHost/t/selftest-0003.gif" -Head
$other = Get-Status "https://$publicHost/api/anything"
Write-Host ''
Write-Host "Public GET  /t/selftest.gif -> $get (expect 200)"
Write-Host "Public HEAD /t/selftest.gif -> $head (expect 200)"
Write-Host "Public GET  /api/anything   -> $other (expect 404)"
& $tailscale funnel status
Write-Host ''
Write-Host "Phone check: with Wi-Fi OFF, open https://$publicHost/t/selftest-phone.gif in the phone browser."
Write-Host 'The logger window should print a PUBLIC GET line for it.'
