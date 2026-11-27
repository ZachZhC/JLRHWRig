/**
 * WCCM CDC 帧编解码（对真实模块用）
 *
 * 帧结构由供应商上位机 2026-11-24 的串口日志逐字节核对：
 *   A1 FF | seq(1) | 00 | pt(1) | msgId(2 LE) | mt(1) | n1(4 LE) | n2(4 LE) | len(2 LE) | payload | crc16(2 LE) | D0 FF
 * 总长 = 22 + len；CRC 是 CRC16-CCITT(FALSE)，覆盖 seq 到 payload 末尾（不含 A1FF / CRC / D0FF），小端存放。
 * n1/n2 上位机全程写 1/1，这里保持一致。
 */

export interface CdcMsg {
  seq: number;
  pt: number;
  msgId: number;
  mt: number;
  n1: number;
  n2: number;
  payload: Uint8Array;
  /** 收帧时校验过 CRC；发帧不用看 */
  crcOk: boolean;
}

export const SEQ_TX_START = 3;
export const BODY_N1 = 1;
export const BODY_N2 = 1;

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

export function encodeFrame(m: CdcMsg): Uint8Array {
  const len = m.payload.length;
  const out = new Uint8Array(22 + len);
  out[0] = 0xa1;
  out[1] = 0xff;
  out[2] = m.seq & 0xff;
  out[3] = 0x00;
  out[4] = m.pt & 0xff;
  out[5] = m.msgId & 0xff;
  out[6] = (m.msgId >> 8) & 0xff;
  out[7] = m.mt & 0xff;
  writeU32(out, 8, m.n1);
  writeU32(out, 12, m.n2);
  out[16] = len & 0xff;
  out[17] = (len >> 8) & 0xff;
  out.set(m.payload, 18);
  const crc = crc16(out.subarray(2, 18 + len));
  out[18 + len] = crc & 0xff;
  out[19 + len] = (crc >> 8) & 0xff;
  out[20 + len] = 0xd0;
  out[21 + len] = 0xff;
  return out;
}

/** 从流里尽量多解出整帧；返回没吃完的尾巴和丢掉的坏字节数 */
export function decodeFrames(buf: Uint8Array): { frames: CdcMsg[]; rest: Uint8Array; bad: number } {
  const frames: CdcMsg[] = [];
  let bad = 0;
  let i = 0;
  while (buf.length - i >= 2) {
    if (buf[i] !== 0xa1 || buf[i + 1] !== 0xff) {
      i += 1;
      bad += 1;
      continue;
    }
    if (buf.length - i < 18) break;
    const len = buf[i + 16] | (buf[i + 17] << 8);
    const total = 22 + len;
    if (buf.length - i < total) break;
    if (buf[i + 20 + len] !== 0xd0 || buf[i + 21 + len] !== 0xff) {
      i += 2;
      bad += 1;
      continue;
    }
    const stored = buf[i + 18 + len] | (buf[i + 19 + len] << 8);
    frames.push({
      seq: buf[i + 2],
      pt: buf[i + 4],
      msgId: buf[i + 5] | (buf[i + 6] << 8),
      mt: buf[i + 7],
      n1: readU32(buf, i + 8),
      n2: readU32(buf, i + 12),
      payload: buf.slice(i + 18, i + 18 + len),
      crcOk: crc16(buf.subarray(i + 2, i + 18 + len)) === stored,
    });
    i += total;
  }
  return { frames, rest: buf.slice(i), bad };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function writeU32(out: Uint8Array, at: number, v: number) {
  out[at] = v & 0xff;
  out[at + 1] = (v >>> 8) & 0xff;
  out[at + 2] = (v >>> 16) & 0xff;
  out[at + 3] = (v >>> 24) & 0xff;
}

function readU32(buf: Uint8Array, at: number) {
  return (buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16) | (buf[at + 3] << 24)) >>> 0;
}

/* ---------------- 最小 protobuf 读写 ---------------- */

export function pbVarint(v: number): number[] {
  const out: number[] = [];
  let n = v >>> 0;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}

