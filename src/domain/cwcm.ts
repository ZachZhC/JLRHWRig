/**
 * CWCM（WCCM）LIN15 信号编解码
 *
 * 依据：BCMA_A_LIN15_NCR26Q1_260306.ldf + ESIS_WCCM_A_NCR26Q1_260306_V1.0
 * 集群 LIN 2.1 / 19.2 kbps，WCCM 为从节点（configured_NAD = 0x02）。
 *
 * 两帧均由台架侧主节点收发：
 *   0x26 WCCM_L15_Req_A  BCMA → WCCM（8 字节，增强型校验和）
 *   0x27 WCCM_L15_Res_A  WCCM → BCMA（8 字节，增强型校验和）
 *
 * LDF 的 start_bit 为小端位序（bit0 = 第 0 字节最低位）；
 * 校验和由 BMCLI 主节点按 enhanced 自动生成，这里只处理数据字节。
 */

/** 主节点下发的控制帧 */
export const WCCM_REQ_ID = 0x26;
export const WCCM_REQ_NAME = 'WCCM_L15_Req_A';

/** 从节点回传的标识帧 */
export const WCCM_RES_ID = 0x27;
export const WCCM_RES_NAME = 'WCCM_L15_Res_A';

export const WCCM_REQ_DLC = 8;
export const WCCM_RES_DLC = 8;

/** LDF 帧初始数据：未定义位填 1，PBBatVolt/SPBBatVolt 初值 140（14.0 V） */
const REQ_INITIAL = [0xff, 0xff, 0xff, 0x3f, 0x8c, 0x8c, 0x00, 0x80];

/** ESIS §8.3 ElPowerStatus：2 bit 电量警告状态 */
export const EL_POWER_STATUS = [
  'KeepActive',
  'WarningLowBatteryVolt',
  'ShutDown',
  'NotUsed',
] as const;
export type ElPowerStatus = (typeof EL_POWER_STATUS)[number];

/** ESIS §8.3 PowerMode_LIN：5 bit 电源模式（8 未定义） */
export const POWER_MODE_LIN: Record<number, string> = {
  0: 'KeyOut',
  1: 'KeyRecentlyOut',
  2: 'KeyApproved_0',
  3: 'PostAccessory_0',
  4: 'Accessory_1',
  5: 'PostIgnition_1',
  6: 'IgnitionOn_2',
  7: 'Running_2',
  9: 'Crank_3',
};

/** BacklightIntensity 255 = Fault condition present，0-254 为强度 */
export const BACKLIGHT_FAULT = 255;
/** 每秒刻对应的百分比（ESIS physical range 0-254, scale 0.3937） */
export const BACKLIGHT_PERCENT_PER_LSB = 0.3937;

/** 主节点下发的控制量（均为总线逻辑值，不是物理值） */
export interface WccmReqState {
  backlightStatus: 0 | 1;
  /** 0-254 有效，255 = Fault */
  backlightIntensity: number;
  elPowerStatus: ElPowerStatus;
  limitedPowerMode: 0 | 1;
  /** 0x0-0xFF，物理值 = 原始值 × 0.1 V */
  pbBatVolt: number;
  /** 同上 */
  spbBatVolt: number;
  /** 0-31；缺省 0（KeyOut） */
  powerModeLin: number;
}

export function defaultReqState(): WccmReqState {
  return {
    // 拨「充电」ON 即背光 ON · 100%：一上来就能看到模块 LED 亮（2026-11-27 定）
    backlightStatus: 1,
    backlightIntensity: 254,
    elPowerStatus: 'KeepActive',
    limitedPowerMode: 0,
    pbBatVolt: 140,
    spbBatVolt: 140,
    powerModeLin: 0,
  };
}

function setBits(buf: number[], start: number, size: number, value: number): void {
  for (let i = 0; i < size; i++) {
    const bit = start + i;
    const index = bit >> 3;
    const mask = 1 << (bit & 7);
    if ((value >> i) & 1) buf[index] |= mask;
    else buf[index] &= ~mask;
  }
}

