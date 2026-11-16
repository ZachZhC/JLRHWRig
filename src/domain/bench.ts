import { DOOR_IDS } from './doors';
import type {
  BenchEvent,
  BenchSnapshot,
  Direction,
  DoorId,
  DoorSnapshot,
  EventTone,
  InputSource,
  StopReason,
} from './types';

/** 全行程耗时（秒），用于换算最大速度 */
const FULL_TRAVEL_SECONDS = 3.4;
const MAX_SPEED = 100 / FULL_TRAVEL_SECONDS;
/** 速度平滑时间常数，模拟起步/停止的缓动（手动松开与自动中断共用） */
const VELOCITY_TAU = 0.1;
/** 同向二次按下触发自动模式的窗口 */
const AUTO_GAP_MS = 400;
const LIMIT_EPS = 0.4;
const MAX_EVENTS = 60;

interface DoorLife {
  id: DoorId;
  position: number;
  /** %/s，正值为开窗方向 */
  velocity: number;
  /** 当前输入给定的目标方向；null = 无输入 */
  drive: Direction | null;
  auto: boolean;
  session: { from: number; at: number } | null;
  stopReason: StopReason | null;
  lastRelease: { dir: Direction; at: number } | null;
}

export class WindowBench {
  private doors: Record<DoorId, DoorLife>;
  private events: BenchEvent[] = [];
  private listeners = new Set<() => void>();
  private snapshot: BenchSnapshot;
  private raf = 0;
  private lastFrame = 0;
  private seq = 0;

  constructor() {
    const doors = {} as Record<DoorId, DoorLife>;
    for (const id of DOOR_IDS) {
      doors[id] = {
        id,
        position: 100,
        velocity: 0,
        drive: null,
        auto: false,
        session: null,
        stopReason: null,
        lastRelease: null,
      };
    }
    this.doors = doors;
    this.snapshot = this.build();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  destroy = () => {
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
  };

  press(id: DoorId, dir: Direction, source: InputSource, stage: 'manual' | 'auto' = 'manual') {
    const door = this.doors[id];
    const now = performance.now();
    const label = dir === 'DOWN' ? '开窗' : '关窗';
    const stageLabel = stage === 'auto' ? '自动档' : '手动档';
    const atLimit = dir === 'DOWN' ? door.position <= LIMIT_EPS : door.position >= 100 - LIMIT_EPS;

    this.log('command', id, `按下 · ${label} · ${stageLabel}`, `${sourceLabel(source)}输入`);

    // 自动运行中：任何再次按下（同向或反向）都立即中断，停在当前位置
    if (door.auto && door.drive) {
      this.log('system', id, '自动运行已中断', '再次按下，开始减速停止');
      door.auto = false;
      door.drive = null;
      door.stopReason = 'INTERRUPTED';
      door.lastRelease = null;
      this.notify();
      return;
    }

    if (atLimit) {
      this.log('result', id, `${label}无动作`, '已处于极限位置');
      this.notify();
      return;
    }

    // 已在同向运动中再次按下 → 锁存自动模式
    if (door.drive === dir) {
      if (!door.auto) {
        door.auto = true;
        this.log('system', id, '进入自动模式', '同向再次按下，持续到极限位');
      }
      this.notify();
      return;
    }

    const relatch =
      door.lastRelease !== null &&
      door.lastRelease.dir === dir &&
      now - door.lastRelease.at <= AUTO_GAP_MS;

    door.drive = dir;
    door.auto = stage === 'auto' || relatch;
    door.session = { from: door.position, at: now };
    door.stopReason = null;
    if (door.auto) {
      this.log('system', id, '进入自动模式', stage === 'auto' ? '深按自动档' : '同向 0.4 s 内二次按下');
    }
    this.notify();
  }

  release(id: DoorId) {
    const door = this.doors[id];
    if (!door.drive) return;
    door.lastRelease = { dir: door.drive, at: performance.now() };
    if (door.auto) {
      this.log('system', id, '自动模式保持', '松开后继续运行');
      this.notify();
      return;
    }
    door.drive = null;
    door.stopReason = 'RELEASED';
    this.log('command', id, '松开', '输入撤销，开始停止');
    this.notify();
  }

  clearEvents() {
    this.events = [];
    this.notify();
  }

  private frame = (time: number) => {
    const dt = Math.min(0.05, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    this.tick(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private tick(dt: number) {
    let changed = false;
    for (const id of DOOR_IDS) {
      const door = this.doors[id];
      if (door.drive) {
        const target = door.drive === 'UP' ? MAX_SPEED : -MAX_SPEED;
        door.velocity += (target - door.velocity) * Math.min(1, dt / VELOCITY_TAU);
      } else if (Math.abs(door.velocity) > 0.02) {
        door.velocity += (0 - door.velocity) * Math.min(1, dt / VELOCITY_TAU);
      } else {
        continue;
      }
      changed = true;

      door.position += door.velocity * dt;
      if (door.position >= 100) {
        door.position = 100;
        if (door.velocity > 0) this.endSession(door, 'CLOSE_LIMIT');
      } else if (door.position <= 0) {
        door.position = 0;
        if (door.velocity < 0) this.endSession(door, 'OPEN_LIMIT');
      } else if (!door.drive && Math.abs(door.velocity) < 0.25) {
        door.velocity = 0;
        this.endSession(door, door.stopReason ?? 'RELEASED');
      }
    }
    if (changed) this.notify();
  }

  private endSession(door: DoorLife, reason: StopReason) {
    const session = door.session;
    door.drive = null;
    door.velocity = 0;
    door.auto = false;
    door.stopReason = reason;
    if (!session) return;
    door.session = null;
    const duration = (performance.now() - session.at) / 1000;
    const delta = Math.round(Math.abs(door.position - session.from));
    const reasonLabel =
      reason === 'RELEASED'
        ? '手动松开停止'
        : reason === 'INTERRUPTED'
          ? '再次按下中断'
          : reason === 'OPEN_LIMIT'
            ? '到达全开位'
            : '到达全关位';
    const title = reason === 'INTERRUPTED' ? `动作中断 · ${delta}%` : `动作完成 · ${delta}%`;
    this.log(
      'result',
      door.id,
      title,
      `位置 ${Math.round(session.from)}% → ${Math.round(door.position)}% · ${duration.toFixed(
        2,
      )} s · ${reasonLabel}`,
    );
  }

  private log(tone: EventTone, door: DoorId | undefined, title: string, detail?: string) {
    this.events.unshift({
      id: ++this.seq,
      ts: Date.now(),
      tone,
      door,
      title,
      detail,
    });
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
  }

  private build(): BenchSnapshot {
    const doors: DoorSnapshot[] = DOOR_IDS.map((id) => {
      const door = this.doors[id];
      const moving =
        door.drive ?? (Math.abs(door.velocity) > 0.5 ? (door.velocity > 0 ? 'UP' : 'DOWN') : null);
      return {
        id,
        position: door.position,
        moving,
        drive: door.drive,
        auto: door.auto,
      };
    });
    return { doors, events: this.events.slice() };
  }

  private notify() {
    this.snapshot = this.build();
    this.listeners.forEach((listener) => listener());
  }
}

function sourceLabel(source: InputSource): string {
  if (source === 'KEYBOARD') return '键盘';
  if (source === 'HARDWARE') return '硬件';
  return '屏幕';
}
