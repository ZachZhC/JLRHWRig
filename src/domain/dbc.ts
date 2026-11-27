/**
 * DBC 解析（页面运行时导入用）
 *
 * 只做 SWS/SWM/WDCM 台架页面需要的子集：
 *   BO_   报文定义
 *   SG_   信号定义（Intel/Motorola、有符号、factor/offset、min/max、单位）
 *   VAL_  枚举值表
 * 其它段（CM_ / BA_ / BA_DEF_ ...）只挑 VFrameFormat 用来标记 CAN FD，
 * 其余一律跳过 —— 不认识的段不报错，也不假装解析。
 *
 * 铁律（沿用 LDF 解析器的教训）：每一行要么被解析，要么进警告，
 * 不允许静默丢弃关键定义。
 */

export interface DbcSignal {
  name: string;
  /** DBC 起始位（原始值，未换算） */
  start: number;
  length: number;
  order: 'intel' | 'motorola';
  signed: boolean;
  factor: number;
  offset: number;
  unit: string;
  /** VAL_ 枚举：原始值 → 文本 */
  values: Record<number, string> | null;
  /** 复用标记：'M' 复用器 / 数字为 m<n> 分支 */
  mux: 'M' | number | null;
}

export interface DbcMessage {
  /** 唯一键：s:123 / x:2147483939（extended） */
  key: string;
  /** 去掉扩展位后的 ID */
  id: number;
  /** 文件里写的原始数字（VAL_ / BA_ 用它引用报文） */
  rawId: number;
  extended: boolean;
  name: string;
  dlc: number;
  sender: string;
  signals: DbcSignal[];
  /** VFrameFormat 14/15 = CAN FD */
  fd: boolean;
}

export interface DbcDatabase {
  fileName: string;
  messages: DbcMessage[];
  byKey: Map<string, DbcMessage>;
  byRawId: Map<number, DbcMessage>;
  signalCount: number;
  warnings: string[];
  /** 超过上限被吞掉的警告条数 */
  warningOverflow: number;
}

const MAX_WARNINGS = 40;
const EXT_FLAG = 0x80000000;

const RE_BO = /^BO_\s+(\d+)\s+([A-Za-z0-9_]+)\s*:\s*(\d+)\s+(\S+)/;
const RE_SG =
  /^SG_\s+([A-Za-z0-9_]+)\s*(?:(M|m\d+)\s*)?:\s*(\d+)\|(\d+)@([01])([+-])\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)\s*\[\s*([^|]*?)\s*\|\s*([^\]]*?)\s*\]\s*"([^"]*)"/;
const RE_VAL = /^VAL_\s+(\d+)\s+([A-Za-z0-9_]+)\s+(.*)$/;
const RE_VAL_PAIR = /(-?\d+)\s+"([^"]*)"/g;
const RE_VFRAME = /^BA_\s+"VFrameFormat"\s+BO_\s+(\d+)\s+(\d+)\s*;/;

