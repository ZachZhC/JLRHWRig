/**
 * Web Serial 链路（真机 CDC）
 *
 * 前提：页面必须走 http://localhost（安全上下文），浏览器用 Edge / Chrome；
 * 串口是独占的 —— 上位机开着的时候这里打不开 COM，必须先关掉上位机。
 * 打开时会弹一次"选择串口"对话框，选完浏览器会记住授权，刷新页面可以直接重连。
 *
 * 只负责"把帧收发出来"，报文语义都交给 cdc.ts 和 btaudio.ts。
 */

import {
  BODY_N1,
  BODY_N2,
  CDC,
  CdcMsg,
  SEQ_TX_START,
  decodeFrames,
  encodeFrame,
  pbInt,
} from './cdc';

interface PortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}

interface SerialLike {
  requestPort(options?: unknown): Promise<PortLike>;
  getPorts(): Promise<PortLike[]>;
}

export type LinkState = 'unsupported' | 'idle' | 'opening' | 'open' | 'error';

/** 模块 USB 的 VID:PID（`hhhh:hhhh`），用来在声卡列表里认出它自己的 UAC 端点 */
export interface UsbTag {
  text: string;
}

export interface LinkSnapshot {
  state: LinkState;
  note: string;
  rx: number;
  tx: number;
  bad: number;
  usb: UsbTag | null;
  _rev: number;
}

const EMPTY = new Uint8Array(0);
/** USB CDC 不看波特率，填一个合法值即可 */
const BAUD = 115200;

function serialApi(): SerialLike | null {
  const nav = navigator as unknown as { serial?: SerialLike };
  return nav.serial && typeof nav.serial.requestPort === 'function' ? nav.serial : null;
}

function openErrorText(name: string): string {
  if (name === 'NotFoundError') return '没有选串口（对话框被关掉了）';
  if (name === 'InvalidStateError') return '这个串口已经被页面打开了';
  if (name === 'SecurityError') return '浏览器拦了串口权限，需要真实点击「连接」';
  if (name === 'NetworkError' || name === 'UnknownError') return '打不开：多半是上位机还占着这个 COM，先关掉上位机';
  return name;
}

class SerialLink {
  private rev = 0;
  private listeners = new Set<() => void>();
  private snap: LinkSnapshot = { state: 'idle', note: '', rx: 0, tx: 0, bad: 0, usb: null, _rev: 0 };
  private port: PortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private loopDone: Promise<void> | null = null;
  private live = false;
  private seq = SEQ_TX_START;
  /** 写串口必须排队：同一个 WritableStream 同时 getWriter 会抛 "stream is locked" */
  private writeChain: Promise<unknown> = Promise.resolve();

