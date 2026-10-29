<#
.SYNOPSIS
  Checks the public tracking address: the pixel and click routes answer, everything else is 404.
  Uses random tokens, so nothing is written to the database (unknown tokens are never stored).
.PARAMETER BaseUrl
  Address to test. Default: MAILPULSE_PUBLIC_BASE_URL from infra\.env (your Tailscale Funnel address).
  Use http://127.0.0.1:8081 to test the public port without Tailscale.
.OUTPUTS
  Prints one line per check and throws when any check fails.
#>
param(
    [string]$BaseUrl = '',
    [string]$EnvFile = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $root 'infra\.env' }

if (-not $BaseUrl) {
    if (Test-Path $EnvFile) {
        foreach ($line in Get-Content $EnvFile) {
            if ($line -match '^MAILPULSE_PUBLIC_BASE_URL=(.+)$') { $BaseUrl = $Matches[1].Trim() }
        }
    }
    if (-not $BaseUrl) { throw "MAILPULSE_PUBLIC_BASE_URL is not set in $EnvFile. Pass -BaseUrl." }
}
$BaseUrl = $BaseUrl.TrimEnd('/')

function New-Token {
    $bytes = New-Object byte[] 18
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
}

# curl.exe ships with Windows 10 and 11. Returns status, content type and body of one request.
function Invoke-Check([string]$Path, [switch]$Head) {
    $bodyFile = [System.IO.Path]::GetTempFileName()
    try {
        $curlArgs = @('-s', '--path-as-is', '-o', $bodyFile, '-w', '%{http_code} %{content_type}', '--max-time', '20')
        if ($Head) { $curlArgs += '-I' }
        $out = & curl.exe @curlArgs "$BaseUrl$Path"
        if ($LASTEXITCODE -ne 0) { return @{ Status = 0; Type = ''; Body = "curl exit $LASTEXITCODE" } }
        $parts = "$out".Split(' ', 2)
        $body = [System.IO.File]::ReadAllBytes($bodyFile)
        return @{ Status = [int]$parts[0]; Type = $(if ($parts.Count -gt 1) { $parts[1] } else { '' }); Body = $body }
    } finally {
        Remove-Item $bodyFile -ErrorAction SilentlyContinue
    }
}

$token = New-Token
$checks = @(
    @{ Name = "GET  /t/<random>.gif is the 43-byte GIF"; Path = "/t/$token.gif"; Test = { param($r) $r.Status -eq 200 -and $r.Type -like 'image/gif*' -and $r.Body.Length -eq 43 } },
    @{ Name = "HEAD /t/<random>.gif answers 200"; Path = "/t/$(New-Token).gif"; Head = $true; Test = { param($r) $r.Status -eq 200 } },
    @{ Name = "GET  /c/<random> reaches MailPulse (404 'Not found')"; Path = "/c/$(New-Token)"; Test = { param($r) $r.Status -eq 404 -and [System.Text.Encoding]::UTF8.GetString($r.Body) -eq 'Not found' } },
    @{ Name = "GET  / is 404"; Path = '/'; Test = { param($r) $r.Status -eq 404 } },
    @{ Name = "GET  /api/auth/status is 404"; Path = '/api/auth/status'; Test = { param($r) $r.Status -eq 404 } },
    @{ Name = "GET  /actuator/health is 404"; Path = '/actuator/health'; Test = { param($r) $r.Status -eq 404 } },
    @{ Name = "GET  /t/../api/auth/status is refused"; Path = '/t/../api/auth/status'; Test = { param($r) $r.Status -in 400, 404 } }
)

Write-Host "Checking $BaseUrl"
$failed = 0
foreach ($check in $checks) {
    $result = Invoke-Check $check.Path -Head:([bool]$check.Head)
    $ok = & $check.Test $result
    if (-not $ok) { $failed++ }
    $mark = if ($ok) { 'PASS' } else { 'FAIL' }
    Write-Host ("  {0}  {1}  (got {2})" -f $mark, $check.Name, $result.Status)
}
if ($failed -gt 0) { throw "$failed public check(s) failed for $BaseUrl" }
Write-Host 'Public address OK: only the tracking routes answer.'