function num(v: string, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function parseDbc(text: string, fileName: string): DbcDatabase {
  const warnings: string[] = [];
  let warningOverflow = 0;
  const warn = (msg: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(msg);
    else warningOverflow += 1;
  };

  const messages: DbcMessage[] = [];
  const byKey = new Map<string, DbcMessage>();
  const byRawId = new Map<number, DbcMessage>();
  const pendingVals: Array<{ rawId: number; signal: string; values: Record<number, string>; line: number }> = [];
  let cur: DbcMessage | null = null;
  let muxRelations = 0;
  let floatSignals = 0;
  let inNsBlock = false;

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    // NS_ 块里是缩进的关键字清单（含裸 VAL_ / SG_MUL_VAL_），整块跳过
    if (inNsBlock) {
      if (/^[\t ]/.test(raw)) continue;
      inNsBlock = false;
    }
    if (/^NS_\s*:/.test(raw)) {
      inNsBlock = true;
      continue;
    }

    const line = raw.trim();
    if (!line) continue;
    const lineNo = i + 1;

    const bo = RE_BO.exec(line);
    if (bo) {
      const rawId = num(bo[1]);
      const extended = rawId >= EXT_FLAG;
      const id = extended ? rawId - EXT_FLAG : rawId;
      const key = `${extended ? 'x' : 's'}:${id}`;
      const existed = byKey.get(key);
      if (existed) warn(`第 ${lineNo} 行：报文 ${key} 重复定义，后一条覆盖前一条`);
      cur = {
        key,
        id,
        rawId,
        extended,
        name: bo[2],
        dlc: num(bo[3]),
        sender: bo[4],
        signals: [],
        fd: false,
      };
      if (!existed) messages.push(cur);
      byKey.set(key, cur);
      byRawId.set(rawId, cur);
      continue;
    }

    const sg = RE_SG.exec(line);
    if (sg) {
      if (!cur) {
        warn(`第 ${lineNo} 行：信号 ${sg[1]} 出现在任何 BO_ 之前`);
        continue;
      }
      const muxToken = sg[2];
      cur.signals.push({
        name: sg[1],
        start: num(sg[3]),
        length: num(sg[4]),
        order: sg[5] === '1' ? 'intel' : 'motorola',
        signed: sg[6] === '-',
        factor: num(sg[7], 1),
        offset: num(sg[8], 0),
        unit: sg[11],
        values: null,
        mux: muxToken === 'M' ? 'M' : muxToken ? num(muxToken.slice(1)) : null,
      });
      continue;
    }

    const val = RE_VAL.exec(line);
    if (val) {
      const values: Record<number, string> = {};
      RE_VAL_PAIR.lastIndex = 0;
      let pair: RegExpExecArray | null;
      while ((pair = RE_VAL_PAIR.exec(val[3])) !== null) {
        values[num(pair[1])] = pair[2];
      }
      pendingVals.push({ rawId: num(val[1]), signal: val[2], values, line: lineNo });
      continue;
    }

    if (line.startsWith('SG_MUL_VAL_')) {
      muxRelations += 1;
      continue;
    }

    if (line.startsWith('SIG_VALTYPE_')) {
      floatSignals += 1;
      continue;
    }

    const fd = RE_VFRAME.exec(line);
    if (fd) {
      const msg = byRawId.get(num(fd[1]));
      if (msg && (num(fd[2]) === 14 || num(fd[2]) === 15)) msg.fd = true;
      // 普通 CAN(0/1) 不标记
      continue;
    }

    if (/^(VERSION|NS_|BS_|BU_|VAL_TABLE_|CM_|BA_DEF_|BA_DEF_DEF_|BA_|SIG_VALTYPE_|SIG_GROUP_|BO_TX_BU_|EV_|ENVVAR_DATA_|CAT_DEF_|CAT_|FILTER|SIG_TYPE_REF_|SIG_ATTRIBUTE_)/.test(line)) {
      continue;
    }

    // 多行 CM_ 的续行、缩进关键字等无法识别的行：只在看起来像定义时才吵
    if (/^(BO_|SG_|VAL_)/.test(line)) warn(`第 ${lineNo} 行：无法解析的定义：${line.slice(0, 60)}`);
  }

  for (const pv of pendingVals) {
    const msg = byRawId.get(pv.rawId);
    if (!msg) {
      warn(`第 ${pv.line} 行：VAL_ 引用了不存在的报文 ${pv.rawId}`);
      continue;
    }
    const sig = msg.signals.find((s) => s.name === pv.signal);
    if (!sig) {
      warn(`第 ${pv.line} 行：VAL_ 引用了 ${msg.name} 里不存在的信号 ${pv.signal}`);
      continue;
    }
    sig.values = { ...(sig.values ?? {}), ...pv.values };
  }

  const muxMessages = messages.filter((m) => m.signals.some((s) => s.mux !== null)).length;
  if (muxRelations > 0) warn(`存在 ${muxRelations} 条 SG_MUL_VAL_ 复用关系，暂不支持`);
  if (muxMessages > 0) warn(`${muxMessages} 条报文含复用信号（mux），解码前需确认取哪一支`);
  const fdCount = messages.filter((m) => m.fd).length;
  if (fdCount > 0) warn(`${fdCount} 条 CAN FD 报文（VFrameFormat 14/15），解码未验证`);
  if (floatSignals > 0) warn(`${floatSignals} 条信号为浮点（SIG_VALTYPE_），解码未实现`);

  return {
    fileName,
    messages,
    byKey,
    byRawId,
    signalCount: messages.reduce((n, m) => n + m.signals.length, 0),
    warnings,
    warningOverflow,
  };
}