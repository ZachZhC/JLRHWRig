/**
 * CWCM LIN 链路（经 BMCLI Web）
 *
 * 台架上 XL2 作为 LIN 主节点：
 *   - 充电中 = 持续发 0x26 并读 0x27（WCCM-only 周期，默认 70 ms 对齐 Normal_L5）
 *   - 充电结束 = 发 0x3C 休眠指令（NAD 0x00，classic 校验和）
 *
 * 页面上的所有状态都来自这里，没有模拟兜底；通道没开就显示未连接。
 */
import {
  BACKLIGHT_FAULT,
  EL_POWER_STATUS,
  POWER_MODE_LIN,
  WCCM_REQ_ID,
  WCCM_RES_ID,
  WccmIdentity,
  WccmReqState,
  WccmResFrame,
  backlightPercent,
  batVolt,
  createIdentity,
  decodeWccmRes,
  defaultReqState,
  encodeWccmReq,
  ingestWccmRes,
  type ElPowerStatus,
} from './cwcm';

/** bench 里的逻辑网络名，绑到 XL2 的 LIN 口后可直接用 */
export const WCCM_CHANNEL = 'cwcm-lin';

/** LIN 休眠指令：主请求帧 0x3C，首字节 0x00（NAD 0x00 广播休眠） */
export const SLEEP_FRAME_ID = 0x3c;
const SLEEP_DATA = '00 00 00 00 00 00 00 00';

const API = '/api/v1';
const CYCLE_MS = 70;
const READ_TIMEOUT_MS = 200;
const WAKE_DELAY_MS = 150;
/** 停周期后等最后一次在途收发收敛（master-read 超时 200 ms）再发 0x3C */
const SETTLE_MS = 250;
const TRACE_MAX = 200;

type Json = any;

