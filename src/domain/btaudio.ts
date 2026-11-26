/**
 * WCCM 蓝牙状态 —— 全部来自真实模块（Web Serial 那条 COM 口），没有任何模拟。
 *
 * 规则：页面上的每个动作只做一件事 —— 往串口发一帧；状态一律等模块上报
 * （Notify* 或 Set*Response）再改。模块没报的字段就显示 "—"，不猜。
 */

import {
  CdcMsg,
  pbDecode,
  pbInt,
  pbInt32,
  pbRepeated,
  pbText1,
  CDC,
  describePayload,
  nameOfMsg,
} from './cdc';
import { serialLink } from './serial';

export type DevState =
  | 'NULL'
  | 'NOTPAIRED'
  | 'DISCOVERING'
  | 'PAIRING'
  | 'PAIRED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTING'
  | 'DISCONNECTED'
  | 'UNPAIRING'
  | 'UNPAIRED'
  | 'FAULT';

export const DEV_STATE_CODE: Record<DevState, number> = {
  NULL: 0,
  NOTPAIRED: 1,
  DISCOVERING: 2,
  PAIRING: 3,
  PAIRED: 4,
  CONNECTING: 5,
  CONNECTED: 6,
  DISCONNECTING: 7,
  DISCONNECTED: 8,
  UNPAIRING: 9,
  UNPAIRED: 10,
  FAULT: 11,
};

const STATE_BY_CODE = new Map<number, DevState>(
  (Object.keys(DEV_STATE_CODE) as DevState[]).map((s) => [DEV_STATE_CODE[s], s]),
);

export type DiscoveryState = 'NULL' | 'DISCOVERING' | 'TIMEOUT' | 'CANCEL';

export const DISCOVERY_STATE_TEXT: Record<DiscoveryState, string> = {
  NULL: '未扫描',
  DISCOVERING: '扫描中',
  TIMEOUT: '扫描超时',
  CANCEL: '已取消',
};

const DISCOVERY_BY_CODE: Record<number, DiscoveryState> = {
  0: 'NULL',
  1: 'DISCOVERING',
  2: 'TIMEOUT',
  3: 'CANCEL',
};

/** EnumBTDeviceType */
export const DEVICE_TYPE: Record<number, string> = {
  0: 'NONE',
  1: 'HEADPHONE',
  2: 'GAMEPAD',
  3: 'KARAOKEMIC',
  4: 'STANDARDMIC',
  5: 'KEYBOARD',
  6: 'MOUSE',
  7: 'TOUCHPAD',
  8: 'OTHER',
};

export type AncState = 'OFF' | 'ON' | 'AMBIENT';
export type LimiterState = 'OFF' | 'ON';

export const ANC_CODE: Record<AncState, number> = { OFF: 1, ON: 2, AMBIENT: 3 };
export const LIMITER_CODE: Record<LimiterState, number> = { OFF: 1, ON: 2 };
const ANC_BY_CODE: Record<number, AncState> = { 1: 'OFF', 2: 'ON', 3: 'AMBIENT' };
const LIMITER_BY_CODE: Record<number, LimiterState> = { 1: 'OFF', 2: 'ON' };

export const VOLUME_MAX = 60;

export interface CdcFrame {
  id: number;
  ts: number;
  dir: 'TX' | 'RX';
  pt: number;
  msgId: number;
  mt: number;
  name: string;
  detail: string;
}

/** 模块上报的一台蓝牙设备 */
export interface BtaDevice {
  id: number;
  /** 模块上报的 friendly name；还没收到时为 `设备 id` */
  name: string;
  nameKnown: boolean;
  type: number;
  state: DevState;
  paired: boolean;
  /** 挂载到的 UAC 通道 0~3；null = 未挂载（模块没报） */
  ch: number | null;
  playing: boolean;
  /** 0–60；模块还没报音量时为 null */
  volume: number | null;
  muted: boolean;
  rssi: number | null;
  battery: number | null;
  latency: number | null;
}

/** Zone ↔ UAC 音频通道映射（EnumZoneID，Req01579573） */
export interface AudioZone {
  ch: number;
  zoneId: number;
  zoneName: string;
  seat: string;
}

export const ZONES: AudioZone[] = [
  { ch: 0, zoneId: 4, zoneName: 'PASSENGER', seat: '副驾' },
  { ch: 1, zoneId: 6, zoneName: 'REAR_RIGHT', seat: '右后' },
  { ch: 2, zoneId: 5, zoneName: 'REAR_LEFT', seat: '左后' },
  { ch: 3, zoneId: 7, zoneName: 'DRIVER', seat: '主驾' },
];

