<#
.SYNOPSIS
  Runs every check that must pass before a commit: PowerShell script checks, the backend (compile,
  unit and integration tests with Testcontainers, so Docker must be running), the extension and
  the dashboard (install, typecheck, lint, unit tests, build), plus the dependency audits.
.PARAMETER SkipAudit
  Skip the dependency audits. By default npm audit always runs, and the OWASP Maven audit runs
  when NVD_API_KEY is set (skipped with a warning when it is not).
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

# java, docker and npm write to stderr; Windows PowerShell 5.1 would turn that into errors under 'Stop'.
# mvnw uses JAVA_HOME when it is set, so check that Java first.
$java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { 'java' }
$ErrorActionPreference = 'Continue'
$javaSettings = & $java -XshowSettings:properties -version 2>&1 | Out-String
docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
$dockerExit = $LASTEXITCODE
$nodeVersion = & node --version 2>&1 | Out-String
$ErrorActionPreference = 'Stop'
if ($javaSettings -notmatch 'java\.specification\.version = (\d+)' -or [int]$Matches[1] -lt 25) {
    throw 'Java 25 is required. Install Temurin 25 and make sure JAVA_HOME and PATH point to it.'
}
if ($dockerExit -ne 0) { throw 'Docker is not running. Start Docker Desktop (the integration tests need it).' }
if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw 'Node.js 22 or newer is required (24 LTS recommended).' }

function Test-NpmAudit([string]$Name) {
    $ErrorActionPreference = 'Continue'
    $raw = (& npm audit --json 2>$null) -join "`n"
    $ErrorActionPreference = 'Stop'
    try { $report = $raw | ConvertFrom-Json } catch { $report = $null }
    if ($null -eq $report -or $report.error) {
        Write-Warning "${Name}: npm audit could not run (offline?). Run it again before committing."
        return
    }
    $found = $report.metadata.vulnerabilities
    if (($found.high + $found.critical) -gt 0) {
        throw "${Name}: npm audit found $($found.high) high and $($found.critical) critical vulnerabilities. Run 'npm audit' in $Name."
    }
    Write-Host "${Name}: npm audit found no high or critical vulnerabilities ($($found.moderate) moderate, $($found.low) low)."
}

function Invoke-NodeChecks([string]$Name) {
    $dir = Join-Path $root $Name
    if (-not (Test-Path (Join-Path $dir 'package.json'))) { return }
    Push-Location $dir
    try {
        Write-Host "== ${Name}: install, typecheck, lint, unit tests, build"
        $marker = 'node_modules\.package-lock.json'
        if (-not (Test-Path $marker) -or (Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item $marker).LastWriteTime) {
            & npm ci --no-audit --no-fund --loglevel=error
            if ($LASTEXITCODE -ne 0) { throw "${Name}: npm ci failed" }
        }
        foreach ($step in 'typecheck', 'lint', 'test', 'build') {
            & npm run --silent $step
            if ($LASTEXITCODE -ne 0) { throw "${Name}: npm run $step failed" }
        }
        if (-not $SkipAudit) { Test-NpmAudit $Name }
    } finally {
        Pop-Location
    }
}

Invoke-NodeChecks 'extension'
Invoke-NodeChecks 'dashboard'

Push-Location (Join-Path $root 'backend')
try {
    Write-Host '== Backend: compile, unit tests, integration tests'
    & .\mvnw.cmd -B verify
    if ($LASTEXITCODE -ne 0) { throw 'Backend checks failed' }

    if ($SkipAudit) {
        Write-Warning 'Dependency audits skipped (-SkipAudit).'
    } elseif ($env:NVD_API_KEY) {
        Write-Host '== Backend: OWASP dependency audit (fails on CVSS >= 7)'
        & .\mvnw.cmd -B -Paudit -DskipTests verify
        if ($LASTEXITCODE -ne 0) { throw 'Dependency audit failed' }
    } else {
        Write-Warning 'Backend dependency audit skipped: set NVD_API_KEY (free key: https://nvd.nist.gov/developers/request-an-api-key).'
    }
} finally {
    Pop-Location
}
Write-Host 'verify: all checks passed'
