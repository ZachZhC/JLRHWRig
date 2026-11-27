# JLR Hardware Test Rig — HMI

车轮硬件测试台架（Hardware Test Rig）的人机界面。深色工业风，
用于台架联调与演示：四门车窗、方向盘模块（SWM）、拨杆开关（SWS）、
中央有线充电（CWCM）、WCCM 蓝牙耳机音频（WCCM-BT）、无线充电（WDCM）。

React 18 + TypeScript + Vite 5，零 UI 库，样式集中在 `src/styles.css`。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 类型检查 + 生产构建（dist/）
npm run preview  # 预览 dist/，http://localhost:4173
```

Windows 台架上可直接双击 `start-hmi.bat`（起 4173 预览并打开浏览器）。
树莓派 kiosk 用 `deploy/` 下的脚本部署。

## 设计基准

所有页面按 **1280×720 (16:9)** 固定画布排版，运行时按
`min(窗口宽/1280, 窗口高/720)` 整体等比缩放居中。
因此无论 1280×720、1920×1080 还是 4K，排布与视觉比例完全一致。

> 改布局前请先读 [AGENTS.md](./AGENTS.md) 第 3 节的约束。

## 页面

| Tab | 说明 | 状态 |
|---|---|---|
| Windows Testing | 四门车窗（两段式 M/A 开关、自动防夹、LIN Trace） | 完成 |
| SWM Testing | 方向盘模块：档位 / 转向灯 / 远近光 / 雨刮 / 雾灯 + CAN Trace | 完成 |
| SWS Testing | 左右拨杆开关：LED 光条 + 菜单/娱乐/巡航/ADAS 监控 + CAN Trace | 完成 |
| CWCM Testing | 中央有线充电：真实 LIN15 收发（「充电」开关 = 通讯/0x3C 休眠）、背光控制、USB 口 LED 跟随信号、LIN Trace | 已接真实 LIN（等 XL2 绑口） |
| WCCM-BT Testing | WCCM 蓝牙：扫描/配对/挂载真帧收发、4 路 UAC 真实出声、ANC/限幅器 + CDC Trace | 已接真实模块 |
| WDCM Testing | 无线充电：实物图、NFC 感应动画、FOD 异物检测、25W/15W/5W/OFF 档位、Phone As Key | 前端完成，等 CAN 信号 |

## WCCM-BT 的两个前提

这一页跟别的页不一样，不开对前提就是“点了没反应”：

1. **必须用 `http://` 打开**（`http://localhost:4173` 这类），且浏览器用 Edge / Chrome。
   `file://` 或局域网 IP 下没有 Web Serial / 音频设备枚举能力。
2. **WCCM 的 COM 口是独占的**：供应商上位机开着时页面连不上，先关掉上位机。

## CWCM 的运行前提

CWCM 页的所有收发都走本机 **BMCLI Web**（`127.0.0.1:8080`，Vite 已把 `/api` 代理过去）：

```powershell
& "$env:LOCALAPPDATA\Programs\BMCLI\bin\bmcli.exe" web start --listen=127.0.0.1:8080
```

XL2 到货后要先绑定 LIN 口（`bmcli bench init --network=cwcm-lin --channel=<SN/port>`），
再从页面「连接」。用 `file://` 打开时连不上（相对 `/api` 没有宿主）。

## 文档

- [AGENTS.md](./AGENTS.md) — 面向接手开发者 / AI 的完整开发说明（架构、约定、踩坑、验证方法）

## 图片

`src/assets/` 下为实物照片（透明 PNG）。新增或替换图片后需重新标定热区百分比坐标。