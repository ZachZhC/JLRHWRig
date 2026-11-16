#!/bin/bash
# 车窗台架 HMI 一键启动脚本（树莓派）
# 用法：双击运行 或 bash start-hmi.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
PORT=8080

# 杀掉已有实例
pkill -f "http.server ${PORT}" 2>/dev/null || true
pkill -f "chromium-browser.*--kiosk" 2>/dev/null || true
sleep 1

# 启动 HTTP 服务
nohup python3 -m http.server "$PORT" --directory "$DIST_DIR" >/dev/null 2>&1 &
echo "HTTP 服务已启动 (端口 $PORT)"

# 等待服务就绪
sleep 1

# 全屏打开 Chromium
chromium-browser \
  --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --hide-crash-restore-bubble \
  --disable-pinch --overscroll-history-navigation=0 \
  --use-gl=angle --ignore-gpu-blocklist \
  "http://127.0.0.1:${PORT}/" &

echo "HMI 已启动，访问 http://127.0.0.1:${PORT}/"
echo "关闭终端窗口即可停止 HMI"