const CH_BY_ZONE_ID: Record<number, number> = { 4: 0, 6: 1, 5: 2, 7: 3 };
const MAX_FRAMES = 120;

/** 回执报文的中文名，用来在提示行显示"请求 → 结果" */
const RESP_LABEL: Record<number, string> = {
  0x2002: '蓝牙开关',
  0x2052: '对时',
  0x0012: '开始扫描',
  0x0014: '取消扫描',
  0x0022: '配对',
  0x0032: '连接',
  0x0034: '断开',
  0x0042: '挂载',
  0x0044: '取消配对',
  0x2022: '音量',
  0x2032: 'ANC',
  0x2042: '限幅器',
};

export interface BtaSnapshot {
  /** 模块上报的蓝牙开关；null = 还没读回来 */
  enabled: boolean | null;
  discovery: DiscoveryState;
  devices: BtaDevice[];
  /** 全局 ANC / 限幅器；null = 模块还没报 */
  anc: AncState | null;
  limiter: LimiterState | null;
  /** 最近一次下发/回执，一行中文 */
  note: string;
  frames: CdcFrame[];
}

function makeDevice(id: number): BtaDevice {
  return {
    id,
    name: `设备 ${id}`,
    nameKnown: false,
    type: 0,
    state: 'NULL',
    paired: false,
    ch: null,
    playing: false,
    volume: null,
    muted: false,
    rssi: null,
    battery: null,
    latency: null,
  };
}

function nameText(bytes: Uint8Array | undefined): string {
  if (!(bytes instanceof Uint8Array)) return '';
  return new TextDecoder().decode(bytes).replace(/\0+$/, '');
}

export class BtaController {
  private snap: BtaSnapshot = {
    enabled: null,
    discovery: 'NULL',
    devices: [],
    anc: null,
    limiter: null,
    note: '',
    frames: [],
  };
  private listeners = new Set<() => void>();
  private frameId = 1;

