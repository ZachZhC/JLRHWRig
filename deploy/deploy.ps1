# 一键部署脚本：在 Windows 上构建并通过 SSH 同步到树莓派，浏览器会自动重启
# 用法：powershell -ExecutionPolicy Bypass -File .\deploy\deploy.ps1
# 首次使用：改好下面三个变量，确保树莓派已开 SSH

$PiUser = "jlr"
$PiHost = "192.168.1.50"
$RemoteRoot = "/home/jlr/window-bench-hmi"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

# 1. 构建
Write-Host "[1/4] 构建 HMI ..." -ForegroundColor Cyan
Push-Location $ProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "构建失败" }
Pop-Location

# 2. 同步脚本
Write-Host "[2/4] 同步 kiosk.sh / setup-pi.sh ..." -ForegroundColor Cyan
ssh "${PiUser}@${PiHost}" "mkdir -p ${RemoteRoot}"
scp "$PSScriptRoot\kiosk.sh"     "${PiUser}@${PiHost}:${RemoteRoot}/kiosk.sh"
scp "$PSScriptRoot\setup-pi.sh"  "${PiUser}@${PiHost}:${RemoteRoot}/setup-pi.sh"

# 3. 同步 dist（先传到 dist.new 再整体替换，避免浏览器读到半个文件）
Write-Host "[3/4] 同步 dist/ ..." -ForegroundColor Cyan
ssh "${PiUser}@${PiHost}" "rm -rf ${RemoteRoot}/dist.new && mkdir -p ${RemoteRoot}/dist.new"
scp -r "$ProjectRoot\dist" "${PiUser}@${PiHost}:${RemoteRoot}/dist.new"
ssh "${PiUser}@${PiHost}" "rm -rf ${RemoteRoot}/dist && mv ${RemoteRoot}/dist.new/dist ${RemoteRoot}/dist && rmdir ${RemoteRoot}/dist.new"

# 4. 重启 HMI（kiosk 看门狗会自动拉起）
Write-Host "[4/4] 重启 HMI ..." -ForegroundColor Cyan
ssh "${PiUser}@${PiHost}" "pkill -f 'chromium.*127.0.0.1:8080' || true; pkill -f 'kiosk.sh' || true"

Write-Host "`n完成！浏览器会在几秒内自动重启并加载新页面。" -ForegroundColor Green
