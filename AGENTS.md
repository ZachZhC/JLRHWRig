# AGENTS.md — JLR 硬件测试台架 HMI 开发说明

> 本文件是**写给接手的 AI / 开发者**的交接文档。请先完整读一遍再动代码。
> 最后更新：2026-11-26（树莓派部署自检：`.sh` 固定 LF、串口 dialout 权限、Chromium 首启参数；
> WCCM-BT 页接真实模块：Web Serial 打 COM 口、CDC 帧编解码、连上自动握手，**模拟全部删除**）

---

## 1. 项目是什么

车轮测试台架（Hardware Test Rig）的人机界面（HMI）。深色工业风仪表盘，
用一台屏幕模拟真实车上的多个控制模块，用于台架联调与演示。
后续会接入树莓派 GPIO / LIN / CAN 真实硬件（目前除 WCCM-BT 的蓝牙链路外，其余仍为前端模拟）。

顶部品牌：`DP-Hardware Team Rig · Test Version v0`，右侧有 `模拟输入 SIM` 状态灯与时钟。

### 六个测试页面（顶部 Tab 切换）

| Tab key | 页面 | 内容 | 状态 |
|---|---|---|---|
| `window` | Windows Testing | 四门车窗（FL/FR/RL/RR）+ 中央车辆俯视图 + LIN Trace | 已完成 |
| `swm` | SWM Testing | 方向盘模块（Steering Wheel Module）实物图 + 6 个监控面板 + CAN Trace | 已完成 |
| `sws` | SWS Testing | 左右拨杆开关（Steering Wheel Switch）双实物图 + LED 光条 + 监控面板 + CAN Trace | 已完成 |
| `cwcm` | CWCM Testing | 中央有线充电模块（USB 充电）实物图 + 功率/背光控制 + LIN Trace | 已完成 |
| `btaudio` | WCCM-BT Testing | WCCM 蓝牙耳机音频：4 条 UAC 音轨（=4 个 Zone）+ **浏览器真实出声的下行播放** + 全局 ANC/限幅器 + 真实 CDC Trace | 已接真实模块（无任何模拟） |
| `wdcm` | WDCM Testing | 无线充电模块实物图 + NFC 感应动画 + 充电档位 + Phone As Key | 前端已完成，等 CAN 信号 |

> 页面显示名在 `TopBar.tsx` 的 `TABS[].label`；`btaudio` 这页对外叫 **WCCM-BT Testing**，
> 但 Tab key、文件名（`BTAudioTesting.tsx` / `btaudio.ts` / `.bta-*`）仍是历史名，不用跟着改。

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

**树莓派部署**：`deploy/pack-for-pi.ps1` 在 Windows 上打包（`dist/` + `kiosk.sh` + `setup-pi.sh`），
拷到 Pi 后 `bash setup-pi.sh` 一次性装依赖（Chromium、python3、`dialout` 串口权限、关屏保）
并立即启动；`kiosk.sh` 是崩溃/退出后 2 秒自动重启的看门狗，浏览器名 `chromium` /
`chromium-browser` 两种都探测。`.sh` 由 `.gitattributes` 固定为 LF —— 在 Windows 上手改脚本后
再拷，必须保持 LF，CRLF 会让 Pi 上第一行就报 `$'\r': command not found`。

