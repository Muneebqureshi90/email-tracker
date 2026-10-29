<#
.SYNOPSIS
  Writes a labelled marker into the spike log so actions can be matched to requests.
.EXAMPLE
  .\spikes\mark.ps1 "S3-B thread view"
#>
param([Parameter(Mandatory = $true)][string]$Label)
$ErrorActionPreference = 'Stop'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8090/mark' -Body $Label -ContentType 'text/plain; charset=utf-8' | Out-Null
Write-Host "Marked: $Label"