  // 必须是箭头函数字段，否则 useSyncExternalStore 调用时 this 会丢
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): BtaSnapshot => this.snap;

  private notify() {
    this.snap = {
      ...this.snap,
      devices: this.snap.devices.map((d) => ({ ...d })),
      frames: [...this.snap.frames],
    };
    this.listeners.forEach((fn) => fn());
  }

  private say(note: string) {
    this.snap.note = note;
    this.notify();
  }

  device(id: number): BtaDevice | undefined {
    return this.snap.devices.find((d) => d.id === id);
  }

  deviceAtZone(ch: number): BtaDevice | undefined {
    return this.snap.devices.find((d) => d.ch === ch);
  }

  private ensure(id: number): BtaDevice {
    let d = this.device(id);
    if (!d) {
      d = makeDevice(id);
      this.snap.devices.push(d);
    }
    return d;
  }

  /** 断链后清掉状态（报文留着，方便看最后几帧到底发生了什么） */
  reset() {
    this.snap = {
      enabled: null,
      discovery: 'NULL',
      devices: [],
      anc: null,
      limiter: null,
      note: '',
      frames: this.snap.frames,
    };
    this.notify();
  }

  /** 串口每来一帧调一次（TX/RX 都进 Trace） */
  ingest(m: CdcMsg, dir: 'TX' | 'RX') {
    const detail = describePayload(m.msgId, m.payload) + (m.crcOk ? '' : ' · CRC 校验失败');
    const entry: CdcFrame = {
      id: this.frameId++,
      ts: Date.now(),
      dir,
      pt: m.pt,
      msgId: m.msgId,
      mt: m.mt,
      name: nameOfMsg(m.msgId),
      detail,
    };
    this.snap.frames = [entry, ...this.snap.frames].slice(0, MAX_FRAMES);
    if (dir === 'RX') this.applyRx(m);
    this.notify();
  }

  /** 设备状态落库的统一入口（0x0020 上报 / 0x3016 查询共用） */
  private applyState(d: BtaDevice, state: DevState) {
    d.state = state;
    if (state === 'NOTPAIRED' || state === 'UNPAIRING' || state === 'UNPAIRED') {
      d.paired = false;
      d.ch = null;
      d.playing = false;
      d.battery = null;
      d.latency = null;
    } else if (state === 'PAIRED' || state === 'CONNECTED' || state === 'DISCONNECTING') {
      d.paired = true;
    }
    if (state === 'DISCONNECTED') {
      d.ch = null;
      d.playing = false;
    }
  }

  private applyRx(m: CdcMsg) {
    const p = pbDecode(m.payload);
    const v1 = pbText1(p, 1);
    const v2 = pbText1(p, 2);
    const v3 = pbText1(p, 3);
    // 动作回执：把模块的返回码原样显示出来（以前这里什么都不做，扫描被拒也看不出来）
    const label = RESP_LABEL[m.msgId];
    if (label) {
      const body = describePayload(m.msgId, m.payload);
      this.snap.note = `${label}请求 → ${body}`;
      if (/REJECTED/.test(body) && (m.msgId === 0x0012 || m.msgId === 0x0022 || m.msgId === 0x0032)) {
        this.snap.note += '（先确认蓝牙已使能、设备在上报列表里，再试一次）';
      }
      return;
    }
    switch (m.msgId) {
      case 0x2004:
      case 0x2006: {
        if (v1 === 1 || v1 === 2) {
          this.snap.enabled = v1 === 1;
          this.snap.note = this.snap.enabled ? '蓝牙已使能' : '蓝牙已关闭';
        }
        break;
      }
      case 0x0010: {
        const s = v1 !== null ? DISCOVERY_BY_CODE[v1] : undefined;
        if (s) {
          this.snap.discovery = s;
          this.snap.note = `扫描状态：${DISCOVERY_STATE_TEXT[s]}`;
        }
        break;
      }
      case 0x0016: {
        if (v1 === null) break;
        const d = this.ensure(v1);
        const nm = nameText(p[2]?.[0] as Uint8Array | undefined);
        if (nm) {
          d.name = nm;
          d.nameKnown = true;
        }
        d.type = v3 ?? 0;
        d.rssi = pbInt32(p, 4);
        if (d.state === 'NULL') d.state = 'NOTPAIRED';
        this.snap.note = `发现 ${d.name}（id ${d.id}）`;
        break;
      }
      case 0x0020: {
        if (v1 === null || v2 === null) break;
        const state = STATE_BY_CODE.get(v2);
        if (!state) break;
        this.applyState(this.ensure(v1), state);
        this.snap.note = `id=${v1} 状态 ${state}`;
        break;
      }
      // 0x3016：单台设备全部属性（重连后靠它拿回名字/类型/RSSI/状态）
      case 0x3016: {
        if (v1 === null) break;
        const d = this.ensure(v1);
        const nm = nameText(p[2]?.[0] as Uint8Array | undefined);
        if (nm) {
          d.name = nm;
          d.nameKnown = true;
        }
        if (v3 !== null) d.type = v3;
        const rssi = pbInt32(p, 4);
        if (rssi !== null) d.rssi = rssi;
        // 注意：模块把 device_state 放在字段 5（供应商上位机的 proto 错位到 6，别照抄）。
        // 这个查询值可能比 0x0020 通知慢一拍，只在还没有状态时用来打底。
        const st = STATE_BY_CODE.get(pbText1(p, 5) ?? -1);
        if (st && st !== 'NULL' && d.state === 'NULL') this.applyState(d, st);
        break;
      }
      case 0x1014: {
        if (v1 === null) break;
        const d = this.ensure(v1);
        d.ch = v2 !== null && v2 !== 0 ? CH_BY_ZONE_ID[v2] ?? null : null;
        break;
      }
      case 0x0040: {
        if (v1 === null) break;
        const d = this.ensure(v1);
        d.ch = v2 !== null && v2 !== 0 ? CH_BY_ZONE_ID[v2] ?? null : null;
        this.snap.note =
          d.ch === null ? `id=${v1} 已脱离 Zone` : `id=${v1} 挂到 Ch${d.ch}`;
        break;
      }
      case 0x3018: {
        const ids = pbRepeated(p, 2);
        for (const id of ids) {
          this.ensure(id).paired = true;
        }
        for (const d of this.snap.devices) {
          if (!ids.includes(d.id)) {
            d.paired = false;
            d.ch = null;
            d.playing = false;
          }
        }
        this.snap.note = `模块里有 ${ids.length} 台已配对设备`;
        // 照上位机的做法：拿到 id 列表立刻逐个查属性，否则名字/音量/电量全是空的
        this.refreshDevices(ids);
        break;
      }
      case 0x2026:
      case 0x2024: {
        if (v1 === null) break;
        const d = this.ensure(v1);
        d.muted = v2 === 1;
        if (v3 !== null) d.volume = v3;
        break;
      }
      case 0x2016: {
        if (v1 === null) break;
        const d = this.ensure(v1);
        if (v2 === 1) d.playing = true;
        else if (v2 === 2 || v2 === 3) d.playing = false;
        break;
      }
      case 0x2050: {
        if (v1 === null) break;
        this.ensure(v1).battery = v2;
        break;
      }
      // 0x2048：battery_status 2 = NOT_AVAILABLE，此时电量显示 —
      case 0x2048: {
        if (v1 === null) break;
        this.ensure(v1).battery = v2 === 2 ? null : v3;
        break;
      }
      case 0x2064:
      case 0x2062: {
        if (v1 === null) break;
        this.ensure(v1).latency = v2;
        break;
      }
      case 0x2036: {
        if (v2 !== null && ANC_BY_CODE[v2]) this.snap.anc = ANC_BY_CODE[v2];
        break;
      }
      case 0x2046: {
        if (v2 !== null && LIMITER_BY_CODE[v2]) this.snap.limiter = LIMITER_BY_CODE[v2];
        break;
      }
      default:
        break;
    }
  }

  private send(key: keyof typeof CDC, parts: number[] = []) {
    void serialLink.send(key, Uint8Array.from(parts));
  }

  /** 逐台补全属性：属性 / Zone / 音量 / 电量 / 延迟（上位机在每次 0x3018 之后都这么发） */
  private refreshDevices(ids: number[]) {
    for (const id of ids) {
      this.send('deviceAttrGet', pbInt(1, id));
      this.send('deviceZoneGet', pbInt(1, id));
      this.send('deviceVolumeGet', pbInt(1, id));
      this.send('deviceBatteryGet', pbInt(1, id));
      this.send('deviceLatencyGet', pbInt(1, id));
    }
  }

  /* ---------------- 下发动作：只发帧，状态等模块报 ---------------- */

  setEnabled(on: boolean) {
    // EnumBTConnectivityState：1=ENABLED 2=DISABLED
    this.send('sysConnSet', pbInt(1, on ? 1 : 2));
    this.say(on ? '已下发：使能蓝牙，等模块回执…' : '已下发：关闭蓝牙，等模块回执…');
  }

  readAll() {
    this.send('sysConnGet');
    this.send('deviceListGet');
    this.say('已下发：读蓝牙状态 + 已配对列表');
  }

  syncTime() {
    void serialLink.syncTime();
    this.say('已下发：对时');
  }

  startDiscovery() {
    // 上位机实测发的是空 payload（btradio_id 走默认 0）
    this.send('radioDisc');
    this.say(
      this.snap.enabled === false
        ? '已下发：开始扫描 —— 但蓝牙处于关闭状态，模块大概率回 REJECTED，先点「蓝牙使能」'
        : '已下发：开始扫描',
    );
  }

  cancelDiscovery() {
    this.send('radioDiscCancel');
    this.say('已下发：取消扫描');
  }

  pair(id: number) {
    this.send('pair', pbInt(1, id));
    this.say(`已下发：id=${id} 配对`);
  }

  unpair(id: number) {
    this.send('unpair', pbInt(1, id));
    this.say(`已下发：id=${id} 取消配对`);
  }

  connect(id: number) {
    this.send('connect', pbInt(1, id));
    this.say(`已下发：id=${id} 连接`);
  }

  disconnect(id: number) {
    this.send('disconnect', pbInt(1, id));
    this.say(`已下发：id=${id} 断开`);
  }

  attach(id: number, ch: number) {
    const zone = ZONES.find((z) => z.ch === ch);
    if (!zone) return;
    this.send('attach', [...pbInt(1, id), ...pbInt(2, zone.zoneId)]);
    this.say(`已下发：id=${id} 挂载到 Ch${ch}`);
  }

  setVolume(id: number, level: number) {
    const v = Math.max(0, Math.min(VOLUME_MAX, Math.round(level)));
    this.send('volumeSet', [...pbInt(1, id), ...pbInt(2, 3), ...pbInt(3, v)]);
    this.say(`已下发：id=${id} 音量 ${v}`);
  }

  setMuted(id: number, mute: boolean) {
    this.send('volumeSet', [...pbInt(1, id), ...pbInt(2, mute ? 4 : 5)]);
    this.say(`已下发：id=${id} ${mute ? '静音' : '取消静音'}`);
  }

  setAnc(state: AncState) {
    this.send('ancSet', [...pbInt(1, 0), ...pbInt(2, ANC_CODE[state])]);
    this.say(`已下发：ANC ${state}（btdevice_id=0 全局）`);
  }

  setLimiter(state: LimiterState) {
    this.send('limiterSet', [...pbInt(1, 0), ...pbInt(2, LIMITER_CODE[state])]);
    this.say(`已下发：限幅器 ${state}（btdevice_id=0 全局）`);
  }

  clearFrames() {
    this.snap.frames = [];
    this.notify();
  }
}

export const bta = new BtaController();