⚠️ **WCCM-BT 页的"音频下行播放"只能用 `http://` 打开，不能用 `file://`。**
非安全上下文里 `navigator.mediaDevices` 直接不存在，列不出声卡也切不了输出。
其余页面仍然可以 `file://`，所以 kiosk 部署时若要用到出声功能，得走 `npm run preview` 的 http 地址。

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
  styles.css           全站样式（约 2880 行，唯一的样式文件）
  assets/              实物图（PNG，带透明通道）
  domain/              业务状态机（纯 TS，无 React）
    types.ts           DoorId / Direction / BenchEvent / DoorSnapshot ...
    doors.ts           四门静态定义
    bench.ts           车窗台架状态机（按压/自动/限位/事件日志）
    swm.ts             方向盘模块状态机
    sws.ts             拨杆开关状态机
    btaudio.ts         WCCM 蓝牙状态：只 ingest 模块上报、只发真帧；没报的字段留 null
    cdc.ts             CDC 协议唯一目录：帧编解码（22+len、CRC16-CCITT-FALSE）、最小 protobuf 读写、
                       payload 翻成一行中文/字段、报文编号表 `CDC`（接真协议时只改这张表）
    serial.ts          Web Serial 链路：选口/开关口、半帧拼接、按 CDC 表发帧、开箱三步握手
    audioout.ts        浏览器真实出声：枚举输出设备 / setSinkId 切路 / Zone↔声卡绑定（存 localStorage）
  ui/
    TopBar.tsx         Tab 定义 + 时钟（新增页面先改这里）
    WindowPage.tsx     车窗页（含键盘映射）
    DoorPanel.tsx      单个车门（玻璃动画 + 2×2 摇窗开关）
    CarFigure.tsx      中央车辆俯视图（只是一个 <img> + 文字）
    SWMTesting.tsx     方向盘页
    SWSTesting.tsx     拨杆页
    CWCMTesting.tsx    中央有线充电页
    BTAudioTesting.tsx 蓝牙耳机音频页
    WDCMTesting.tsx    无线充电页（实物图 + NFC 动画 + 档位/Phone As Key，状态暂用 useState）
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
| WCCM-BT | `.bta-radio` 固定 **216**（头栏两行 + 扫描/发现/已配对三栏）+ `.bta-zones` 固定 **148**（4 张 Zone 卡，每卡自带播放器） | —（没有 monitor 行） | **`flex: 1 1 auto`，剩约 272** |
| WDCM | 自适应（实物图 max-height 205） | 2 个面板，固定 112 | 约 170 |
| Window | `.stage` 网格（不是 `.swm-stage`） | — | 右侧 `.side` 列内 `.event-log` |

⚠️ Windows 页用的是 `.main` 两列网格（左 `.stage` + 右 `.side`），不要照搬 SWM 的骨架。
⚠️ WCCM-BT 页是唯一的例外：没有实物图，`.bta-radio` / `.bta-zones` 两段按内容固定死，
剩余高度让给 `.bta-trace`（`flex: 1 1 auto`），这样长时间测试的报文才有地方看。
当前总账 `216 + 148 + 272 + 2×9(gap) = 654`，正好等于 main 的内容高度，**再往上加高度就会裁**。

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

### WCCM-BT（`ui/BTAudioTesting.tsx` + `domain/btaudio.ts` + `domain/serial.ts`）

> **这一页已经没有模拟了（2026-11-24 用户明确要求删干净）**：
> 每个按钮只做一件事 —— 往串口发一帧；页面上所有状态都等模块上报才改；
> 模块没报的字段一律显示 `—`。没连 COM 时所有开关都是灰的。
> **不要为了"演示好看"再加假设备、假定时器、假电量**——用户就是被这些假数据搞糊涂的。

- 4 条 UAC 音轨 = 4 个 Zone（Req01579573 的通道映射）：
  Ch0 副驾 `PASSENGER`(0x04) / Ch1 右后 `REAR_RIGHT`(0x06) / Ch2 左后 `REAR_LEFT`(0x05) / Ch3 主驾 `DRIVER`(0x07)。
  设备在 Zone 里的归属**只认模块的 `NotifyBTDeviceAttach`(0x0040)**，`zone_id → Ch` 映射在
  `btaudio.ts` 的 `CH_BY_ZONE_ID`。
- **Ch3 主驾在本台架上允许挂载** —— 需求原文写明首个量产版本不含 Driver，但台架按用户要求放开四个 Zone，
  别自作主张改回"拒绝"。
- 状态**全部**来自模块：`0x2004/0x2006` 蓝牙开关、`0x0010` 扫描状态、`0x0016` 发现设备（名字/类型/RSSI）、
  `0x0020` 设备状态、`0x0040` 挂载、`0x3018` 已配对列表、`0x2026` 音量/静音、`0x2016` 播放状态、
  `0x2050` 电量、`0x2064` 延迟、`0x2036` ANC、`0x2046` 限幅器。
- **拿到 `0x3018` 的 id 列表后会自动逐个查属性**（照上位机做法）：`0x3015`→`0x3016`（名字/类型/RSSI/状态）、
  `0x1013`→`0x1014`（Zone）、`0x2023`→`0x2024`（音量/静音）、`0x2047`→`0x2048`（电量）、
  `0x2061`→`0x2062`（延迟）。不查的话重连后只剩 `设备 1` 这种名字。
  它们和 `0x2050/0x2064/0x2026` 这些 Notify 是同一批字段的两个来源，Notify 优先、查询用来打底。
