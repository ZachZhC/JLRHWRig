/**
 * 页面运行时导入的文件（CAN 的 DBC、LIN 的 LDF 共用）
 *
 * 每个页面各存一份：
 *   - 导入的文件存 localStorage（key 由页面传入），刷新/重启不丢
 *   - 没导入时尝试加载随包发布的默认文件（如 public/dbc/swm.dbc）
 *   - 文件过大（localStorage 放不下）只在内存里用，并提示刷新后需重新导入
 *
 * 解析失败（返回 { error }）时保留上一份能用的文件，只把原因显示出来；
 * 默认文件解析失败则静默保持空（默认文件是可选的）。
 */

export type FileStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface FileCount {
  n: number;
  label: string;
}

export interface FileSnapshot<T> {
  status: FileStatus;
  fileName: string;
  source: 'imported' | 'default' | null;
  counts: FileCount[];
  warnings: string[];
  warningOverflow: number;
  /** 非致命提示（如文件太大未能记住） */
  notice: string;
  /** 最近一次导入失败的原因（已有文件时保留旧的继续用） */
  error: string;
  data: T | null;
}

export type ParsedFile<T> =
  | { data: T; counts: FileCount[]; warnings: string[]; warningOverflow: number }
  | { error: string };

export interface FileStoreOptions<T> {
  /** localStorage key，如 hmi.dbc.v1.swm */
  storageKey: string;
  /** 相对站点根的默认文件路径，如 dbc/swm.dbc */
  defaultPath: string;
  parse: (text: string, fileName: string) => ParsedFile<T>;
}

/** 超过这个长度就不进 localStorage（配额约 5M 字符，多页要留余量） */
const MAX_PERSIST_CHARS = 1_500_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class RuntimeFileStore<T> {
  private snap: FileSnapshot<T>;
  private listeners = new Set<() => void>();
  private started = false;
  private loadSeq = 0;

  constructor(private opts: FileStoreOptions<T>) {
    this.snap = {
      status: 'empty',
      fileName: '',
      source: null,
      counts: [],
      warnings: [],
      warningOverflow: 0,
      notice: '',
      error: '',
      data: null,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): FileSnapshot<T> => this.snap;

  private emit() {
    this.snap = { ...this.snap };
    this.listeners.forEach((l) => l());
  }

  /** 挂载时调一次：先恢复上次导入的，没有再试默认文件 */
  init() {
    if (this.started) return;
    this.started = true;

    const saved = this.readSaved();
    if (saved) {
      this.apply(saved.text, saved.name, 'imported', false);
      return;
    }
    void this.loadDefault();
  }

  private readSaved(): { name: string; text: string } | null {
    try {
      const raw = localStorage.getItem(this.opts.storageKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (typeof obj?.text === 'string' && obj.text.length > 0) {
        return { name: String(obj.name || 'saved') , text: obj.text };
      }
      localStorage.removeItem(this.opts.storageKey);
    } catch {
      // 配额/损坏的数据都不影响继续用默认文件
    }
    return null;
  }

  private async loadDefault() {
    let res: Response;
    try {
      res = await fetch(new URL(this.opts.defaultPath, document.baseURI).href);
    } catch {
      return;
    }
    if (!res.ok) return; // 默认文件可选，缺失就保持空
    const text = await res.text().catch(() => '');
    if (!text) return;
    this.apply(text, this.opts.defaultPath.split('/').pop() || this.opts.defaultPath, 'default', false, true);
  }

  async loadFile(file: File) {
    const token = ++this.loadSeq;
    this.snap = { ...this.snap, status: this.snap.data ? this.snap.status : 'loading', error: '', notice: '' };
    this.emit();

    if (file.size > MAX_FILE_BYTES) {
      this.fail(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB, limit 20 MB)`);
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      if (token !== this.loadSeq) return;
      this.fail('Failed to read the file');
      return;
    }
    if (token !== this.loadSeq) return;
    this.apply(text, file.name, 'imported', true);
  }

  private fail(message: string) {
    this.snap = {
      ...this.snap,
      status: this.snap.data ? this.snap.status : 'error',
      error: message,
    };
    this.emit();
  }

  private apply(
    text: string,
    fileName: string,
    source: 'imported' | 'default',
    persist: boolean,
    silent = false,
  ) {
    const parsed = this.opts.parse(text, fileName);
    if ('error' in parsed) {
      if (!silent) this.fail(parsed.error);
      return;
    }

    let notice = '';
    if (persist) {
      if (text.length > MAX_PERSIST_CHARS) {
        notice = 'Not saved — file too large, re-import after reload';
      } else {
        try {
          localStorage.setItem(this.opts.storageKey, JSON.stringify({ name: fileName, text }));
        } catch {
          notice = 'Not saved — browser storage is full';
        }
      }
    }

    this.snap = {
      status: 'ready',
      fileName,
      source,
      counts: parsed.counts,
      warnings: parsed.warnings,
      warningOverflow: parsed.warningOverflow,
      notice,
      error: '',
      data: parsed.data,
    };
    this.emit();
  }
}

export function createFileStore<T>(opts: FileStoreOptions<T>): RuntimeFileStore<T> {
  return new RuntimeFileStore<T>(opts);
}