  /** 每收到一帧回调一次（TX 也会回调，方便统一落进 Trace） */
  onFrame: ((m: CdcMsg, dir: 'TX' | 'RX') => void) | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): LinkSnapshot => this.snap;

  get supported(): boolean {
    return typeof navigator !== 'undefined' && serialApi() !== null;
  }

  private notify() {
    this.snap = { ...this.snap, _rev: ++this.rev };
    this.listeners.forEach((fn) => fn());
  }

  private set(state: LinkState, note = '') {
    this.snap.state = state;
    this.snap.note = note;
    this.notify();
  }

  /** 弹一次授权对话框选串口；已授权过的口在刷新后也能直接给这里 */
  async connect(): Promise<boolean> {
    const api = serialApi();
    if (!api) {
      this.set('unsupported', '当前浏览器没有串口能力，请用 Edge/Chrome 走 http://localhost');
      return false;
    }
    if (this.live) return true;
    this.set('opening', 'Selecting port…');
    let port: PortLike;
    try {
      port = await api.requestPort();
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'NotFoundError') this.set('idle', 'No port selected');
      else this.set('error', openErrorText(name));
      return false;
    }
    return this.attach(port);
  }

  /** 不弹框，直接用上次授权过的口（页面刷新后用） */
  async resume(): Promise<boolean> {
    const api = serialApi();
    if (!api || this.live) return false;
    const ports = await api.getPorts().catch(() => []);
    if (!ports.length) return false;
    return this.attach(ports[0]);
  }

  private async attach(port: PortLike): Promise<boolean> {
    try {
      await port.open({ baudRate: BAUD });
    } catch (e) {
      this.set('error', openErrorText((e as Error).name));
      return false;
    }
    this.port = port;
    this.live = true;
    this.seq = SEQ_TX_START;
    const info = port.getInfo?.();
    const vid = info?.usbVendorId;
    const pid = info?.usbProductId;
    this.snap.usb =
      vid != null && pid != null
        ? { text: `${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')}` }
        : null;
    this.set('open', 'Connected');
    this.loopDone = this.readLoop(port);
    return true;
  }

  async disconnect() {
    this.live = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* 还没开始读 */
    }
    await this.loopDone;
    this.loopDone = null;
    this.reader = null;
    const port = this.port;
    this.port = null;
    try {
      await port?.close();
    } catch {
      /* 拔线后 close 会抛，忽略 */
    }
    this.snap.usb = null;
    this.set('idle', 'Disconnected');
  }

  private emit(m: CdcMsg, dir: 'TX' | 'RX') {
    this.onFrame?.(m, dir);
  }

  private async readLoop(port: PortLike) {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    this.reader = reader;
    let buf: Uint8Array = new Uint8Array(0);
    try {
      while (this.live) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        const merged = new Uint8Array(buf.length + value.length);
        merged.set(buf);
        merged.set(value, buf.length);
        buf = merged;
        const r = decodeFrames(buf);
        buf = r.rest;
        this.snap.bad += r.bad;
        if (r.frames.length) this.snap.rx += r.frames.length;
        for (const f of r.frames) this.emit(f, 'RX');
        // 噪声卡住时别让缓冲区无限长大，留住尾巴里可能的半个帧头
        if (buf.length > 8192) buf = buf.slice(buf.length - 128);
        if (r.frames.length || r.bad) this.notify();
      }
    } catch (e) {
      if (this.live) this.set('error', `读串口失败：${(e as Error).name || e}`);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
      if (this.live) {
        // 没走 disconnect 就退出了 = 线被拔了
        this.live = false;
        this.reader = null;
        this.port = null;
        this.set('error', '串口断开了（模块没响应或线被拔了）');
      }
    }
  }

  /** 按 CDC 表里的编号发一帧；返回 false 表示当前没连上 */
  async send(key: keyof typeof CDC, payload: Uint8Array = EMPTY): Promise<boolean> {
    const port = this.port;
    if (!this.live || !port?.writable) {
      this.snap.note = 'Module not connected';
      this.notify();
      return false;
    }
    const def = CDC[key];
    const seq = this.seq;
    // 上位机的 seq 是奇数递增（3,5,7…），模块回偶数
    this.seq = this.seq >= 253 ? SEQ_TX_START : this.seq + 2;
    const msg: CdcMsg = {
      seq,
      pt: def.pt,
      msgId: def.msgId,
      mt: def.mt,
      n1: BODY_N1,
      n2: BODY_N2,
      payload,
      crcOk: true,
    };
    const bytes = encodeFrame(msg);
    const writable = port.writable;
    const job = this.writeChain.then(async () => {
      const writer = writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        try {
          writer.releaseLock();
        } catch {
          /* ignore */
        }
      }
    });
    this.writeChain = job.catch(() => undefined);
    try {
      await job;
    } catch (e) {
      this.snap.note = `写串口失败：${(e as Error).name || e}`;
      this.notify();
      return false;
    }
    this.snap.tx += 1;
    this.snap.note = 'Connected';
    this.emit(msg, 'TX');
    this.notify();
    return true;
  }

  /** 对时：utc 秒 + 纳秒 + 本地秒（跟供应商上位机同格式） */
  async syncTime() {
    const now = Date.now();
    const utc = Math.floor(now / 1000);
    const nanos = (now % 1000) * 1e6;
    const local = utc - new Date().getTimezoneOffset() * 60;
    await this.send(
      'timeSet',
      Uint8Array.from([...pbInt(1, utc), ...pbInt(2, nanos), ...pbInt(3, local)]),
    );
  }

  /** 刚连上时的三步握手（照抄上位机行为）：对时 → 读蓝牙状态 → 读已配对列表 */
  async handshake() {
    await this.syncTime();
    await this.send('sysConnGet');
    await this.send('deviceListGet');
  }
}

export const serialLink = new SerialLink();