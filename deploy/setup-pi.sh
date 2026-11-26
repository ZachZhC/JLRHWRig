#!/bin/bash
# 树莓派一次性安装脚本：在树莓派上运行  bash setup-pi.sh
#
# 作用：
#   1. 安装 Chromium、python3（http.server 依赖）
#   2. 关闭屏幕休眠
#   3. 立即启动 HMI
#
# 前提：已将整个 window-bench-hmi 目录（含 dist/ 和脚本）放到树莓派某处
#       脚本会自动识别自身所在目录，不需要硬编码路径
#
# 重启后：进入桌面，手动运行  ~/window-bench-hmi/kiosk.sh  即可打开 HMI

set -e

# --- 自动定位脚本所在目录 ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HMI_DIR="$SCRIPT_DIR"
KIOSK_SH="${HMI_DIR}/kiosk.sh"

if [ ! -f "$KIOSK_SH" ]; then
  echo "[setup] 未找到 kiosk.sh（期望位置：$KIOSK_SH）" >&2
  exit 1
fi

echo "========================================"
echo " HMI 安装脚本"
echo " 项目目录: $HMI_DIR"
echo "========================================"

NEED_RELOGIN=0

# 1. 安装 Chromium 与 python3
echo "[1/4] 检查依赖 ..."
if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  echo "  安装 Chromium ..."
  sudo apt-get update -qq && sudo apt-get install -y -qq chromium-browser 2>/dev/null \
    || sudo apt-get install -y -qq chromium
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "  安装 python3 ..."
  sudo apt-get update -qq && sudo apt-get install -y -qq python3
fi
echo "  依赖 OK"

# 2. 串口权限：WCCM 的 /dev/ttyACM* 只有 dialout 组可读写，
#    不在组里时浏览器点「连接」根本列不出串口（不是代码问题）
echo "[2/4] 检查串口权限 ..."
if id -nG "$USER" | tr ' ' '\n' | grep -qx dialout; then
  echo "  $USER 已在 dialout 组"
else
  echo "  将 $USER 加入 dialout 组 ..."
  sudo usermod -aG dialout "$USER"
  NEED_RELOGIN=1
  echo "  已加入，需重新登录（或重启）后生效"
fi

# 3. 关闭屏幕休眠
echo "[3/4] 关闭屏幕休眠 ..."
if command -v raspi-config >/dev/null 2>&1; then
  sudo raspi-config nonint do_blanking 1 2>/dev/null || true
fi
command -v xset >/dev/null 2>&1 && xset s off -dpms 2>/dev/null || true
echo "  已关闭"

# 4. 赋权 + 杀掉旧实例 + 立即启动
echo "[4/4] 启动 HMI ..."
chmod +x "$KIOSK_SH"
[ -f "${HMI_DIR}/configure-buttons.sh" ] && chmod +x "${HMI_DIR}/configure-buttons.sh"
pkill -f "kiosk.sh" 2>/dev/null || true
pkill -f "chromium.*127.0.0.1:8080" 2>/dev/null || true
sleep 1
nohup "$KIOSK_SH" >/dev/null 2>&1 &

echo "========================================"
echo " 安装完成，HMI 已启动"
echo " 重启后手动运行: $KIOSK_SH"
if [ "$NEED_RELOGIN" = "1" ]; then
  echo ""
  echo " ⚠ 串口权限刚配置：注销重新登录（或 sudo reboot）后，"
  echo "   WCCM-BT 页才列得出串口"
fi
echo "========================================"
