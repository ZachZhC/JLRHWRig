/**
 * 音频下行播放（浏览器真实出声）—— 四条独立音轨
 *
 * 一个 Zone = 一个 <audio> 元素 = 一首歌 = 一路 Windows 输出，
 * 四路可以同时播不同内容，单独暂停/拖动互不影响。
 * 链路：本地音频文件 → <audio>(每路一个) → setSinkId() 绑定的那一路声卡
 *       → WCCM 的 UAC 通道 → 蓝牙耳机。
 *
 * Zone↔声卡绑定存 localStorage：第一次上台架要人耳确认哪一路对应哪个 Zone，之后不用再遍历。
 * 协议里没有 detach，所以释放一个 Zone 只能靠断开连接。
 */

export interface SinkInfo {
  id: string;
  label: string;
}

export interface SinkGroup {
  key: 'module' | 'other' | 'all';
  title: string;
  items: SinkInfo[];
}

/** Windows 默认/通信两个"角色副本"不是独立端点，是同一个设备的别名 */
const ROLE_ALIAS = /^(默认|通信|Default|Communications)\s*-\s*/i;

/** 从标签里取 USB 标识：`... (2b37:0104)` */
export function usbTagOf(label: string): string | null {
  const m = label.match(/\(([0-9a-f]{4}):([0-9a-f]{4})\)/i);
  return m ? `${m[1].toLowerCase()}:${m[2].toLowerCase()}` : null;
}

/**
 * 把系统输出分成「模块的 UAC 端点」和「其他」两组。
 * usbTag 来自串口口的 getInfo（模块是复合设备，CDC 与 UAC 共用 VID:PID）；
 * 没连模块时退化成"带 USB 标识的都算一类"，只是分组标题不写 WCCM。
 */
export function groupSinks(devices: SinkInfo[], usbTag: string | null): SinkGroup[] {
  const real = devices.filter((d) => d.id && !ROLE_ALIAS.test(d.label));
  if (!real.length) return [];
  let module = usbTag ? real.filter((d) => usbTagOf(d.label) === usbTag) : [];
  let exact = module.length > 0;
  if (!module.length) {
    // 串口报的 VID:PID 和 UAC 标签对不上时，退回"带 USB 标识的都算一类"
    module = real.filter((d) => usbTagOf(d.label) !== null);
    exact = false;
  }
  if (!module.length) return [{ key: 'all', title: '系统输出', items: real }];
  const groups: SinkGroup[] = [
    {
      key: 'module',
      title: exact ? `WCCM 输出（USB ${usbTag}）` : 'USB 输出',
      items: module,
    },
  ];
  const other = real.filter((d) => !module.includes(d));
  if (other.length) groups.push({ key: 'other', title: '其他输出（非 WCCM）', items: other });
  return groups;
}

export type AudioTone = 'idle' | 'ok' | 'warn' | 'bad';

export interface LaneView {
  ch: number;
  fileName: string;
  hasFile: boolean;
  playing: boolean;
  position: number;
  duration: number;
}

export interface AudioOutSnapshot {
  /** 系统里的输出设备，未授权时 label 会是空字符串 */
  devices: SinkInfo[];
  /** Ch0–Ch3 → deviceId */
  zoneSink: Record<number, string>;
  /** 四条独立音轨，下标即 Ch 号 */
  lanes: LaneView[];
  /** 拿到真实 deviceId 才能切换输出；未授权时是 false */
  canRoute: boolean;
  status: string;
  tone: AudioTone;
  _rev: number;
}

const LS_KEY = 'bta.zoneSink.v1';
const CHS = [0, 1, 2, 3];
/** 四路同时出声时，默认满音量容易炸耳朵 */
const LANE_VOLUME = 0.8;

function sinkErrorHint(name: string) {
  if (name === 'NotFoundError' || name === 'NotSupportedError') return '设备不在了，点「刷新」';
  if (name === 'SecurityError' || name === 'NotAllowedError') return '需要 http 打开并授权麦克风';
  if (name === 'AbortError') return '可能被上位机占用，或系统开了独占模式';
  return '';
}

