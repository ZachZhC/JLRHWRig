# One-click pack script: build HMI and bundle dist + start-win.bat into a Windows-friendly zip
# Usage: powershell -ExecutionPolicy Bypass -File .\deploy\pack-for-colleague.ps1
# Output: window-bench-hmi-colleague.zip
#
# What's inside:
#   window-bench-hmi/
#   +-- dist/          (built assets)
#   +-- start-win.bat  (double-click to open HMI in browser)
#
# Colleague steps:  unzip -> double-click start-win.bat -> browser opens

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DistDir = Join-Path $ProjectRoot "dist"
$DeployDir = Join-Path $ProjectRoot "deploy"
$StageDir = Join-Path $env:TEMP ("hmi-colleague-" + [guid]::NewGuid().ToString("N"))
$ZipName = "window-bench-hmi-colleague.zip"
$ZipPath = Join-Path $ProjectRoot $ZipName

# 1. Build
Write-Host "[1/4] Building HMI ..." -ForegroundColor Cyan
Push-Location $ProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Build failed" }
Pop-Location

# 2. Stage
Write-Host "[2/4] Staging ..." -ForegroundColor Cyan
$InnerDir = Join-Path $StageDir "window-bench-hmi"
New-Item -ItemType Directory -Force -Path $InnerDir | Out-Null

Copy-Item -Path $DistDir           -Destination $InnerDir -Recurse -Force
Copy-Item -Path (Join-Path $DeployDir "start-win.bat") -Destination $InnerDir -Force

# 3. Compress
Write-Host "[3/4] Creating zip ..." -ForegroundColor Cyan
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $StageDir "window-bench-hmi") -DestinationPath $ZipPath -CompressionLevel Optimal

# 4. Cleanup
Write-Host "[4/4] Cleaning up ..." -ForegroundColor Cyan
Remove-Item $StageDir -Recurse -Force

$size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Done: $ZipPath  ($size MB)" -ForegroundColor Green
Write-Host ""
Write-Host "=== Send to colleague ===" -ForegroundColor Yellow
Write-Host "  1. Send this zip to colleague (IM / email / cloud)"
Write-Host "  2. Colleague unzips, double-clicks start-win.bat"
Write-Host "  3. Browser opens to http://127.0.0.1:8080/"
Write-Host ""
Write-Host "  Requires: Python 3 or Node.js installed on their PC"
Write-Host "  (Win11 has Python 3 by default; otherwise Microsoft Store -> Python)"
