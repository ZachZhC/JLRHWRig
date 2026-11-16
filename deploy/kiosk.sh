#!/bin/bash
# HMI 看门狗：本地起 HTTP 服务 + 全屏打开 HMI；崩溃或被杀后 2 秒自动重启
# 用法：直接运行 ./kiosk.sh 即可，脚本会自动定位同目录下的 dist/
# 依赖：python3, chromium（或 chromium-browser）

set -e

# --- 自动定位脚本所在目录 + dist ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="${SCRIPT_DIR}/dist"
PORT=8080
APP_URL="http://127.0.0.1:${PORT}/"

if [ ! -d "$SERVER_DIR" ]; then
  echo "[kiosk] 未找到 dist 目录（期望位置：$SERVER_DIR）" >&2
  echo "[kiosk] 请确认项目已正确构建，dist/ 与 kiosk.sh 同级放置" >&2
  exit 1
fi

# --- 挑选可用的 Chromium（新版 OS 叫 chromium，旧版叫 chromium-browser）---
BROWSER="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "$BROWSER" ]; then
  echo "[kiosk] 未找到 Chromium，请先运行 setup-pi.sh 安装" >&2
  exit 1
fi
echo "[kiosk] 浏览器: $BROWSER"
echo "[kiosk] 页面目录: $SERVER_DIR"
echo "[kiosk] 访问地址: $APP_URL"

# --- X11 会话下关闭屏幕休眠 ---
command -v xset >/dev/null 2>&1 && xset s off -dpms 2>/dev/null || true

# --- 主循环：HTTP 服务 + 浏览器全屏，退出 2s 后重启 ---
while true; do
  # 页面通过本地 HTTP 提供（ES 模块不能用 file:// 直接打开，会有跨域限制）
  if ! pgrep -f "http.server ${PORT}" >/dev/null 2>&1; then
    nohup python3 -m http.server "$PORT" --directory "$SERVER_DIR" >/dev/null 2>&1 &
    sleep 1
  fi

  "$BROWSER" \
    --kiosk --noerrdialogs --disable-infobars \
    --disable-session-crashed-bubble --hide-crash-restore-bubble \
    --disable-pinch --overscroll-history-navigation=0 \
    --use-gl=angle --ignore-gpu-blocklist \
    "$APP_URL"
  sleep 2
done