function playFailMessage(name: string) {
  if (name === 'NotAllowedError') return '没认到真实点击，用鼠标或空格再按一次';
  if (name === 'AbortError') return '被后一次播放请求打断';
  return name;
}

function readZoneSink(): Record<number, string> {
  const out: Record<number, string> = { 0: '', 1: '', 2: '', 3: '' };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return out;
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const k of ['0', '1', '2', '3']) {
      if (typeof obj[k] === 'string') out[Number(k)] = obj[k];
    }
  } catch {
    /* 读不到就当没绑过 */
  }
  return out;
}

function newLane(ch: number): LaneView {
  return { ch, fileName: '', hasFile: false, playing: false, position: 0, duration: 0 };
}

class AudioOutStore {
  private rev = 0;
  private listeners = new Set<() => void>();
  private els: (HTMLAudioElement | null)[] = [null, null, null, null];
  private urls = ['', '', '', ''];
  private snap: AudioOutSnapshot = {
    devices: [],
    zoneSink: { 0: '', 1: '', 2: '', 3: '' },
    lanes: CHS.map(newLane),
    canRoute: false,
    status: '正在枚举输出设备…',
    tone: 'idle',
    _rev: 0,
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private notify() {
    this.snap = {
      ...this.snap,
      devices: [...this.snap.devices],
      zoneSink: { ...this.snap.zoneSink },
      lanes: this.snap.lanes.map((l) => ({ ...l })),
      _rev: ++this.rev,
    };
    this.listeners.forEach((fn) => fn());
  }

  private say(status: string, tone: AudioTone = 'idle') {
    this.snap.status = status;
    this.snap.tone = tone;
    this.notify();
  }

  private view(ch: number) {
    return this.snap.lanes[ch];
  }

  /** 页面挂载时调一次；切 Tab 不会停掉已经在放的四路声音 */
  init() {
    if (typeof window === 'undefined' || !document.createElement) return;
    if (!navigator.mediaDevices?.enumerateDevices) {
      this.say('浏览器不支持设备枚举，请用 http 打开', 'bad');
      return;
    }
    if (!this.els[0]) {
      this.snap.zoneSink = readZoneSink();
      CHS.forEach((ch) => this.createLane(ch));
      navigator.mediaDevices.addEventListener?.('devicechange', () => void this.refresh());
    }
    void this.refresh();
  }

  private createLane(ch: number) {
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.volume = LANE_VOLUME;
    el.addEventListener('loadedmetadata', () => {
      this.view(ch).duration = Number.isFinite(el.duration) ? el.duration : 0;
      this.notify();
    });
    el.addEventListener('timeupdate', () => {
      this.view(ch).position = el.currentTime;
      this.notify();
    });
    el.addEventListener('play', () => {
      this.view(ch).playing = true;
      this.notify();
    });
    el.addEventListener('pause', () => {
      this.view(ch).playing = false;
      this.notify();
    });
    el.addEventListener('ended', () => {
      this.view(ch).playing = false;
      this.say(`Ch${ch} 播完`, 'idle');
    });
    el.addEventListener('error', () => {
      if (this.urls[ch]) this.say(`Ch${ch} 文件解码失败或格式不支持`, 'bad');
    });
    this.els[ch] = el;
  }

  /** 列出输出设备；未授权时只有空标签，提示点「授权」 */
  async refresh() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const devices = all
        .filter((d) => d.kind === 'audiooutput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `输出 ${i + 1}（未授权，名称隐藏）` }));
      this.snap.devices = devices;
      this.snap.canRoute = devices.some((d) => d.id);
      this.snap.zoneSink = readZoneSink();
      const ids = new Set(devices.map((d) => d.id).filter(Boolean));
      const stale = CHS.filter((ch) => this.snap.zoneSink[ch] && !ids.has(this.snap.zoneSink[ch]));
      const unbound = CHS.filter((ch) => this.snap.zoneSink[ch] && ids.has(this.snap.zoneSink[ch]));
      if (stale.length) {
        this.say(`Ch${stale.join('/')} 声卡不在了 · 点刷新`, 'warn');
      } else if (!this.snap.canRoute) {
        this.say('设备名被隐藏，点「授权」允许麦克风', 'warn');
      } else if (!unbound.length) {
        this.say(`找到 ${devices.length} 路输出，四路都还没绑声卡`, 'warn');
      } else {
        this.say(`找到 ${devices.length} 路输出，已绑 Ch${unbound.join('/Ch')}`, 'ok');
      }
    } catch (e) {
      this.say(`枚举设备失败：${(e as Error).name}`, 'bad');
    }
  }

