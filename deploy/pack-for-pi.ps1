# One-click pack script: build HMI and bundle dist + deploy scripts into zip
# Usage: powershell -ExecutionPolicy Bypass -File .\deploy\pack-for-pi.ps1
# Output: window-bench-hmi-pi.zip  with structure:
#         window-bench-hmi/
#         +-- dist/           (built assets, served by python http.server)
#         +-- kiosk.sh        (HTTP server + fullscreen Chromium watchdog)
#         +-- setup-pi.sh     (one-shot installer on Raspberry Pi)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DistDir = Join-Path $ProjectRoot "dist"
$DeployDir = Join-Path $ProjectRoot "deploy"
$StageDir = Join-Path $env:TEMP ("hmi-stage-" + [guid]::NewGuid().ToString("N"))
$ZipName = "window-bench-hmi-pi.zip"
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

Copy-Item -Path $DistDir -Destination $InnerDir -Recurse -Force
Copy-Item -Path (Join-Path $DeployDir "kiosk.sh")    -Destination $InnerDir -Force
Copy-Item -Path (Join-Path $DeployDir "setup-pi.sh") -Destination $InnerDir -Force

# 工作区若是 CRLF（Windows autocrlf），zip 里的 .sh 到 Pi 上会报 $'\r': command not found，这里强制转 LF
foreach ($name in @("kiosk.sh", "setup-pi.sh")) {
  $path = Join-Path $InnerDir $name
  $text = [IO.File]::ReadAllText($path) -replace "`r`n", "`n"
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

# 3. Compress
# 不能用 Compress-Archive：它写入的条目路径是反斜杠，Linux 上 unzip 会解出一堆带 \ 的坏文件名。
# 这里用 ZipArchive 手工写条目，路径统一用 '/'。
Write-Host "[3/4] Creating zip ..." -ForegroundColor Cyan
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $InnerDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($InnerDir.Length + 1).Replace('\', '/')
    $entryName = "window-bench-hmi/" + $rel
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $_.FullName, $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}

# 4. Cleanup + report
Write-Host "[4/4] Cleaning up ..." -ForegroundColor Cyan
Remove-Item $StageDir -Recurse -Force

$size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Done: $ZipPath  ($size MB)" -ForegroundColor Green
Write-Host ""
Write-Host "=== Raspberry Pi install steps ===" -ForegroundColor Yellow
Write-Host "  1. Copy $ZipName to Pi (scp / USB / cloud)"
Write-Host "  2. unzip $ZipName"
Write-Host "  3. cd window-bench-hmi"
Write-Host "  4. bash setup-pi.sh          # first-time install"
Write-Host "  5. HMI opens fullscreen"
Write-Host "  (after reboot: cd window-bench-hmi && bash kiosk.sh)"