- **动作回执必须显示出来**：`0x0012/0x0014/0x0022/0x0032/0x0034/0x0042/0x0044/0x2002/0x2022/0x2032/0x2042`
  都会把模块的 return_value 原样写进扫描区的提示行。真实模块**蓝牙关着时扫描会回 REJECTED(2)**
  （2026-11-24 上位机日志第一条就是），蓝牙显示 OFF 时「开始扫描」直接禁用，避免"点了没反应"。
- 动作（分两处 UI）：
  | UI | 发的帧 |
  |---|---|
  | 蓝牙使能按钮 | `0x2001`，`EnumBTConnectivityState 1=ENABLED 2=DISABLED` |
  | 对时 / 读状态 | `0x2051` / `0x2003` + `0x3017` |
  | 开始扫描 / 取消扫描 | `0x0011`（空 payload）/ `0x0013` |
  | 配对 / 连接 / 断开 / 取消配对 | `0x0021` / `0x0031` / `0x0033` / `0x0043`，payload `field1=btdevice_id` |
  | 挂载下拉 | `0x0041`，`field1=btdevice_id, field2=zone_id` |
  | 音量滑条 | `0x2021`，`field1=id, field2=3(SET), field3=level`；0–60（`VOLUME_MAX`） |
  | 静音按钮 | `0x2021`，op 4=MUTE / 5=UNMUTE |
  | ANC / Limiter 下拉 | `0x2031` / `0x2041`，`field1=0, field2=枚举`（ANC 1 OFF/2 ON/3 AMBIENT，Limiter 1 OFF/2 ON） |
- 按钮高亮/回显**一律以模块上报为准**，不要用点击时的本地值乐观更新 —— 比如蓝牙使能按钮点了之后
  仍显示 `—` 直到 `0x2002`/`0x2006` 回来。
- 挂载是**手动的**（已配对列表右侧的下拉），连上设备后不会自动 attach；`CONNECTED` 只表示"已连接"，
  不代表已挂载。协议里 Attach 由 CCCM 发起（Comment00432042），这里就是 CCCM 侧。
- 播放控制 `PLAY1/PAUSE2/STOP3/NEXT4/PREV5`（`0x2016`）**只能从耳机侧上报**，模块不接受 CCCM 直接发，
  所以页面上没有这些按钮，只等耳机真的按了才在 Trace 里出现。
- ANC / 限幅器是**全局**的，报文 `btdevice_id` 固定 0x00；开机默认 ANC ON、Limiter ON（Req01523128 / Req01523141）。
- 报文编号集中在 `domain/cdc.ts` 的 `CDC` 常量表，**接真协议时只改这张表，UI 不动**。
  编号已逐条核对过 SSRD 报文表；其中 **ANC(0x2031~0x2036) / Limiter(0x2041~0x2046) 这一族供应商上位机没有实现**
  （`messageinfo.json` 里查不到），实物联调时要重点验证这 6 条。
- 断链（`serialLink` 变回非 open）会调 `bta.reset()`：清设备/开关状态，**保留 Trace 里的帧**
  （方便看最后几帧到底发生了什么）。

#### 音频下行播放（`domain/audioout.ts`，**没有独立的播放卡**）

这是全站**唯一真出声**的地方。**四条独立音轨**，每条 Zone 卡自带一个播放器：
自己的 `<audio>`、自己的文件、自己的声卡、自己的播放头，四路可同时放不同内容。链路：

```
本地音频文件 → <audio>(每路一个) → setSinkId() 绑定的那一路 Windows 输出
             → WCCM 的 UAC 通道 → 蓝牙耳机
```

- **音源只做本地文件**，用户明确不要内置测试音；文件用 `<input type=file>` + `URL.createObjectURL`，
  只在内存里，不上传也不落地。
- **Zone↔声卡绑定**是这页的核心价值：每张 Zone 卡底部一个声卡下拉，绑定关系存
  `localStorage` 的 `bta.zoneSink.v1`；绑定后**立刻生效**到那一条音轨，
  选文件、播放、暂停、拖动进度都只影响这一路，四路互不干扰。
