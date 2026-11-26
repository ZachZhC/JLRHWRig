#!/bin/bash
# 车窗台架 HMI 一键启动脚本（树莓派）
# 用法：双击运行 或 bash start-hmi.sh
# 只起"一次性"实例；要崩溃自动重启请用 deploy/kiosk.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
PORT=8080

if [ ! -d "$DIST_DIR" ]; then
  echo "未找到 dist/（先 npm run build，或直接用 deploy/pack-for-pi.ps1 打包好的目录）" >&2
  exit 1
fi

# 新版树莓派系统叫 chromium，旧版叫 chromium-browser
BROWSER="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "$BROWSER" ]; then
  echo "未找到 Chromium（新版系统: sudo apt install chromium，旧版: chromium-browser）" >&2
  exit 1
fi

# 杀掉已有实例
pkill -f "http.server ${PORT}" 2>/dev/null || true
pkill -f "chromium.*--kiosk" 2>/dev/null || true
sleep 1

# 启动 HTTP 服务
nohup python3 -m http.server "$PORT" --directory "$DIST_DIR" >/dev/null 2>&1 &
echo "HTTP 服务已启动 (端口 $PORT)"

# 等待服务就绪
sleep 1

# 全屏打开 Chromium
"$BROWSER" \
  --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --hide-crash-restore-bubble \
  --no-first-run --no-default-browser-check --password-store=basic \
  --disable-pinch --overscroll-history-navigation=0 \
  --use-gl=angle --ignore-gpu-blocklist \
  "http://127.0.0.1:${PORT}/" &

echo "HMI 已启动，访问 http://127.0.0.1:${PORT}/"
echo "关闭终端窗口即可停止 HMI"