/** 只做 varint 字段（本项目用到的报文全是 uint32/int32 枚举） */
export function pbInt(field: number, value: number): number[] {
  return pbVarint((field << 3) | 0).concat(pbVarint(value));
}

export function pbBytes(field: number, bytes: Uint8Array): number[] {
  return pbVarint((field << 3) | 2).concat(pbVarint(bytes.length), Array.from(bytes));
}

export function pbText(field: number, text: string): number[] {
  return pbBytes(field, new TextEncoder().encode(text));
}

export type PbValue = number | Uint8Array;
export type PbMap = Record<number, PbValue[]>;

/** 能解多少解多少，解不动的字段直接跳过，绝不抛异常 */
export function pbDecode(bytes: Uint8Array): PbMap {
  const out: PbMap = {};
  const push = (f: number, v: PbValue) => {
    (out[f] ??= []).push(v);
  };
  let i = 0;
  // 只保留低 32 位：协议里的字段都是 int32/uint32，负数（如 RSSI）在 wire 上是 10 字节补码，
  // 高位直接丢掉，交给 pbInt32 按有符号解释。
  const readVarint = () => {
    let shift = 0;
    let v = 0;
    while (i < bytes.length) {
      const b = bytes[i++];
      if (shift < 32) v = (v | ((b & 0x7f) << shift)) >>> 0;
      if (!(b & 0x80)) return v;
      shift += 7;
      if (shift > 63) return v;
    }
    return v;
  };
  while (i < bytes.length) {
    const tag = readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 0) break;
    if (wire === 0) push(field, readVarint());
    else if (wire === 2) {
      const len = readVarint();
      if (i + len > bytes.length) break;
      push(field, bytes.slice(i, i + len));
      i += len;
    } else if (wire === 5) {
      if (i + 4 > bytes.length) break;
      push(field, readU32(bytes, i));
      i += 4;
    } else if (wire === 1) {
      if (i + 8 > bytes.length) break;
      i += 8;
    } else break;
  }
  return out;
}

/** protobuf 字段 → 可读文本；未知字段按原始值列出来 */
export function pbText1(m: PbMap, field: number): number | null {
  const v = m[field]?.[0];
  return typeof v === 'number' ? v : null;
}

