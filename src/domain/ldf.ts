/**
 * LDF（LIN Description File）解析 —— 只承诺 LDF 2.x 的标准子集
 *
 * 解析内容：Nodes（主节点）/ Signals / Frames / Diagnostic_frames /
 * Schedule_tables / Signal_encoding_types + Signal_representation（合并进信号）。
 *
 * 取舍：
 *   - 不支持或未见的段（Event_triggered_frames / Sporadic_frames 等）整体跳过，
 *     但会在 warnings 里列出来，不静默丢；
 *   - 帧里没写起始位的信号按出现顺序低位先行推断（LDF 标准做法）；
 *   - 坏行、引用不存在的信号/编码都逐条进 warnings（上限 40 条）。
 *
 * 目前只用于 Trace 头栏的自检条（帧数/信号数/警告），不做解码。
 */

export interface LdfSignal {
  name: string;
  size: number;
  init: number;
  publisher: string;
  subscribers: string[];
  encoding: string | null;
  /** 来自 Signal_encoding_types 的 physical_value，缺省 1/0/"" */
  factor: number;
  offset: number;
  unit: string;
  /** logical_value 枚举，缺省 null */
  values: Record<number, string> | null;
}

export interface LdfFrameSignal {
  name: string;
  /** 帧内起始位（LSB0），来自 LDF 或按顺序推断 */
  start: number;
}

export interface LdfFrame {
  name: string;
  /** 0–59 普通帧，60/61 诊断帧 */
  id: number;
  publisher: string;
  length: number;
  diagnostic: boolean;
  signals: LdfFrameSignal[];
}

export interface LdfDatabase {
  fileName: string;
  master: string;
  frames: LdfFrame[];
  signals: Map<string, LdfSignal>;
  /** 调度表名（后续按表定节拍用） */
  schedules: string[];
  warnings: string[];
  warningOverflow: number;
}

const MAX_WARNINGS = 40;

/** 已识别但不解析的段，出现时提示一句 */
const SKIPPED_SECTIONS = ['Event_triggered_frames', 'Sporadic_frames', 'Composite_signal_groups'];

function num(text: string): number {
  const t = text.trim();
  return /^0x/i.test(t) ? parseInt(t, 16) : Number(t);
}

/** 去掉块注释后按「顶层 Name { ... }」切段（花括号配对，容忍嵌套） */
function splitSections(clean: string, warn: (s: string) => void): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(?:^|\n)[ \t]*([A-Za-z_]\w*)[ \t]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const name = m[1];
    const bodyStart = re.lastIndex;
    let depth = 0;
    let i = re.lastIndex - 1;
    for (; i < clean.length; i++) {
      const c = clean[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i >= clean.length) {
      warn(`段 ${name} 的花括号没有闭合，已取到文件末尾`);
      if (!out.has(name)) out.set(name, clean.slice(bodyStart));
      break;
    }
    if (!out.has(name)) out.set(name, clean.slice(bodyStart, i));
    re.lastIndex = i + 1;
  }
  return out;
}

const RE_SIGNAL =
  /^[ \t]*([A-Za-z_]\w*)[ \t]*:[ \t]*(\d+)[ \t]*,[ \t]*(-?\w+)(?:[ \t]*,[ \t]*([A-Za-z_]\w*))?(?:[ \t]*,[ \t]*([^;]*))?;/gm;

const RE_FRAME =
  /([A-Za-z_]\w*)[ \t]*:[ \t]*(0x[0-9A-Fa-f]+|\d+)[ \t]*,[ \t]*([A-Za-z_]\w*)[ \t]*,[ \t]*(\d+)[ \t]*\{([^}]*)\}/g;

const RE_DIAG_FRAME = /([A-Za-z_]\w*)[ \t]*:[ \t]*(\d+)[ \t]*\{([^}]*)\}/g;

