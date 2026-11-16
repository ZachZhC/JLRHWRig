# AGENTS.md — JLR 硬件测试台架 HMI 开发说明

> 本文件是**写给接手的 AI / 开发者**的交接文档。请先完整读一遍再动代码。
> 最后更新：2026-11（CWCM 页面功能完成，WDCM 待接实物图）

---

## 1. 项目是什么

车轮测试台架（Hardware Test Rig）的人机界面（HMI）。深色工业风仪表盘，
用一台屏幕模拟真实车上的多个控制模块，用于台架联调与演示。
后续会接入树莓派 GPIO / LIN / CAN 真实硬件（目前全部为前端模拟）。

顶部品牌：`DP-Hardware Team Rig · Test Version v0`，右侧有 `模拟输入 SIM` 状态灯与时钟。

### 五个测试页面（顶部 Tab 切换）

| Tab key | 页面 | 内容 | 状态 |
|---|---|---|---|
| `window` | Windows Testing | 四门车窗（FL/FR/RL/RR）+ 中央车辆俯视图 + LIN Trace | 已完成 |
| `swm` | SWM Testing | 方向盘模块（Steering Wheel Module）实物图 + 6 个监控面板 + CAN Trace | 已完成 |
| `sws` | SWS Testing | 左右拨杆开关（Steering Wheel Switch）双实物图 + LED 光条 + 监控面板 + CAN Trace | 已完成 |
| `cwcm` | CWCM Testing | 中央有线充电模块（USB 充电）实物图 + 功率/背光控制 + LIN Trace | 已完成 |
| `wdcm` | WDCM Testing | 无线充电模块 | **仅有骨架**，等实物图与信号定义 |

---

## 2. 技术栈与运行

- React 18 + TypeScript + Vite 5，无 UI 框架、无状态库、无 CSS 框架（纯手写 CSS）
- 字体：JetBrains Mono（数字/英文）、Orbitron（品牌）、Noto Sans SC（中文），在 `index.html` 预加载
- 只有两个运行时依赖：`react`、`react-dom`

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build，产物在 dist/
npm run preview  # 预览 dist/，http://localhost:4173
```

**Windows 环境注意**：如果终端里 `npm` 找不到，用完整路径
`& "$env:USERPROFILE\.local\lib\nodejs\npm.cmd" run dev`。
`vite.config.ts` 里已设 `base: './'`，目的是让 `dist/` 能用 `file://` 直接在树莓派 kiosk 下打开。

`start-hmi.bat` 是给台架用的双击启动脚本（起 4173 预览 + 打开浏览器）。

---

## 3. ⚠️ 设计基准：1280×720（改布局前必读）

`src/App.tsx` 用 **固定设计画布** 方案：

```
scale = min(innerWidth / 1280, innerHeight / 720)
```

`.design-canvas` 固定 `1280 × 720`，用 `transform: translate(-50%,-50%) scale(scale)` 居中缩放。

**含义与约束：**

1. 所有 CSS 里的 px 都是"1280×720 画布内的像素"，不随窗口变化。
   任何 16:9 显示器（1280×720 / 1920×1080 / 2560×1440 / 4K）都会等比铺满，排布完全一致。
2. **改任何高度之前先算总账**：`顶栏 + main 内边距 + 各区块高度 + 间距` 必须 ≤ 720。
   超了就会裁切（页面本身禁止滚动，`body { overflow: hidden }`）。
3. 不要再加 `@media` 断点改布局 —— 那会破坏"锁定排布"的前提。
4. 不要用 `vw/vh` 单位做字号（会随真实视口漂移），一律用 px。
5. 当前垂直预算（720）：顶栏约 46 → main 内边距 8/10 → 各页区块按下面第 5 节。

---

## 4. 目录结构

```
src/
  App.tsx              固定画布 + 缩放 + Tab 路由
  main.tsx             入口
  styles.css           全站样式（约 1900 行，唯一的样式文件）
  assets/              实物图（PNG，带透明通道）
  domain/              业务状态机（纯 TS，无 React）
    types.ts           DoorId / Direction / BenchEvent / DoorSnapshot ...
    doors.ts           四门静态定义
    bench.ts           车窗台架状态机（按压/自动/限位/事件日志）
    swm.ts             方向盘模块状态机
    sws.ts             拨杆开关状态机
  ui/
    TopBar.tsx         Tab 定义 + 时钟（新增页面先改这里）
    WindowPage.tsx     车窗页（含键盘映射）
    DoorPanel.tsx      单个车门（玻璃动画 + 2×2 摇窗开关）
    CarFigure.tsx      中央车辆俯视图（只是一个 <img> + 文字）
    SWMTesting.tsx     方向盘页
    SWSTesting.tsx     拨杆页
    CWCMTesting.tsx    中央有线充电页
    WDCMTesting.tsx    无线充电页（骨架）
    EventLog.tsx       通用 Trace 面板（LIN / CAN 共用）
    Telemetry.tsx      车窗页右侧状态条
deploy/                台架部署脚本（Windows / 树莓派 kiosk）
```