- **播放门控**：这一路没绑声卡时，播放按钮 `disabled`，防止声音从电脑默认输出跑出来。
- **声卡下拉按 USB 身份分组**（`groupSinks`）：串口口报的 VID:PID（模块是复合设备，CDC 与 UAC 共用）
  与声卡名括号里的 `(hhhh:hhhh)` 一致才算「WCCM 输出（USB xxxx:xxxx）」，其余归「其他输出」；
  `默认 - ` / `通信 - ` 是 Chrome 给默认/通信角色复制的同一端点，按标签前缀过滤掉。
  这个号只是**标签**不是门禁：连不上或号变了就退化成「USB 输出」组（带 USB 号的全算），
  再不行退回「系统输出」平铺 —— 任何情况下都不能把真实端点藏掉。
  之前绑过但现在不存在的设备会以 `已绑：…` 留一行，方便看出哪路声卡掉了。
- 三个前提，缺一个就不出声，UI 必须把话说清楚：
  1. 只能 `http://` 打开（`file://` 下 `navigator.mediaDevices` 直接不存在）；
  2. 要**一次性麦克风授权**才拿得到 deviceId/label，未授权时列表里全是空名 —— 所以有「授权」按钮；
  3. 上位机或 Windows 独占模式可能占住 UAC 端点，`setSinkId` 会 `AbortError`。
- `canRoute` 门控：没拿到真实 deviceId 时，所有跟输出有关的控件一律 `disabled`，
  不能让人以为按了有用。
- **音频路由信息只在头栏第二行出现一次**：`输出 N 路 [授权] [刷新] <状态>`。
  `授权` 只在未授权时出现；状态行 `bta-audio-state` 最长 560px（超了省略，完整文本放 `title`），
  文案要短，错误提示一律翻成白话，别只甩 `DOMException.name`。
- 原来那张 `Audio Downlink` 监控卡（四路绑定一览）和 `Module Report` 卡**已删除**：
  绑定/播放状态每张 Zone 卡自己就显示，重复。
- ANC / Limiter 下拉在头栏第一行。⚠️ 头栏是**两行**，`align-items: stretch` 不能丢（见第 10 节）。
- ⚠️ 四路真实出声跟 CDC 报文**没有任何关系**：这一路能不能响只看「有没有文件 + 绑没绑声卡」，
  模块上有没有设备挂在这一路是另一回事。别把 `audioOut` 的状态接到 `bta` 上，反之亦然。
- 耳机上报条（`.bta-inject-strip`）和它的快捷键（`Space` / `[` `]` / `P` `N`）**已随模拟一起删除**。
  那套是"伪造耳机侧的 CDC 事件"，跟真实模块的收发混在一起分不清。

#### 真实模块链路（`domain/cdc.ts` + `domain/serial.ts`，Web Serial）

头栏第二行右端：`模块 <状态> [连接]`。点「连接」弹浏览器串口选择框，选 WCCM 那个 COM。

- **只能 `http://localhost`**（安全上下文里才有 `navigator.serial`），浏览器用 Edge / Chrome；
  用局域网 IP 打开时 `navigator.serial` 直接不存在。
- **串口是独占的**：供应商上位机开着的时候打不开，先关上位机。打不开时状态行直接写原因。
- 帧结构 `A1 FF | seq | 00 | pt | msgId(2 LE) | mt | n1(1) | n2(1) | len(2 LE) | payload | crc | D0 FF`，
  总长 22+len，CRC16-CCITT-FALSE 覆盖 seq→payload 末尾。**已用 2026-11-24 的真实串口日志逐字节验证**
  （29 帧全过，重编码与日志逐字节一致）—— 改 `cdc.ts` 必须重跑这个比对，别只看代码。
- 发帧 seq 从 3 起奇数递增（3,5,7…），模块回偶数；n1/n2 上位机全程写 1/1，照抄。
- **pt 有历史包袱**：0x2001/0x2003 实机是 pt=1（规范写 3）、0x3017 是 4、0x2051 是 3，
  模块都收 —— `CDC` 表已按实机改，别再"按规范纠正"回去。