  /** 输出设备的名字要一次麦克风授权才给，授权完立刻关掉采集 */
  async grant() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.say('授权不可用，请用 http://localhost 打开', 'bad');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await this.refresh();
    } catch (e) {
      const name = (e as Error).name;
      this.say(name === 'NotAllowedError' ? '授权被拒绝，地址栏右侧可以重新允许' : `授权失败：${name}`, 'bad');
    }
  }

  loadFile(ch: number, file: File) {
    const el = this.els[ch];
    if (!el) return;
    if (this.urls[ch]) URL.revokeObjectURL(this.urls[ch]);
    this.urls[ch] = URL.createObjectURL(file);
    el.src = this.urls[ch];
    el.load();
    const v = this.view(ch);
    v.fileName = file.name;
    v.hasFile = true;
    v.position = 0;
    v.duration = 0;
    v.playing = false;
    this.say(`Ch${ch} 已载入 ${file.name}`, 'ok');
  }

  private applySink(ch: number, id: string) {
    const el = this.els[ch];
    if (!el) return;
    if (typeof el.setSinkId !== 'function') {
      this.say('浏览器不支持切换输出设备', 'bad');
      return;
    }
    el.setSinkId(id).catch((e: Error) => {
      const hint = sinkErrorHint(e.name);
      this.say(`Ch${ch} 切输出失败：${hint || e.name}`, 'bad');
    });
  }

  /** 把某个 Zone 绑到哪一路声卡，立刻作用到那一条音轨 */
  bindZone(ch: number, deviceId: string) {
    this.snap.zoneSink[ch] = deviceId;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(this.snap.zoneSink));
    } catch {
      this.say('绑定关系存不下（localStorage 被禁）', 'warn');
    }
    if (deviceId) this.applySink(ch, deviceId);
    this.notify();
  }

  toggle(ch: number) {
    const el = this.els[ch];
    if (!el) return;
    if (!this.snap.lanes[ch].hasFile) {
      this.say(`Ch${ch} 还没选文件`, 'warn');
      return;
    }
    if (el.paused) {
      if (!this.snap.zoneSink[ch]) this.say(`Ch${ch} 没绑声卡，走系统默认输出`, 'warn');
      void el
        .play()
        .then(() => this.say(`Ch${ch} 播放中`, 'ok'))
        .catch((e: Error) => this.say(`Ch${ch} 播放失败：${playFailMessage(e.name)}`, 'bad'));
    } else {
      el.pause();
      this.say(`Ch${ch} 暂停`, 'idle');
    }
  }

  stop(ch: number) {
    const el = this.els[ch];
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    this.view(ch).position = 0;
    this.say(`Ch${ch} 停止`, 'idle');
  }

  seek(ch: number, seconds: number) {
    const el = this.els[ch];
    const lane = this.snap.lanes[ch];
    if (!el || !lane.hasFile) return;
    el.currentTime = Math.max(0, Math.min(lane.duration, seconds));
    lane.position = el.currentTime;
    this.notify();
  }
}

export const audioOut = new AudioOutStore();