---

## 5. 各页面布局骨架（1280×720 下的高度）

统一使用 `.swm-page` 这个类做页面纵向 flex 容器（**SWS/CWCM/WDCM 也复用它**，名字是历史遗留）：

```
.swm-page               纵向 flex，gap 8~10
  .swm-stage            实物图舞台，flex: 1 1 auto（吸收剩余高度）
  .swm-monitors         监控面板行，固定高度
  .sws-trace            报文面板，固定高度
```

| 页面 | stage | monitors | trace |
|---|---|---|---|
| SWM | 自适应 | 6 张卡单行，约 112 | 约 170 |
| SWS | 自适应（两列） | 每侧 1×3，约 112 | 约 170 |
| CWCM | 自适应 | 3 个面板，固定 112 | `.cwcm-trace` 约 170 |
| WDCM | 自适应 | 2 个面板 | 约 170 |
| Window | `.stage` 网格（不是 `.swm-stage`） | — | 右侧 `.side` 列内 `.event-log` |

⚠️ Windows 页用的是 `.main` 两列网格（左 `.stage` + 右 `.side`），不要照搬 SWM 的骨架。

### CSS 命名与特异性陷阱

- 页面专属样式加前缀：`.cwcm-*`、`.sws-*`、`.swm-*`、`.door*`、`.car-*`。
- **坑**：`.swm-*` / `.sws-*` 规则在文件里位置更靠后，会在同特异性下覆盖前面的 `.cwcm-*` 规则。
  给某页做覆盖时请用双类选择器，例如 `.swm-monitors.cwcm-monitors`。
- 颜色变量在 `:root`；主强调色是青色（`#2fd5c3` / 相关青色变量），警告色琥珀，禁止色红。

---

## 6. 状态管理约定（很重要，踩过坑）

全站不用 Redux/Zustand，用"类 + useSyncExternalStore"的极简 store（见 `domain/bench.ts`）：

```ts
class BenchStore {
  private snapshot: BenchSnapshot = ...;
  subscribe = (fn: () => void) => { ... };      // 必须是箭头函数字段
  getSnapshot = () => this.snapshot;            // 必须是箭头函数字段
  private notify = () => {
    this.snapshot = { doors: [...], events: [...], _rev: ++this.rev }; // 必须新建对象
    this.listeners.forEach(fn => fn());
  };
}
```

两条铁律：

1. `subscribe` / `getSnapshot` **必须写成箭头函数类字段**。写成普通方法的话，
   通过 `useSyncExternalStore(store.subscribe, store.getSnapshot)` 传入后 `this` 会丢。
2. `notify()` 里**必须返回新对象引用**，否则 React 认为没变化，不重渲染。

---

## 7. 功能细节与业务语义

### Windows Testing（`domain/bench.ts`）

- 玻璃位置 `position`：`0 = 全开（玻璃在最下）`，`100 = 全关（升到顶）`。
- 开关是 **2×2 两段式**：`M`（手动）+ `A`（自动），UP 关窗 / DOWN 开窗。
  `press(id, dir, source, stage)`，`stage = 'manual' | 'auto'`。
- 自动模式中途再次按压 = **停止**（符合真实车安全策略），不是反向。
- `DoorSnapshot.drive` 是"输入方向"，`moving` 是"物理运动（含惯性减速）"。
  **按键高亮只能用 `drive`**，用 `moving` 会在减速阶段错误闪亮。
- 键盘：`Q/W/E/R` = UP，`A/S/D/F` = DOWN，按住 `Shift` = 自动档。
  **每个页面的键盘监听都要先判断 `activeTab`**，否则跨页误触发。

### SWM / SWS

- 实物图热区用**百分比坐标**标定（相对图片宽高），不要写死 px。
- 状态机在 `domain/swm.ts` / `domain/sws.ts`，UI 只读快照。

### CWCM（`ui/CWCMTesting.tsx`）

控制台下发（模拟 LIN）：

| 控件 | 取值 | 说明 |
|---|---|---|
| `External Power Limit` | 400 / 240 / 60 / 0 W | 外部给模块的输入限值 |
| `EIPowerStatus` | Keep Active / WarningLowBatteryVolt / ShutDown / NotUsed | |
| `LimitedPowerMode` | False / True | |
| `Backlight Status` | 0 = OFF / 1 = ON | 发 LIN 0/1 |
| `Backlight Intensity` | 0–254 有效，**255 = Fault Condition Present** | |

