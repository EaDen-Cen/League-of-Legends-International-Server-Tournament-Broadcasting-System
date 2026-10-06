param([switch]$PrepareOnly, [switch]$Background, [int]$Port = 3001)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$artifactDir = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
if ($PrepareOnly) {
    $version = (& node -p 'process.versions.node').Trim().Split('.')
    if ([int]$version[0] -lt 22 -or ([int]$version[0] -eq 22 -and [int]$version[1] -lt 12)) {
        throw 'Node.js 22.12 or newer is required. Install Node.js 24 LTS and retry.'
    }
    $hash = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
    $stamp = Join-Path $PSScriptRoot 'node_modules/.lol-lock-hash'
    $previous = if (Test-Path -LiteralPath $stamp) { (Get-Content -LiteralPath $stamp -Raw).Trim() } else { '' }
    if ($previous -ne $hash -or -not (Test-Path -LiteralPath 'node_modules/.bin/tsx.cmd') -or -not (Test-Path -LiteralPath 'node_modules/sharp/package.json')) {
        Write-Host 'Installing project dependencies...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the npm error above and network access.' }
        Set-Content -LiteralPath $stamp -Value $hash
    }
    Write-Host 'Building the Control and Overlay pages...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. Check the error above.' }
    exit 0
}
if ($Background) {
    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -WorkingDirectory $PSScriptRoot -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $PSCommandPath, $Port)
    exit 0
}
# The one-click launcher and Cloudflare target both use loopback port 3001.
$env:PORT = [string]$Port
$env:HOST = '127.0.0.1'
$log = Join-Path $artifactDir 'server.log'
try {
    # Native stderr must reach the log without PowerShell treating warnings as fatal.
    $ErrorActionPreference = 'Continue'
    & npm.cmd run server 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $log
    exit $LASTEXITCODE
} catch {
    $_ | Out-String | Add-Content -LiteralPath $log
    exit 1
}