/** repeated 数值字段：proto3 默认 packed（一个 LEN 包住多条 varint），也兼容非 packed */
export function pbRepeated(m: PbMap, field: number): number[] {
  const out: number[] = [];
  for (const v of m[field] ?? []) {
    if (typeof v === 'number') {
      out.push(v);
      continue;
    }
    let i = 0;
    while (i < v.length) {
      let shift = 0;
      let n = 0;
      while (i < v.length) {
        const b = v[i++];
        if (shift < 32) n = (n | ((b & 0x7f) << shift)) >>> 0;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      out.push(n);
    }
  }
  return out;
}

/** int32 字段（RSSI 这类负数在 protobuf 里是 10 字节补码，低位已由 pbDecode 保留） */
export function pbInt32(m: PbMap, field: number): number | null {
  const v = m[field]?.[0];
  if (typeof v !== 'number') return null;
  return v >= 0x80000000 ? v - 0x100000000 : v;
}

function dump(m: PbMap): string {
  const parts: string[] = [];
  for (const k of Object.keys(m)) {
    const f = Number(k);
    for (const v of m[f]) {
      if (typeof v === 'number') parts.push(`f${f}=${v}`);
      else {
        const txt = new TextDecoder().decode(v);
        const printable = v.length > 0 && /^[\x20-\x7e]*$/.test(txt);
        parts.push(printable ? `f${f}="${txt}"` : `f${f}=0x${toHex(v)}`);
      }
    }
  }
  return parts.length ? parts.join(' ') : '(empty payload)';
}

const DISCOVERY_TEXT: Record<number, string> = {
  0: 'NULL',
  1: 'DISCOVERING',
  2: 'DISCOVERYTIMEOUT',
  3: 'DISCOVERYCANCEL',
};

const CONN_TEXT: Record<number, string> = { 0: 'NULL', 1: 'ENABLED', 2: 'DISABLED' };
const BT_STATE_TEXT: Record<number, string> = {
  0: 'NULL',
  1: 'NOTPAIRED',
  2: 'DISCOVERING',
  3: 'PAIRING',
  4: 'PAIRED',
  5: 'CONNECTING',
  6: 'CONNECTED',
  7: 'DISCONNECTING',
  8: 'DISCONNECTED',
  9: 'UNPAIRING',
  10: 'UNPAIRED',
  11: 'FAULT',
};
const ANC_TEXT: Record<number, string> = { 0: 'NULL', 1: 'OFF', 2: 'ON', 3: 'AMBIENT' };
const LIMITER_TEXT: Record<number, string> = { 0: 'NULL', 1: 'OFF', 2: 'ON' };
const MUTE_TEXT: Record<number, string> = { 0: 'NULL', 1: 'ENABLED', 2: 'DISABLED' };
const MEDIA_TEXT: Record<number, string> = {
  0: 'NULL',
  1: 'PLAY',
  2: 'PAUSE',
  3: 'STOP',
  4: 'NEXT_TRACK',
  5: 'PREVIOUS_TRACK',
  6: 'FORWARD',
  7: 'REWIND',
  12: 'SKIP_FORWARD',
  13: 'SKIP_BACKWARD',
};
const DEVICE_TYPE_TEXT: Record<number, string> = {
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

/** 各 Request 的返回码枚举（SSRD 8.x，Enum*ReturnValue） */
const RET: Record<string, string[]> = {
  conn: ['NULL', 'ACCEPTED', 'REJECTED'],
  timer: ['NULL', 'ACCEPTED', 'REJECTED'],
  disc: ['NULL', 'ACCEPTED', 'REJECTED', 'REJECTED_BLOCKED', 'REJECTED_PAIRED', 'REJECTED_MAXNUMOFDEVICE'],
  discCancel: ['NULL', 'ACCEPTED', 'REJECTED', 'REJECTED_NOT_DISCOVERING'],
  pair: ['NULL', 'ACCEPTED', 'REJECTED', 'REJECTED_BLOCKED', 'REJECTED_PAIRED', 'REJECTED_MAXNUMOFDEVICE', 'REJECTED_MAXNUMOFDEVICETYPE'],
  connect: ['NULL', 'ACCEPTED', 'REJECTED', 'REJECTED_NOT_PAIRED', 'REJECTED_CONNECTED', 'REJECTED_NOT_AVAILABLE', 'REJECTED_FORGET_DISCOVER_PAIR', 'REJECTED_DISCONNECT_ANY_N_FORGET_DISCOVER_PAIR', 'REJECTED_DISCONNECT_ANY_N_CONNECT'],
  attach: ['NULL', 'ACCEPTED', 'REJECTED', 'REJECTED_NOT_PAIRED'],
  unpair: ['NULL', 'ACCEPTED', 'REJECTED', 'REJECTED_NOT_PAIRED', 'REJECTED_CONNECTED'],
  disconnect: ['NULL', 'ACCEPTED', 'REJECTED', 'REJECTED_NOT_PAIRED', 'REJECTED_NOT_CONNECTED'],
  volume: ['NULL', 'ACCEPTED', 'REJECTED'],
  anc: ['NULL', 'ACCEPTED', 'REJECTED'],
  limiter: ['NULL', 'ACCEPTED', 'REJECTED'],
};

function nameOf(map: Record<number, string>, v: number | null): string {
  if (v === null) return '?';
  return map[v] ? `${map[v]}(${v})` : String(v);
}

function retName(kind: keyof typeof RET, v: number | null): string {
  if (v === null) return '?';
  return RET[kind][v] ? `${RET[kind][v]}(${v})` : String(v);
}

function decodeName(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).replace(/\0+$/, '');
}

/** 按报文号把 payload 翻成能读的一行；认不出的报文退回字段直译 */
export function describePayload(msgId: number, payload: Uint8Array): string {
  if (!payload.length) return '(empty payload)';
  const m = pbDecode(payload);
  const v1 = pbText1(m, 1);
  const v2 = pbText1(m, 2);
  const v3 = pbText1(m, 3);
  switch (msgId) {
    case 0x2001:
    case 0x2004:
    case 0x2006:
      return `btconnectivity_state=${nameOf(CONN_TEXT, v1)}`;
    case 0x2002:
      return `btconn_return_value=${retName('conn', v1)}`;
    case 0x2051:
    case 0x2056:
      return `utc=${v1}s nanos=${v2} local=${v3}s`;
    case 0x2052:
      return `awcstimer_return_value=${retName('timer', v1)}`;
    case 0x0010:
      return `btdevice_discovery_state=${nameOf(DISCOVERY_TEXT, v1)}`;
    case 0x0012:
      return `btdiscovery_return_value=${retName('disc', v1)}`;
    case 0x0014:
      return `btdiscovery_cancel_return_value=${retName('discCancel', v1)}`;
    case 0x0016: {
      const nb = m[2]?.[0];
      return `id=${v1} name="${nb instanceof Uint8Array ? decodeName(nb) : '?'}" type=${nameOf(DEVICE_TYPE_TEXT, v3)} rssi=${pbInt32(m, 4)}`;
    }
    case 0x3016: {
      const nb = m[2]?.[0];
      return `id=${v1} name="${nb instanceof Uint8Array ? decodeName(nb) : '?'}" type=${nameOf(DEVICE_TYPE_TEXT, v3)} rssi=${pbInt32(m, 4)} state=${nameOf(BT_STATE_TEXT, pbText1(m, 5))}`;
    }
    case 0x0020:
      return `id=${v1} state=${nameOf(BT_STATE_TEXT, v2)}`;
    case 0x0040:
      return `id=${v1} zone_id=${v2}`;
    case 0x0022:
      return `id=${v1} btpair_return_value=${retName('pair', v2)}`;
    case 0x0032:
      return `id=${v1} btconnect_return_value=${retName('connect', v2)}`;
    case 0x0034:
      return `id=${v1} btdisconnect_return_value=${retName('disconnect', v2)}`;
    case 0x0042:
      return `id=${v1} btattach_return_value=${retName('attach', v2)}`;
    case 0x0044:
      return `id=${v1} btun_pair_return_value=${retName('unpair', v2)}`;
    case 0x2022:
      return `id=${v1} btdevice_volume_return_value=${retName('volume', v2)}`;
    case 0x2032:
      return `id=${v1} btdevice_anc_return_value=${retName('anc', v2)}`;
    case 0x2042:
      return `id=${v1} limiter_return_value=${retName('limiter', v2)}`;
    case 0x2026:
      return `id=${v1} mute=${nameOf(MUTE_TEXT, v2)} level=${v3}`;
    case 0x2016:
      return `id=${v1} media=${nameOf(MEDIA_TEXT, v2)}`;
    case 0x2036:
      return `id=${v1} anc=${nameOf(ANC_TEXT, v2)}`;
    case 0x2046:
      return `id=${v1} limiter=${nameOf(LIMITER_TEXT, v2)}`;
    case 0x2050:
      return `id=${v1} battery=${v2}%`;
    case 0x2064:
      return `id=${v1} latency=${v2}ms`;
    case 0x3018:
      return `num_of_btdevice=${v1} btdevice_id=[${pbRepeated(m, 2).join(', ')}]`;
    // 上位机连上/状态变化后会用这组 Get 逐个补全设备属性
    case 0x3015:
    case 0x1013:
    case 0x2023:
    case 0x2047:
    case 0x2061:
      return `id=${v1}`;
    case 0x1014:
      return `id=${v1} zone_id=${v2}`;
    case 0x2024:
      return `id=${v1} mute=${nameOf(MUTE_TEXT, v2)} level=${v3}`;
    case 0x2048:
      return `id=${v1} battery_status=${v2} level=${v3}`;
    case 0x2062:
      return `id=${v1} latency=${v2}ms`;
    default:
      return dump(m);
  }
}

/* ---------------- 报文目录（接真协议时只改这张表） ---------------- */

export interface FrameDef {
  pt: number;
  msgId: number;
  mt: number;
  name: string;
}

/**
 * Message Type：1=SetReq 2=SetResp 3=GetReq 4=GetResp 5=Notify
 * pt 有历史包袱：0x2001/0x2003/0x2051 实机是 1/1/3（规范写 3）、0x3017 是 4，
 * 模块都收 —— 按 2026-11-24 的串口日志来，别"按规范纠正"。
 */
export const CDC: Record<string, FrameDef> = {
  radioDisc: { pt: 1, msgId: 0x0011, mt: 1, name: 'SetBTRadioDiscoveryRequest' },
  radioDiscResp: { pt: 1, msgId: 0x0012, mt: 2, name: 'SetBTRadioDiscoveryResponse' },
  radioDiscCancel: { pt: 1, msgId: 0x0013, mt: 1, name: 'SetBTRadioDiscoveryCancelRequest' },
  radioDiscCancelResp: { pt: 1, msgId: 0x0014, mt: 2, name: 'SetBTRadioDiscoveryCancelResponse' },
  discState: { pt: 1, msgId: 0x0010, mt: 5, name: 'NotifyBTDiscoveryState' },
  discDevice: { pt: 1, msgId: 0x0016, mt: 5, name: 'NotifyBTDiscoveredDevice' },
  deviceState: { pt: 1, msgId: 0x0020, mt: 5, name: 'NotifyBTDeviceState' },
  pair: { pt: 1, msgId: 0x0021, mt: 1, name: 'SetBTDevicePairRequest' },
  pairResp: { pt: 1, msgId: 0x0022, mt: 2, name: 'SetBTDevicePairResponse' },
  unpair: { pt: 1, msgId: 0x0043, mt: 1, name: 'SetBTDeviceUnPairRequest' },
  unpairResp: { pt: 1, msgId: 0x0044, mt: 2, name: 'SetBTDeviceUnPairResponse' },
  connect: { pt: 1, msgId: 0x0031, mt: 1, name: 'SetBTDeviceConnectRequest' },
  connectResp: { pt: 1, msgId: 0x0032, mt: 2, name: 'SetBTDeviceConnectResponse' },
  disconnect: { pt: 1, msgId: 0x0033, mt: 1, name: 'SetBTDeviceDisconnectRequest' },
  disconnectResp: { pt: 1, msgId: 0x0034, mt: 2, name: 'SetBTDeviceDisconnectResponse' },
  attach: { pt: 1, msgId: 0x0041, mt: 1, name: 'SetBTDeviceAttachRequest' },
  attachResp: { pt: 1, msgId: 0x0042, mt: 2, name: 'SetBTDeviceAttachResponse' },
  attachNotify: { pt: 1, msgId: 0x0040, mt: 5, name: 'NotifyBTDeviceAttach' },
  sysConnSet: { pt: 1, msgId: 0x2001, mt: 1, name: 'SetBTSysConnectivityRequest' },
  sysConnSetResp: { pt: 3, msgId: 0x2002, mt: 2, name: 'SetBTSysConnectivityResponse' },
  sysConnGet: { pt: 1, msgId: 0x2003, mt: 3, name: 'GetBTSysConnectivityRequest' },
  sysConnGetResp: { pt: 3, msgId: 0x2004, mt: 4, name: 'GetBTSysConnectivityResponse' },
  sysConnNotify: { pt: 3, msgId: 0x2006, mt: 5, name: 'NotifyBTSysConnectivityStatus' },
  volumeSet: { pt: 3, msgId: 0x2021, mt: 1, name: 'SetBTDeviceVolumeRequest' },
  volumeSetResp: { pt: 3, msgId: 0x2022, mt: 2, name: 'SetBTDeviceVolumeResponse' },
  volumeNotify: { pt: 3, msgId: 0x2026, mt: 5, name: 'NotifyBTDeviceVolume' },
  mediaNotify: { pt: 3, msgId: 0x2016, mt: 5, name: 'NotifyBTDeviceMediaPlayback' },
  ancSet: { pt: 3, msgId: 0x2031, mt: 1, name: 'SetBTDeviceANCRequest' },
  ancSetResp: { pt: 3, msgId: 0x2032, mt: 2, name: 'SetBTDeviceANCResponse' },
  ancNotify: { pt: 3, msgId: 0x2036, mt: 5, name: 'NotifyBTDeviceANCStatus' },
  limiterSet: { pt: 3, msgId: 0x2041, mt: 1, name: 'SetBTHeadphoneLimiterRequest' },
  limiterSetResp: { pt: 3, msgId: 0x2042, mt: 2, name: 'SetBTHeadphoneLimiterResponse' },
  limiterNotify: { pt: 3, msgId: 0x2046, mt: 5, name: 'NotifyBTHeadphoneLimiterStatus' },
  batteryNotify: { pt: 3, msgId: 0x2050, mt: 5, name: 'NotifyBTDeviceBatteryLevel' },
  latencyNotify: { pt: 3, msgId: 0x2064, mt: 5, name: 'NotifyBTDeviceAudioLatency' },
  timeSet: { pt: 3, msgId: 0x2051, mt: 1, name: 'SetAWCSCurrentTimeRequest' },
  timeSetResp: { pt: 3, msgId: 0x2052, mt: 2, name: 'SetAWCSCurrentTimeResponse' },
  timeNotify: { pt: 3, msgId: 0x2056, mt: 5, name: 'NotifyAWCSCurrentTime' },
  deviceListGet: { pt: 4, msgId: 0x3017, mt: 3, name: 'GetBTDeviceListRequest' },
  deviceListGetResp: { pt: 4, msgId: 0x3018, mt: 4, name: 'GetBTDeviceListResponse' },
  // 补齐单台设备属性用的 Get 族（2026-11-24 上位机日志）
  deviceAttrGet: { pt: 4, msgId: 0x3015, mt: 3, name: 'GetBTDeviceAttributeRequest' },
  deviceAttrGetResp: { pt: 4, msgId: 0x3016, mt: 4, name: 'GetBTDeviceAttributeResponse' },
  deviceZoneGet: { pt: 1, msgId: 0x1013, mt: 3, name: 'GetBTDeviceZoneRequest' },
  deviceZoneGetResp: { pt: 1, msgId: 0x1014, mt: 4, name: 'GetBTDeviceZoneResponse' },
  deviceVolumeGet: { pt: 3, msgId: 0x2023, mt: 3, name: 'GetBTDeviceVolumeRequest' },
  deviceVolumeGetResp: { pt: 3, msgId: 0x2024, mt: 4, name: 'GetBTDeviceVolumeResponse' },
  deviceBatteryGet: { pt: 3, msgId: 0x2047, mt: 3, name: 'GetBTDeviceBatteryLevelRequest' },
  deviceBatteryGetResp: { pt: 3, msgId: 0x2048, mt: 4, name: 'GetBTDeviceBatteryLevelResponse' },
  deviceLatencyGet: { pt: 3, msgId: 0x2061, mt: 3, name: 'GetBTDeviceAudioLatencyRequest' },
  deviceLatencyGetResp: { pt: 3, msgId: 0x2062, mt: 4, name: 'GetBTDeviceAudioLatencyResponse' },
};

const BY_MSG_ID = new Map<number, FrameDef>();
for (const def of Object.values(CDC)) if (!BY_MSG_ID.has(def.msgId)) BY_MSG_ID.set(def.msgId, def);

/** 收帧时按报文号找定义；表里没有的返回 undefined */
export function defByMsgId(msgId: number): FrameDef | undefined {
  return BY_MSG_ID.get(msgId);
}

export function nameOfMsg(msgId: number): string {
  return BY_MSG_ID.get(msgId)?.name ?? `Unknown_0x${msgId.toString(16).toUpperCase().padStart(4, '0')}`;
}