/** 依次取出 body 里的顶层 `Name { ... }` 块（嵌套块整体跳过） */
function topLevelBlocks(body: string): { name: string; inner: string }[] {
  const out: { name: string; inner: string }[] = [];
  let i = 0;
  while (i < body.length) {
    const brace = body.indexOf('{', i);
    if (brace < 0) break;
    const before = body.slice(Math.max(0, brace - 64), brace);
    const m = /([A-Za-z_]\w*)[ \t]*$/.exec(before);
    let depth = 0;
    let j = brace;
    for (; j < body.length; j++) {
      const c = body[j];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (m) out.push({ name: m[1], inner: body.slice(brace + 1, j) });
    i = j + 1;
  }
  return out;
}

const RE_FRAME_SIGNAL = /([A-Za-z_]\w*)(?:[ \t]*,[ \t]*(\d+))?[ \t]*;/g;

function parseFrameSignals(
  body: string,
  frame: LdfFrame,
  signals: Map<string, LdfSignal>,
  warn: (s: string) => void,
) {
  let cursor = 0;
  RE_FRAME_SIGNAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_FRAME_SIGNAL.exec(body))) {
    const sig = signals.get(m[1]);
    if (!sig) {
      warn(`帧 ${frame.name} 引用了未定义的信号 ${m[1]}`);
      continue;
    }
    const start = m[2] === undefined ? cursor : Number(m[2]);
    cursor = start + sig.size;
    if (cursor > frame.length * 8) {
      warn(`帧 ${frame.name} 的信号 ${sig.name} 超出 ${frame.length} 字节（到第 ${cursor} 位）`);
    }
    frame.signals.push({ name: sig.name, start });
  }
}

