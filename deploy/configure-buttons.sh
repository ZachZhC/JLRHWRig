#!/bin/bash
# reTerminal 正面 4 个用户键的 keycode 重映射
#
# 这是一个独立脚本，和 HMI 主程序（setup-pi.sh / kiosk.sh / dist）没有任何关系，
# 可以单独 scp 到树莓派上执行，不需要整个项目目录。
#
# 用法（在树莓派上跑）：
#   bash configure-buttons.sh            改成 KEY_F13~F16（需重启生效）
#   bash configure-buttons.sh --verify   读设备树，确认当前实际生效的 keycode
#   bash configure-buttons.sh --restore  改回出厂默认 KEY_A / S / D / F
#   bash configure-buttons.sh --help     看本说明
#
# 原理：只改 config.txt 里 dtoverlay=reTerminal 的参数。
#       overlay 自己导出了 key0..key3 -> usr_btn0..3 的 linux,code，
#       所以不用刷固件、不用重编译 overlay、不用动驱动。
#
# 为什么选 F13~F16：普通 USB 键盘上没有这几个键，硬件按钮永远不会和
#       操作员敲键盘撞车（出厂默认的 a/s/d/f 正好和车窗页 DOWN 档冲突）。
#
# 电源键不在此列：它是独立的 pwr_btn（GPIO13，code 142 = KEY_SLEEP），
#       key0..key3 覆盖不到，改不坏。

set -e

TARGET_CODES=(183 184 185 186)   # KEY_F13 .. KEY_F16
DEFAULT_CODES=(30 31 32 33)      # KEY_A / KEY_S / KEY_D / KEY_F（出厂值）
OVERLAY_RE='^[[:space:]]*dtoverlay=reTerminal([,[:space:]]|$)'

# ------------------------------------------------------------ 公共
find_config_txt() {
  local c
  for c in /boot/firmware/config.txt /boot/config.txt; do
    [ -f "$c" ] && { readlink -f "$c"; return 0; }
  done
  return 1
}

keycode_name() {
  case "$1" in
    183) echo "KEY_F13" ;; 184) echo "KEY_F14" ;; 185) echo "KEY_F15" ;; 186) echo "KEY_F16" ;;
    30) echo "KEY_A（出厂默认）" ;; 31) echo "KEY_S（出厂默认）" ;;
    32) echo "KEY_D（出厂默认）" ;; 33) echo "KEY_F（出厂默认）" ;;
    *) printf '0x%X' "$1" ;;
  esac
}

# 统一读成一份当前用户可读的临时副本，返回其路径。
# 原文件永远只通过 sudo tee 写回，任何分支都不会被删除。
snapshot_cfg() {
  local cfg="$1" tmp
  tmp="$(mktemp)"
  if [ -r "$cfg" ]; then
    cp "$cfg" "$tmp"
  else
    sudo cat "$cfg" > "$tmp"
  fi
  printf '%s\n' "$tmp"
}

# 在原行基础上剔除旧 key0..key3，追加新的 4 个 code
build_line() {
  local base="$1" new_line=""
  local -a parts out=()
  local p
  IFS=',' read -r -a parts <<< "$base"
  out+=("${parts[0]}")
  for p in "${parts[@]:1}"; do
    case "$p" in
      key[0-3]=*) ;;
      *) out+=("$p") ;;
    esac
  done
  out+=("key0=$2" "key1=$3" "key2=$4" "key3=$5")
  new_line="${out[0]}"
  for p in "${out[@]:1}"; do new_line="${new_line},${p}"; done
  printf '%s\n' "$new_line"
}

write_line() {
  local cfg="$1" new="$2" src="$3" tmpf
  tmpf="$(mktemp)"
  awk -v new="$new" '
    /^[ \t]*dtoverlay=reTerminal([, \t]|$)/ { if (!done) { print new; done = 1 }; next }
    { print }
  ' "$src" > "$tmpf"
  sudo cp -a "$cfg" "${cfg}.bak.$(date +%Y%m%d%H%M%S)"
  sudo tee "$cfg" > /dev/null < "$tmpf"
  rm -f "$tmpf"
  echo "[buttons] 原文件已备份为 ${cfg}.bak.*"
}

do_verify() {
  local i f h code
  echo "========================================"
  echo " 4 个用户键当前生效的 keycode（读自设备树）"
  echo "========================================"
  for i in 0 1 2 3; do
    f="/proc/device-tree/gpio_keys/usr_btn${i}/linux,code"
    if [ ! -f "$f" ]; then
      echo "  key${i} (usr_btn${i})  读不到 $f —— overlay 未加载？"
      continue
    fi
    h="$(od -An -tx1 -N4 "$f" | tr -d ' \n')"
    if [ -z "$h" ]; then
      echo "  key${i} (usr_btn${i})  属性为空"
      continue
    fi
    code=$((16#$h))   # 设备树属性是大端 u32
    printf '  key%d (usr_btn%d)  = %-3s -> %s\n' "$i" "$i" "$code" "$(keycode_name "$code")"
  done
}

do_apply() {
  local cfg src base new_line
  cfg="$(find_config_txt)" || { echo "[buttons] 未找到 config.txt（/boot 下没有该文件）" >&2; exit 1; }
  src="$(snapshot_cfg "$cfg")"

  if ! grep -qE "$OVERLAY_RE" "$src"; then
    rm -f "$src"
    echo "[buttons] $cfg 里找不到 dtoverlay=reTerminal 这一行"
    echo "[buttons] 说明 reTerminal 的驱动/overlay 没装，本脚本不擅自新增该行，已退出"
    exit 1
  fi

  base="$(grep -E "$OVERLAY_RE" "$src" | head -1 | sed 's/[[:space:]]*$//')"
  new_line="$(build_line "$base" "$@")"

  if [ "$new_line" = "$base" ]; then
    rm -f "$src"
    echo "[buttons] 已经是目标配置，无需修改："
    echo "       $new_line"
    return 0
  fi

  write_line "$cfg" "$new_line" "$src"
  rm -f "$src"

  echo "[buttons] $cfg"
  echo "       $base"
  echo "    ->  $new_line"
  echo
  echo "下一步："
  echo "  1) sudo reboot"
  echo "  2) bash $0 --verify     # 确认 4 个键的 keycode 已生效"
  echo "  3) sudo evtest          # 标定物理键对应关系（见下方警告）"
  echo
  echo "⚠ 不能假设 key0..key3 就是从左到右：overlay 里 usr_btn1 接扩展器 pin2、"
  echo "  usr_btn2 接 pin1，是交叉的；而且正面只有 F1/F2/F3 三个键，第 4 个键位置需实测。"
  echo "  改回来：bash $0 --restore"
}

usage() { sed -n '2,21p' "$0"; }

# ------------------------------------------------------------ 入口
case "${1:-}" in
  --verify)  do_verify ;;
  --restore) do_apply "${DEFAULT_CODES[@]}" ;;
  --help|-h) usage ;;
  "")        do_apply "${TARGET_CODES[@]}" ;;
  *)         echo "未知参数：$1" >&2; usage >&2; exit 1 ;;
esac