function getBits(buf: ArrayLike<number>, start: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) {
    const bit = start + i;
    if ((buf[bit >> 3] >> (bit & 7)) & 1) value |= 1 << i;
  }
  return value;
}

/** 组装 0x26 数据字节（不含校验和） */
export function encodeWccmReq(state: WccmReqState): Uint8Array {
  const buf = REQ_INITIAL.slice();
  setBits(buf, 30, 1, state.limitedPowerMode);
  setBits(buf, 31, 1, state.backlightStatus);
  setBits(buf, 32, 8, state.spbBatVolt & 0xff);
  setBits(buf, 40, 8, state.pbBatVolt & 0xff);
  setBits(buf, 48, 8, state.backlightIntensity & 0xff);
  setBits(buf, 56, 5, state.powerModeLin & 0x1f);
  setBits(buf, 61, 2, EL_POWER_STATUS.indexOf(state.elPowerStatus));
  return Uint8Array.from(buf);
}

/** 解析 0x27 的一个数据块 */
export interface WccmResFrame {
  /** 本块 2 字符（低位字节在前） */
  partChunk: string;
  partBlock: number;
  serialChunk: string;
  serialBlock: number;
  errResp: boolean;
}

export function decodeWccmRes(bytes: ArrayLike<number>): WccmResFrame {
  const partWord = getBits(bytes, 0, 16);
  const serialWord = getBits(bytes, 16, 16);
  return {
    partChunk: String.fromCharCode(partWord & 0xff, (partWord >> 8) & 0xff),
    partBlock: getBits(bytes, 32, 4),
    serialChunk: String.fromCharCode(serialWord & 0xff, (serialWord >> 8) & 0xff),
    serialBlock: getBits(bytes, 36, 3),
    errResp: getBits(bytes, 39, 1) === 1,
  };
}

/**
 * 零件号/序列号分块拼接。
 * 零件号 12 块 × 2 字符 = 24 字符；序列号 8 块 × 2 字符 = 16 字符
 * （ESIS §8.2：零件号块号 0-11，序列号块号 0-7）。
 */
export const PART_BLOCKS = 12;
export const SERIAL_BLOCKS = 8;

export interface WccmIdentity {
  part: (string | null)[];
  serial: (string | null)[];
  /** 最近一帧的响应错误位 */
  errResp: boolean;
}

export function createIdentity(): WccmIdentity {
  return {
    part: new Array<string | null>(PART_BLOCKS).fill(null),
    serial: new Array<string | null>(SERIAL_BLOCKS).fill(null),
    errResp: false,
  };
}

export interface IdentityView {
  identity: WccmIdentity;
  partNo: string;
  serialNo: string;
  partComplete: boolean;
  serialComplete: boolean;
}

function joinBlocks(blocks: (string | null)[]): { text: string; complete: boolean } {
  const complete = blocks.every((b) => b !== null);
  const text = blocks
    .map((b) => b ?? '\u0000')
    .join('')
    .replace(/\u0000/g, ' ')
    .trimEnd();
  return { text, complete };
}

/** 吃进一帧 0x27，返回新的累计结果（不修改入参） */
export function ingestWccmRes(identity: WccmIdentity, bytes: ArrayLike<number>): IdentityView {
  const frame = decodeWccmRes(bytes);
  const part = identity.part.slice();
  const serial = identity.serial.slice();
  if (frame.partBlock < PART_BLOCKS) part[frame.partBlock] = frame.partChunk;
  if (frame.serialBlock < SERIAL_BLOCKS) serial[frame.serialBlock] = frame.serialChunk;
  const next: WccmIdentity = { part, serial, errResp: frame.errResp };
  const p = joinBlocks(part);
  const s = joinBlocks(serial);
  return {
    identity: next,
    partNo: p.text,
    serialNo: s.text,
    partComplete: p.complete,
    serialComplete: s.complete,
  };
}

/** 原始值 → 百分比（0-254 有效；255 无百分比含义） */
export function backlightPercent(raw: number): number {
  return Math.round(raw * BACKLIGHT_PERCENT_PER_LSB * 10) / 10;
}

/** 原始值 → 电池电压 V */
export function batVolt(raw: number): number {
  return Math.round(raw) / 10;
}