export function parseLdf(text: string, fileName: string): LdfDatabase {
  const warnings: string[] = [];
  let overflow = 0;
  const warn = (s: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(s);
    else overflow++;
  };

  const db: LdfDatabase = {
    fileName,
    master: '',
    frames: [],
    signals: new Map(),
    schedules: [],
    warnings,
    warningOverflow: 0,
  };

  if (!/LIN_description_file\s*;/.test(text)) {
    warn('文件开头没有 LIN_description_file;，可能不是 LDF');
  }

  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const sections = splitSections(clean, warn);

  for (const name of SKIPPED_SECTIONS) {
    if (sections.has(name)) warn(`未解析的段 ${name}（不影响帧/信号，已跳过）`);
  }

  // ---- Nodes：只要主节点名 ----
  const nodes = sections.get('Nodes');
  if (nodes) {
    const mm = /Master[ \t]*:[ \t]*([A-Za-z_]\w*)/.exec(nodes);
    if (mm) db.master = mm[1];
  } else warn('缺少 Nodes 段（主节点未知）');

  // ---- Signals（含 Diagnostic_signals：后者只有 名称, 位数, 初始值） ----
  const ingestSignals = (body: string, section: string) => {
    RE_SIGNAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_SIGNAL.exec(body))) {
      const name = m[1];
      if (db.signals.has(name)) {
        warn(`${section} 里的信号 ${name} 重复定义，保留第一次`);
        continue;
      }
      db.signals.set(name, {
        name,
        size: Number(m[2]),
        init: num(m[3]),
        publisher: m[4] ?? '',
        subscribers: (m[5] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        encoding: null,
        factor: 1,
        offset: 0,
        unit: '',
        values: null,
      });
    }
  };

  const signalsBody = sections.get('Signals');
  if (signalsBody) ingestSignals(signalsBody, 'Signals');
  else warn('缺少 Signals 段');

  const diagSignalsBody = sections.get('Diagnostic_signals');
  if (diagSignalsBody) ingestSignals(diagSignalsBody, 'Diagnostic_signals');

  // ---- Signal_encoding_types ----
  const encodings = new Map<
    string,
    { factor: number; offset: number; unit: string; values: Record<number, string> | null }
  >();
  const encBody = sections.get('Signal_encoding_types');
  if (encBody) {
    const RE_ENC = /([A-Za-z_]\w*)[ \t]*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = RE_ENC.exec(encBody))) {
      const name = m[1];
      const body = m[2];
      const pv =
        /physical_value[ \t]*,[ \t]*([-\d.]+)[ \t]*,[ \t]*([-\d.]+)[ \t]*,[ \t]*([-\d.]+)[ \t]*,[ \t]*([-\d.]+)[ \t]*,[ \t]*"([^"]*)"/.exec(
          body,
        );
      const values: Record<number, string> = {};
      let hasValue = false;
      const RE_LV = /logical_value[ \t]*,[ \t]*(\d+)[ \t]*,[ \t]*"([^"]*)"/g;
      let lv: RegExpExecArray | null;
      while ((lv = RE_LV.exec(body))) {
        values[Number(lv[1])] = lv[2];
        hasValue = true;
      }
      encodings.set(name, {
        factor: pv ? Number(pv[3]) : 1,
        offset: pv ? Number(pv[4]) : 0,
        unit: pv ? pv[5] : '',
        values: hasValue ? values : null,
      });
    }
  }

  // ---- Signal_representation：把编码挂到信号上 ----
  const repBody = sections.get('Signal_representation');
  if (repBody) {
    const RE_REP = /([A-Za-z_]\w*)[ \t]*:[ \t]*([^;]*);/g;
    const reportedMissing = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = RE_REP.exec(repBody))) {
      const encName = m[1];
      const enc = encodings.get(encName);
      if (!enc) {
        if (!reportedMissing.has(encName)) {
          warn(`信号编码 ${encName} 没有定义，引用它的信号按原始值处理`);
          reportedMissing.add(encName);
        }
        continue;
      }
      const sigNames = m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sigName of sigNames) {
        const sig = db.signals.get(sigName);
        if (!sig) {
          warn(`信号编码 ${encName} 引用了未定义的信号 ${sigName}`);
          continue;
        }
        sig.encoding = encName;
        sig.factor = enc.factor;
        sig.offset = enc.offset;
        sig.unit = enc.unit;
        sig.values = enc.values;
      }
    }
  }

  // ---- Frames ----
  const framesBody = sections.get('Frames');
  if (framesBody) {
    RE_FRAME.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_FRAME.exec(framesBody))) {
      const frame: LdfFrame = {
        name: m[1],
        id: num(m[2]),
        publisher: m[3],
        length: Number(m[4]),
        diagnostic: false,
        signals: [],
      };
      if (frame.id > 0x3f) warn(`帧 ${frame.name} 的 ID 0x${frame.id.toString(16)} 超过 LIN 帧 ID 上限 0x3F`);
      parseFrameSignals(m[5], frame, db.signals, warn);
      db.frames.push(frame);
    }
  } else warn('缺少 Frames 段');

  // ---- Diagnostic_frames（0x3C MasterReq / 0x3D SlaveResp） ----
  const diagBody = sections.get('Diagnostic_frames');
  if (diagBody) {
    RE_DIAG_FRAME.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_DIAG_FRAME.exec(diagBody))) {
      const name = m[1];
      const frame: LdfFrame = {
        name,
        id: num(m[2]),
        publisher: /^Master/i.test(name) ? db.master : '',
        length: 8,
        diagnostic: true,
        signals: [],
      };
      parseFrameSignals(m[3], frame, db.signals, warn);
      db.frames.push(frame);
    }
  }

  // ---- Schedule_tables：只记顶层表名（表内的 FreeFormat 块不算表） ----
  const schedBody = sections.get('Schedule_tables');
  if (schedBody) {
    for (const t of topLevelBlocks(schedBody)) db.schedules.push(t.name);
  }

  // ---- 汇总未出现在任何帧里的信号 ----
  const used = new Set<string>();
  for (const f of db.frames) for (const s of f.signals) used.add(s.name);
  const orphans: string[] = [];
  db.signals.forEach((s) => {
    if (!used.has(s.name)) orphans.push(s.name);
  });
  if (orphans.length > 0) {
    const head = orphans.slice(0, 3).join(', ');
    warn(
      `${orphans.length} 个信号未出现在任何帧中${orphans.length > 3 ? `（如 ${head} …）` : `（${head}）`}`,
    );
  }

  db.warningOverflow = overflow;
  return db;
}