- 连上自动三步握手（照抄上位机）：`0x2051` 对时 → `0x2003` 读蓝牙状态 → `0x3017` 读已配对列表。
- Trace 只有一路：真实串口的全部收发，`TX` = 下发、`RX` = 模块上报，右上角是 `TX n / RX n` 计数
  和丢弃字节数（`decodeFrames` 撞到对不上的字节会前移重同步并计数）。
- **页面上每个控件现在都发真帧**（清单见上面那张表），所有回显都来自真实上报。

### WDCM

实物图已接入（`src/assets/wdcm.png`，1362×697，透视校正后的正俯视图）。
渲染尺寸由 `.wdcm-img-wrap { max-height }` 控制，当前 **401×205**；
用户连续否过 336 / 282 / 240 三档，方向是"实物图越小、卡片越突出"，别随意调大。

面板与信号都还是前端模拟，等 CAN 定义到位后把组件里的 `useState` 换成状态机快照：

- **NFC 动画**：按钮 + 快捷键 `N` 触发，卡片落到线圈圆盘中央并保持，
  配循环扩散的涟漪 + 青色底光呼吸。线圈热区常量 `COIL = { left:41.5, top:58.8, width:39.06 }`。
  卡片宽度是线圈的 **132%**（比圆盘大一圈），所以涟漪终态 `scale` 必须 **> 1.32**
  才不会被卡片完全挡住 —— 加大卡片要同步加大涟漪终态。
- **充电开关 Charging**：三个档位按钮 `25W / 10W / OFF`（`GEARS` 常量），
  测试人员手动单选，默认 OFF。选中 25W/10W 用青色高亮，OFF 用中性冷灰（不占告警色）。
- **Phone As Key**：一行 `Handshake` 状态栏，取值 `PENDING / SUCCEEDED / FAILED`，
  默认 PENDING。判定逻辑未定，点击状态栏在三种值间循环以便演示。
  红/琥珀/青都在 `:root`（新增 `--danger: #e4635c` 表示硬失败）。
- CAN Trace 仍是空占位。

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
5. 验"音频下行播放"时，本机没有 4 路 UAC，办法是**临时**往 `index.html` 塞一段脚本：
   覆写 `navigator.mediaDevices.enumerateDevices` 造 4 个假声卡，再自动点 Tab、选一个合成 WAV。
   这段是 `TEMP-VERIFY` 用的，**验完必须删干净**（`git diff -- index.html` 应当为空），
   一次性脚本不要留在仓库里。
6. 页面上的蓝牙状态**没有模拟路径**，不接硬件时想验状态机，用假串口（`navigator.serial` 给一个
   `ReadableStream`/`WritableStream` 假 port），把真实串口日志里的 RX 帧灌进去。做法见会话记录里的
   `entry_ingest.ts` 思路：`serialLink.onFrame -> bta.ingest`，然后读 `bta.getSnapshot()` 断言。
   仓库里**不要留**这类脚本。

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
| 状态文字被省略号截掉 | `.bta-audio-state` 在头栏第二行最多 560px（以前在卡片头里只有 248px）；文案写短，完整文本放 `title` |
| WCCM-BT 整页变窄、品牌文字居中、按钮折行 | `.swm-stage:not(.cwcm-stage)` 给了 `align-items:center`，`.bta-radio` 必须显式 `align-items:stretch` |
| 头栏一行塞不下（品牌 + ANC/Limiter/对时/读状态 + 使能，外加 输出/授权/刷新/状态/模块/连接） | 头栏是两行：`.bta-head-main`（品牌+全局+使能）/ `.bta-head-route`（音频路由 + 模块链路）；单项自然宽度合计远超 1280，一行必崩 |
| `setSinkId` 报 `NotSupportedError` 被当成"要授权" | 按规范它是"这路输出不存在/不可用"，和 `NotFoundError` 同类；只有 `SecurityError`/`NotAllowedError` 才是权限问题 |
| 控制台里调 store 显示"未初始化" | Vite dev 改过文件后组件用的是带 `?v=` 的模块，`import('/src/domain/x.ts')` 拿到的是**另一个实例**；先刷新页面再验 |
| 无头截图里 `NotAllowedError` | 脚本合成的 `.click()` 不是真实手势，自动播放被拦是正常现象，别当成 bug |
| 点「连接」没反应 / 状态写"浏览器不支持" | 用 IP 或 `file://` 打开了；Web Serial 只在 `http://localhost` 这类安全上下文里有 |
| 连接报 `NetworkError` | COM 被供应商上位机占着（串口独占），先关上位机 |
| 改了 `CDC` 表里的 pt 就不通 | 0x2001/0x2003 实机是 pt=1、0x3017 是 4，跟规范不一致但模块只认实机值 |
| 分不清页面上哪些是真实发生的 | 这就是模拟被全删的原因。**别再往这页加假设备/假电量/假播放状态**；没报就显示 `—` |
| 蓝牙使能按钮点了不回显 | 正常。按钮状态只认模块上报（`0x2002`/`0x2006`），不做本地乐观更新 |
| 把 `EnumBTConnectivityState` 当成 0/1/2 | proto 是 **1=ENABLED、2=DISABLED**，不是 INITIALIZATION 那套 |
| 点扫描没反应 | 先看提示行的回执：模块蓝牙关着时 `0x0012` 回 `REJECTED(2)`。连上 ≠ 蓝牙已使能 |
| `0x3018` 解析出 0 台设备 | id 列表是 **packed** 编码（`12 01 01` 一个 LEN 里塞多条 varint），用 `pbRepeated()` 解，别直接取 `m[2]` 的数字 |
| 页面卡住 / 报 `WritableStream is locked` | 多个 `send()` 并发 `getWriter()`。`serialLink` 内部有 `writeChain` 排队，发帧一律走 `send()` |
| RSSI 显示成 18 亿 / 0 | 负数 int32 是 10 字节补码，`pbDecode` 只留低 32 位，取值用 `pbInt32()` |
| `0x3016` 里的设备状态读到 0 | 模块把 `device_state` 放在**字段 5**，供应商上位机的 proto 错位到 6（读出来永远是 NULL）。别照抄他们的字段号 |