async function api(path: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(API + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status === 'error') {
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openErrorMessage(raw: string): string {
  if (/not currently enumerated/i.test(raw)) {
    return `${WCCM_CHANNEL} 未绑定 XL2 端口（设备到货后 bench init --channel=<SN/port>）`;
  }
  return raw;
}

/** LIN 主机侧失败（无从节点应答 / 总线超时）翻成中文，Trace 里直接能看懂 */
function transferErrorMessage(raw: string): string {
  if (/host-timeout|lin_transfer_failed/i.test(raw)) return '模块未应答（LIN 主机超时）';
  return raw;
}

function hex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** master-read 的返回体已实测：{ accepted, received, errors, data: "0000000000000000" } */
function extractFrameData(result: Json): Uint8Array | null {
  return toBytes(result?.data);
}

function toBytes(value: unknown): Uint8Array | null {
  if (typeof value === 'string') {
    const clean = value.replace(/[^0-9a-fA-F]/g, '');
    if (!clean || clean.length % 2 !== 0) return null;
    return Uint8Array.from(clean.match(/../g)!.map((pair) => parseInt(pair, 16)));
  }
  if (Array.isArray(value)) {
    const nums = value.filter((n): n is number => typeof n === 'number');
    return nums.length ? Uint8Array.from(nums) : null;
  }
  return null;
}

function printable(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '.');
}

function describeReq(req: WccmReqState): string {
  const intensity =
    req.backlightIntensity === BACKLIGHT_FAULT
      ? 'Fault(255) · 未下发 PWM'
      : `${req.backlightIntensity} · ${backlightPercent(req.backlightIntensity)}%`;
  const powerMode = POWER_MODE_LIN[req.powerModeLin] ?? `raw ${req.powerModeLin}`;
  return [
    `背光 ${req.backlightStatus ? 'ON' : 'OFF'} / ${intensity}`,
    `ElPower ${req.elPowerStatus}`,
    `限功率 ${req.limitedPowerMode ? 'True' : 'False'}`,
    `PB ${batVolt(req.pbBatVolt)}V · SPB ${batVolt(req.spbBatVolt)}V`,
    powerMode,
  ].join(' · ');
}

function describeRes(frame: WccmResFrame, errResp: boolean): string {
  const head = `Part "${printable(frame.partChunk)}"@${frame.partBlock} · Serial "${printable(frame.serialChunk)}"@${frame.serialBlock}`;
  return errResp ? `${head} · errResp=1` : head;
}

export type LinkState = 'idle' | 'connecting' | 'open' | 'error';

export interface LinkFrame {
  key: number;
  ts: number;
  dir: 'TX' | 'RX' | 'SYS';
  idText: string;
  name: string;
  detail: string;
  tone: 'tx' | 'rx' | 'warn' | 'info';
}

export interface CwcmSnapshot {
  link: LinkState;
  linkError: string | null;
  /** LIN 周期通讯中（= 充电正常） */
  running: boolean;
  /** 已发休眠帧 */
  sleeping: boolean;
  req: WccmReqState;
  partNo: string;
  serialNo: string;
  partComplete: boolean;
  serialComplete: boolean;
  errResp: boolean;
  tx: number;
  rx: number;
  misses: number;
  /** 最近一次实际下发的有效亮度；255 = Fault 时模块不下发 PWM，LED 维持这个值 */
  lastPwmIntensity: number;
  frames: LinkFrame[];
  _rev: number;
}

const INITIAL: CwcmSnapshot = {
  link: 'idle',
  linkError: null,
  running: false,
  sleeping: false,
  req: defaultReqState(),
  partNo: '',
  serialNo: '',
  partComplete: false,
  serialComplete: false,
  errResp: false,
  tx: 0,
  rx: 0,
  misses: 0,
  lastPwmIntensity: 254,
  frames: [],
  _rev: 0,
};

class CwcmLinkStore {
  private snapshot: CwcmSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private rev = 0;
  private frameKey = 0;
  private generation = 0;
  private timer: number | null = null;
  private identity: WccmIdentity = createIdentity();
  private failures = 0;
  private closing = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private notify(patch: Partial<CwcmSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, _rev: ++this.rev };
    this.listeners.forEach((listener) => listener());
  }

  private push(
    dir: LinkFrame['dir'],
    idText: string,
    name: string,
    detail: string,
    tone: LinkFrame['tone'],
  ) {
    const frames = [
      ...this.snapshot.frames,
      { key: ++this.frameKey, ts: Date.now(), dir, idText, name, detail, tone },
    ];
    if (frames.length > TRACE_MAX) frames.splice(0, frames.length - TRACE_MAX);
    this.notify({ frames });
  }

  async connect() {
    if (this.snapshot.link === 'open' || this.snapshot.link === 'connecting') return;
    this.notify({ link: 'connecting', linkError: null });
    try {
      await api('/channels', {
        method: 'POST',
        body: JSON.stringify({
          channel: WCCM_CHANNEL,
          mode: 'master',
          bitrate: '19200',
          pullup: '1k',
          power: 'off',
          lin_version: '2.1',
          checksum: 'enhanced',
        }),
      });
      this.failures = 0;
      this.notify({ link: 'open', linkError: null, tx: 0, rx: 0, misses: 0 });
      this.push('SYS', '—', 'LINK', `通道 ${WCCM_CHANNEL} 已打开（19.2 kbps · 主节点）`, 'info');
    } catch (error) {
      const message = openErrorMessage(errorText(error));
      this.notify({ link: 'error', linkError: message });
      this.push('SYS', '—', 'LINK', `打开失败：${message}`, 'warn');
    }
  }

  async disconnect() {
    if (this.closing) return;
    this.closing = true;
    try {
      await this.closeChannel();
    } finally {
      this.closing = false;
    }
  }

  private async closeChannel() {
    const wasRunning = this.snapshot.running;
    this.stopLoop();
    if (this.snapshot.link !== 'open') {
      this.notify({ link: 'idle', linkError: null, running: false, sleeping: false });
      return;
    }
    if (wasRunning) {
      this.notify({ running: false });
      await this.settle();
      try {
        await this.sendFrame(SLEEP_FRAME_ID, 'master-write', SLEEP_DATA, 'classic');
        this.push('TX', '0x3C', 'MasterReq · Sleep', '关闭通道前休眠（NAD 0x00，classic 校验和）', 'tx');
      } catch (error) {
        this.push('SYS', '0x3C', 'MasterReq · Sleep', `休眠帧发送失败：${transferErrorMessage(errorText(error))}`, 'warn');
      }
    }
    try {
      await api(`/channels/${encodeURIComponent(WCCM_CHANNEL)}`, { method: 'DELETE' });
      this.notify({ link: 'idle', linkError: null, running: false, sleeping: false });
      this.push('SYS', '—', 'LINK', '通道已关闭', 'info');
    } catch (error) {
      const message = errorText(error);
      this.notify({ link: 'error', linkError: message, running: false });
      this.push('SYS', '—', 'LINK', `关闭失败：${message}`, 'warn');
    }
  }

  /**
   * 充电开关：ON = 主节点先发唤醒脉冲，再按调度表开始 0x26/0x27；
   * OFF = 发 0x3C 休眠指令，模块休眠后停止充电。
   * 每次 ON 都发唤醒脉冲：LIN 从节点在总线静默后会自动休眠，不能只看本地是否发过 0x3C。
   */
  async setCharging(on: boolean) {
    if (this.closing || this.snapshot.link !== 'open' || on === this.snapshot.running) return;
    if (on) {
      this.failures = 0;
      this.notify({ running: true, sleeping: false });
      const gen = ++this.generation;
      try {
        await this.sendFrame(0, 'sync-break', undefined, 'enhanced');
        if (gen === this.generation) this.push('TX', '—', 'Wake-up', '唤醒脉冲（sync-break，主节点开始调度）', 'tx');
      } catch (error) {
        if (gen === this.generation) this.push('SYS', '—', 'Wake-up', `唤醒脉冲失败：${transferErrorMessage(errorText(error))}`, 'warn');
      }
      if (gen !== this.generation || !this.snapshot.running) return;
      this.push('SYS', '—', 'WAKE', '按调度表开始通讯（等待 150 ms）', 'info');
      this.timer = window.setTimeout(() => this.tick(gen), WAKE_DELAY_MS);
      return;
    }
    this.stopLoop();
    this.notify({ running: false });
    const gen = this.generation;
    await this.settle();
    // 等待期间又被拨回 ON：这次 OFF 作废，别把新会话睡掉
    if (gen !== this.generation || this.snapshot.running) return;
    try {
      await this.sendFrame(SLEEP_FRAME_ID, 'master-write', SLEEP_DATA, 'classic');
      this.notify({ sleeping: true });
      this.push('TX', '0x3C', 'MasterReq · Sleep', '休眠指令（NAD 0x00，classic 校验和）', 'tx');
    } catch (error) {
      this.push('SYS', '0x3C', 'MasterReq · Sleep', `休眠帧发送失败：${transferErrorMessage(errorText(error))}`, 'warn');
    }
  }

  setBacklightStatus(value: 0 | 1) {
    this.patchReq({ backlightStatus: value });
  }

  setBacklightIntensity(value: number) {
    const intensity = Math.max(0, Math.min(255, Math.round(value)));
    // 供应商流程图：255 = Error Status，模块不下发 PWM，LED 停在上一档
    this.notify({
      req: { ...this.snapshot.req, backlightIntensity: intensity },
      ...(intensity === BACKLIGHT_FAULT ? {} : { lastPwmIntensity: intensity }),
    });
  }

  setElPowerStatus(value: ElPowerStatus) {
    this.patchReq({ elPowerStatus: value });
  }

  setLimitedPowerMode(value: 0 | 1) {
    this.patchReq({ limitedPowerMode: value });
  }

  clearFrames() {
    this.notify({ frames: [] });
  }

  private patchReq(patch: Partial<WccmReqState>) {
    this.notify({ req: { ...this.snapshot.req, ...patch } });
  }

  private sendFrame(
    id: number,
    type: 'master-write' | 'master-read' | 'sync-break',
    data: string | undefined,
    checksum: 'classic' | 'enhanced',
    timeout = 0,
  ) {
    return api('/messages', {
      method: 'POST',
      body: JSON.stringify({
        channel: WCCM_CHANNEL,
        id,
        type,
        ...(data ? { data } : {}),
        ...(type === 'sync-break' ? {} : { dlc: 8, checksum }),
        ...(timeout ? { timeout_ms: timeout } : {}),
      }),
    });
  }

  private stopLoop() {
    this.generation++;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * 等在途请求收敛：tick 里的 0x26/0x27 可能已经发出去，
   * 晚到的帧跟在 0x3C 后面会把模块又吵醒。
   */
  private settle() {
    return new Promise<void>((resolve) => window.setTimeout(resolve, SETTLE_MS));
  }

  private async tick(gen: number) {
    if (gen !== this.generation || !this.snapshot.running) return;
    const req = this.snapshot.req;
    try {
      await this.sendFrame(WCCM_REQ_ID, 'master-write', hex(encodeWccmReq(req)), 'enhanced');
      this.notify({ tx: this.snapshot.tx + 1 });
      this.push('TX', '0x26', 'WCCM_L15_Req_A', describeReq(req), 'tx');
      if (gen !== this.generation || !this.snapshot.running) return;

      const body = await this.sendFrame(WCCM_RES_ID, 'master-read', undefined, 'enhanced', READ_TIMEOUT_MS);
      const bytes = extractFrameData(body?.result);
      if (!bytes) {
        this.failures++;
        this.notify({ misses: this.snapshot.misses + 1 });
        this.push('RX', '0x27', 'WCCM_L15_Res_A', '无数据返回（模块未应答）', 'warn');
      } else {
        this.failures = 0;
        const frame = decodeWccmRes(bytes);
        const view = ingestWccmRes(this.identity, bytes);
        this.identity = view.identity;
        this.notify({
          rx: this.snapshot.rx + 1,
          partNo: view.partNo,
          serialNo: view.serialNo,
          partComplete: view.partComplete,
          serialComplete: view.serialComplete,
          errResp: view.identity.errResp,
        });
        this.push('RX', '0x27', 'WCCM_L15_Res_A', describeRes(frame, view.identity.errResp), 'rx');
      }
    } catch (error) {
      this.failures++;
      this.notify({ misses: this.snapshot.misses + 1 });
      this.push('SYS', '0x26/0x27', 'LIN 收发', `失败：${transferErrorMessage(errorText(error))}`, 'warn');
    }
    if (gen !== this.generation || !this.snapshot.running) return;
    const delay = this.failures >= 3 ? 500 : CYCLE_MS;
    this.timer = window.setTimeout(() => this.tick(gen), delay);
  }
}

export const cwcmLink = new CwcmLinkStore();

/** 供页面做选项渲染 */
export const EL_POWER_OPTIONS = EL_POWER_STATUS;