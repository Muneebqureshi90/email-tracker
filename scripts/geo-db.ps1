<#
.SYNOPSIS
  Downloads the free DB-IP Lite databases (city and network owner, CC BY 4.0) into data\geo. MailPulse
  uses them on this PC for the approximate location of link clicks and direct opens (D-133); no address
  leaves the PC. Picks the newest monthly release that is at least 14 days old (D-036), skips the
  download when that release is already there and removes older releases. dev.ps1 runs this script.
.PARAMETER Force
  Download the current release again even when it is already there.
#>
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root 'data\geo'
New-Item -ItemType Directory -Force $dir | Out-Null

# DB-IP publishes on the 1st of each month.
$today = Get-Date
$month = $(if ($today.Day -ge 15) { $today } else { $today.AddMonths(-1) }).ToString('yyyy-MM')

# Invoke-WebRequest in Windows PowerShell 5.1 is very slow while it draws its progress bar.
$ProgressPreference = 'SilentlyContinue'
foreach ($name in 'dbip-city-lite', 'dbip-asn-lite') {
    $target = Join-Path $dir "$name-$month.mmdb"
    if ($Force -or -not (Test-Path $target)) {
        $url = "https://download.db-ip.com/free/$name-$month.mmdb.gz"
        $gz = "$target.gz"
        $partial = "$target.partial"
        Write-Host "Downloading $url"
        Invoke-WebRequest -Uri $url -OutFile $gz -UseBasicParsing -TimeoutSec 900
        $in = [IO.File]::OpenRead($gz)
        try {
            $out = [IO.File]::Create($partial)
            try {
                $unzip = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress)
                $unzip.CopyTo($out)
            } finally {
                $out.Dispose()
            }
        } finally {
            $in.Dispose()
        }
        Move-Item -Force $partial $target
        Remove-Item $gz
    }
    # A running backend keeps the release it started with, so an older file can still be in use.
    foreach ($old in Get-ChildItem $dir -Filter "$name-*.mmdb" | Where-Object Name -ne "$name-$month.mmdb") {
        try { Remove-Item $old.FullName -ErrorAction Stop } catch { Write-Host "Kept $($old.Name) (in use); the next run removes it." }
    }
}
Write-Host "IP location databases: DB-IP Lite $month in $dir (IP Geolocation by DB-IP, https://db-ip.com)."
