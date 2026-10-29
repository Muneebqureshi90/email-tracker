<#
.SYNOPSIS
  Runs every check that must pass before a commit: backend compile, unit tests and integration
  tests (Testcontainers, so Docker must be running), plus the dependency audit.
.PARAMETER SkipAudit
  Skip the OWASP dependency audit. By default it runs when NVD_API_KEY is set and is skipped,
  with a warning, when it is not.
#>
param([switch]$SkipAudit)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

Write-Host '== Scripts: PowerShell syntax and ASCII-only text'
# Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page, so scripts stay ASCII.
$scriptProblems = @()
foreach ($script in Get-ChildItem (Join-Path $root 'scripts') -Filter *.ps1) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
    foreach ($e in $parseErrors) { $scriptProblems += "$($script.Name):$($e.Extent.StartLineNumber) $($e.Message)" }
    if ([System.IO.File]::ReadAllBytes($script.FullName) | Where-Object { $_ -gt 127 } | Select-Object -First 1) {
        $scriptProblems += "$($script.Name): contains non-ASCII characters"
    }
}
if ($scriptProblems) { throw "Script problems:`n$($scriptProblems -join "`n")" }

# java and docker write to stderr; Windows PowerShell 5.1 would turn that into errors under 'Stop'.
# mvnw uses JAVA_HOME when it is set, so check that Java first.
$java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { 'java' }
$ErrorActionPreference = 'Continue'
$javaSettings = & $java -XshowSettings:properties -version 2>&1 | Out-String
docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
$dockerExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($javaSettings -notmatch 'java\.specification\.version = (\d+)' -or [int]$Matches[1] -lt 25) {
    throw 'Java 25 is required. Install Temurin 25 and make sure JAVA_HOME and PATH point to it.'
}
if ($dockerExit -ne 0) { throw 'Docker is not running. Start Docker Desktop (the integration tests need it).' }

Push-Location (Join-Path $root 'backend')
try {
    Write-Host '== Backend: compile, unit tests, integration tests'
    & .\mvnw.cmd -B verify
    if ($LASTEXITCODE -ne 0) { throw 'Backend checks failed' }

    if ($SkipAudit) {
        Write-Warning 'Dependency audit skipped (-SkipAudit).'
    } elseif ($env:NVD_API_KEY) {
        Write-Host '== Backend: OWASP dependency audit (fails on CVSS >= 7)'
        & .\mvnw.cmd -B -Paudit -DskipTests verify
        if ($LASTEXITCODE -ne 0) { throw 'Dependency audit failed' }
    } else {
        Write-Warning 'Dependency audit skipped: set NVD_API_KEY (free key: https://nvd.nist.gov/developers/request-an-api-key).'
    }
} finally {
    Pop-Location
}
Write-Host 'verify: all checks passed'
