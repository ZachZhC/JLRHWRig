# JLR Hardware Test Rig — HMI

车轮硬件测试台架（Hardware Test Rig）的人机界面。深色工业风，
用于台架联调与演示：四门车窗、方向盘模块（SWM）、拨杆开关（SWS）、
中央有线充电（CWCM）、无线充电（WDCM）。

React 18 + TypeScript + Vite 5，零 UI 库，样式集中在 `src/styles.css`。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 类型检查 + 生产构建（dist/）
npm run preview  # 预览 dist/，http://localhost:4173
```

Windows 台架上可直接双击 `start-hmi.bat` 启动。

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
| CWCM Testing | 中央有线充电：功率控制、背光控制、USB 口点亮 + LIN Trace | 完成 |
| WDCM Testing | 无线充电 | 骨架，待接入 |

## 文档

- [AGENTS.md](./AGENTS.md) — 面向接手开发者 / AI 的完整开发说明（架构、约定、踩坑、验证方法）

## 图片

`src/assets/` 下为实物照片（透明 PNG）。新增或替换图片后需重新标定热区百分比坐标。