---

## 11. 代码风格

- 注释、UI 文案：**中文**；标识符：英文。数字与英文标签沿用实物/报文原名（如 `EIPowerStatus`）。
- 组件函数导出用 `export function Xxx()`，不用 `default`（`App.tsx` 除外）。
- 不引入新依赖前先问；本项目刻意保持零 UI 库、单 CSS 文件。
- 一次性脚本（图像处理、校验）不要留在仓库里。

---

## 12. 待办（Next）

- [ ] WDCM 接真实 CAN 信号：充电档位（25W/10W/0）下发、NFC 检测触发、Phone As Key 握手判定
      —— 三项目前都是组件内 `useState`，届时建 `src/domain/wdcm.ts` 状态机替换
- [ ] **WCCM-BT 页真机联调**：模拟已全删，页面动作全部走 `serialLink`，但只在假串口上验过状态机。
      真机要逐条确认：蓝牙使能 `0x2001`、扫描 `0x0011`/取消 `0x0013`、配对 `0x0021`、连接 `0x0031`、
      断开 `0x0033`、挂载 `0x0041`、音量/静音 `0x2021`、ANC `0x2031`、Limiter `0x2041`；
      Trace 里能看到成对回执就算通。已确认 `0x3018` 只回 id 列表，名字/属性靠 `0x3015→0x3016`
      那组查询补（页面已自动发），真机上确认这组查询回包齐全
- [ ] **出声功能上台架实测**：本机只有 1 路输出，`audioout.ts` 全程是用假设备列表（4 路 `WCCM UAC Ch-x`）验的；
      真机要确认"四路各选一首 → 四台耳机是否各自出声"，并确认上位机运行时能不能同时占住 UAC（独占模式）
- [ ] 页面复审提过、尚未拍板的三项：Zone 占用标注、一键"全部断开 + 清空配对"、ANC/Limiter 的"上位机未实现"标记
- [ ] 确认 ANC / Limiter 两族报文（0x2031~0x2046）在真实模块上的实际编号——供应商上位机未实现，目前只有 SSRD 依据
- [ ] 接真实硬件：树莓派 GPIO（Windows）、LIN / CAN 收发
- [ ] WCCM Part Number / Serial Number 由真实 LIN 报文填充（目前预留 24 字符占位）
- [ ] `EIPowerStatus = ShutDown` 时是否强制 `Internal Power Level = 0`（待确认）
- [ ] Actual Power Level 的模拟策略确认（当前随机游走）
