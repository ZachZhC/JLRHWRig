/**
 * BMCLI CAN 链路（只订阅，不发送）
 *
 * 通道由 BMCLI 侧打开（台架项目/命令行），页面只做三件事：
 *   1. 列出已打开的 CAN 通道（GET /channels）
 *   2. 对选中的通道订阅 SSE（/messages/stream?from=now）
 *   3. 把原始报文交给 Trace 显示
 *
 * 注意：这里绝不 DELETE 通道 —— 通道可能属于台架项目，关掉会影响别的页。
 * SWS 与 SWM 两页共用这一个连接，因为它们看的是同一条总线。
 */

const API = '/api/v1';
const MAX_FRAMES = 200;
const FLUSH_MS = 100;

export interface CanChannel {
  /** 可直接用于 stream?channel= 的定位串 */
  selector: string;
  name: string;
  port: number;
  serial: string;
  nominalBps: number | null;
}

export interface CanFrame {
  /** 递增序号，仅用于列表 key */
  seq: number;
  /** 本地到达时间（ms） */
  at: number;
  dir: 'rx' | 'tx';
  id: number;
  dlc: number;
  data: string;
  kind: string;
  flags: number;
}

export type CanLinkStatus = 'idle' | 'connecting' | 'open' | 'error';

export interface CanLinkSnapshot {
  status: CanLinkStatus;
  error: string;
  listError: string;
  channels: CanChannel[];
  selected: string | null;
  frames: CanFrame[];
  rx: number;
  tx: number;
  gaps: number;
}

const INITIAL: CanLinkSnapshot = {
  status: 'idle',
  error: '',
  listError: '',
  channels: [],
  selected: null,
  frames: [],
  rx: 0,
  tx: 0,
  gaps: 0,
};

class CanLinkStore {
  private snap: CanLinkSnapshot = { ...INITIAL };
  private listeners = new Set<() => void>();
  private es: EventSource | null = null;
  private pending: CanFrame[] = [];
  private flushTimer: number | null = null;
  private seq = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CanLinkSnapshot => this.snap;

  private emit() {
    this.snap = { ...this.snap };
    this.listeners.forEach((l) => l());
  }

  /** 报文可能很密，合并成 100ms 一批再通知 React */
  private scheduleFlush() {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_MS);
  }

  private flush() {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    const frames = [...batch.reverse(), ...this.snap.frames].slice(0, MAX_FRAMES);
    this.snap = { ...this.snap, frames };
    this.emit();
  }

  async refreshChannels() {
    let res: Response;
    try {
      res = await fetch(`${API}/channels`);
    } catch {
      this.snap = { ...this.snap, listError: 'BMCLI is not running (or the /api proxy is unavailable)' };
      this.emit();
      return;
    }
    if (!res.ok) {
      this.snap = { ...this.snap, listError: `Failed to list channels (HTTP ${res.status})` };
      this.emit();
      return;
    }
    const body = await res.json().catch(() => null);
    const raw: any[] = Array.isArray(body?.channels) ? body.channels : [];
    const channels: CanChannel[] = raw
      .filter((c) => c && c.open && c.bus === 'can')
      .map((c) => ({
        selector: c.serial ? `${c.serial}/${c.port}` : String(c.port),
        name: String(c.name || `Channel ${c.port}`),
        port: Number(c.port) || 0,
        serial: String(c.serial || ''),
        nominalBps: typeof c.nominal_bitrate_bps === 'number' ? c.nominal_bitrate_bps : null,
      }));
    const stillThere = this.snap.selected
      && channels.some((c) => c.selector === this.snap.selected);
    const selected = stillThere
      ? this.snap.selected
      : channels.length === 1 ? channels[0].selector : null;
    this.snap = { ...this.snap, channels, listError: '', selected };
    this.emit();
  }

  select(selector: string) {
    if (this.es) return;
    this.snap = { ...this.snap, selected: selector || null };
    this.emit();
  }

  connect() {
    const selector = this.snap.selected;
    if (!selector || this.es) return;
    if (typeof EventSource === 'undefined') {
      this.snap = { ...this.snap, status: 'error', error: 'SSE is not available — open this page over http://' };
      this.emit();
      return;
    }

    this.snap = { ...this.snap, status: 'connecting', error: '' };
    this.emit();

    const url = `${API}/messages/stream?channel=${encodeURIComponent(selector)}&from=0`; // TEMP-VERIFY
    const es = new EventSource(url);
    this.es = es;

    es.onopen = () => {
      if (this.es !== es) return;
      this.snap = { ...this.snap, status: 'open' };
      this.emit();
    };

    es.onerror = () => {
      if (this.es !== es) return;
      this.closeStream();
      this.snap = { ...this.snap, status: 'error', error: 'Connection lost (channel closed or BMCLI stopped)' };
      this.emit();
    };

    es.addEventListener('message', (e) => {
      if (this.es !== es) return;
      let ev: any;
      try {
        ev = JSON.parse((e as MessageEvent).data);
      } catch {
        return;
      }
      if (ev?.event_kind !== 'rx_frame' && ev?.event_kind !== 'tx_complete') return;
      const dir: 'rx' | 'tx' = ev.direction === 'tx' ? 'tx' : 'rx';
      this.pending.push({
        seq: ++this.seq,
        at: Date.now(),
        dir,
        id: Number(ev.id) || 0,
        dlc: Number(ev.dlc) || 0,
        data: String(ev.data || ''),
        kind: String(ev.event_kind),
        flags: Number(ev.flags) || 0,
      });
      if (dir === 'tx') this.snap = { ...this.snap, tx: this.snap.tx + 1 };
      else this.snap = { ...this.snap, rx: this.snap.rx + 1 };
      // 计数也走批量通知，避免每帧触发渲染
      this.scheduleFlush();
    });

    es.addEventListener('gap', () => {
      if (this.es !== es) return;
      this.snap = { ...this.snap, gaps: this.snap.gaps + 1 };
      this.emit();
    });
  }

  disconnect() {
    this.closeStream();
    this.snap = { ...this.snap, status: 'idle', error: '' };
    this.emit();
  }

  private closeStream() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  /** 清空行，不清计数（与 CWCM / BTA 页一致） */
  clearFrames() {
    this.snap = { ...this.snap, frames: [] };
    this.emit();
  }
}

export const canLink = new CanLinkStore();