模块回传（只读监控，放在图片右侧）：

- `Internal Power Level`：CWCM 上报的输出档位（模拟恒为 400）。
- `Actual Power Level`：整数，0–400 之间随机游走。
- **超限判定**：`Actual > min(External Power Limit, Internal Power Level)` → 报 WARNING（琥珀闪烁）。
- `External Power Limit` 与 `Internal Power Level` **没有任何联动**，别把它们写成有关系的。

USB 输出口：下方中间 3 个 + 右下 1 个，共 4 个，**不可单独控制**，
充电使能时四个口一起点亮（青色呼吸光晕）。四个口的百分比坐标见
`CWCMTesting.tsx` 里的 `USB_PORTS` 常量（按原图 1362×641 像素标定的）。

### WDCM

只有骨架（占位图 + 两个面板 + CAN Trace）。等实物图与信号定义后按 CWCM 的模式实现。

---

## 8. 图片资源与热区标定方法

- 图片放 `src/assets/`，`import img from '../assets/xxx.png'` 引入（Vite 会打包）。
- 透明背景的 PNG 直接用；需要抠图/旋转时用 Python(Pillow) **独立脚本处理后再放入**，
  不要把处理逻辑写进前端。
- **热区标定流程**（本项目一贯做法，别靠猜）：
  1. 用带坐标网格的放大图逐块核对实物边界；
  2. 记下左上角与宽高，换算成相对原图的百分比；
  3. 写进组件的常量数组（如 `USB_PORTS`），用 `left/top/width/height: %` 定位；
  4. 改图尺寸后必须重新标定（百分比要基于新图重算）。

---

## 9. 验证要求（不要只读代码就下结论）

1. `npm run build` 必须 exit 0（含 `tsc --noEmit`）。
2. 布局类改动必须**看一眼真实渲染**。可用无头浏览器截图（本机已装 Edge）：

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --screenshot="c:\tmp\shot.png" --window-size=1280,720 `
  --virtual-time-budget=5000 http://localhost:5173
```

   （注意：无头方式只能截默认 Tab；要看其他页需临时改 `App.tsx` 的初始 `activeTab`，
   截完**务必改回 `'window'`**。）
3. 检查点：页面是否溢出 720、有无裁切/重叠、文字是否被挤压、留白是否失衡。
4. 不要用"代码分析"代替真实截图。之前出现过"源码看着没问题、实际已溢出"的情况。

---

## 10. 历史踩坑（别再踩）

| 问题 | 原因 / 解法 |
|---|---|
| store 更新后不重渲染 | `subscribe/getSnapshot` 写成了普通方法丢了 `this`；或 `notify` 没造新对象 |
| 切 Tab 后按键串台 | 键盘监听没判断当前 `activeTab` |
| 自动键被当成手动键 | `WindowPage.handlePress` 漏传第 4 个参数 `stage` |
| 自动关窗时手动键闪亮 | 高亮用了 `moving`（含惯性），应改用 `drive` |
| 面板样式不生效 | `.swm-*` 规则在后面覆盖了 `.cwcm-*`，需提高选择器特异性 |
| 页面底部被裁 | 固定高度累加超过 720，`body` 不允许滚动 |
| PowerShell 里 `python -c` 多行脚本报语法错 | `r"..."` 的前缀被吞；改成写临时 `.py` 文件再执行 |
| 终端 `npm` 找不到 | PATH 未刷新，用 `%USERPROFILE%\.local\lib\nodejs\npm.cmd` |
| 预览空白 | dev server 重启后 IDE 预览未重连；刷新或确认端口 5173 |

---

## 11. 代码风格

- 注释、UI 文案：**中文**；标识符：英文。数字与英文标签沿用实物/报文原名（如 `EIPowerStatus`）。
- 组件函数导出用 `export function Xxx()`，不用 `default`（`App.tsx` 除外）。
- 不引入新依赖前先问；本项目刻意保持零 UI 库、单 CSS 文件。
- 一次性脚本（图像处理、校验）不要留在仓库里。

---

## 12. 待办（Next）

- [ ] WDCM 页面接入实物图 + 信号定义
- [ ] 接真实硬件：树莓派 GPIO（Windows）、LIN / CAN 收发
- [ ] WCCM Part Number / Serial Number 由真实 LIN 报文填充（目前预留 24 字符占位）
- [ ] `EIPowerStatus = ShutDown` 时是否强制 `Internal Power Level = 0`（待确认）
- [ ] Actual Power Level 的模拟策略确认（当前随机游走）
