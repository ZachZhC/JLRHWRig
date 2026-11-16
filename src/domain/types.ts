export type DoorId = 'FL' | 'FR' | 'RL' | 'RR';

/** UP = 关窗(玻璃上升)，DOWN = 开窗(玻璃下降) */
export type Direction = 'UP' | 'DOWN';

/** 输入来源，后续接入树莓派 GPIO 时新增 HARDWARE */
export type InputSource = 'SCREEN' | 'KEYBOARD' | 'HARDWARE';

export type StopReason = 'RELEASED' | 'OPEN_LIMIT' | 'CLOSE_LIMIT' | 'INTERRUPTED';

export type EventTone = 'command' | 'result' | 'system';

export interface BenchEvent {
  id: number;
  /** 墙钟时间，用于日志展示 */
  ts: number;
  tone: EventTone;
  door?: DoorId;
  title: string;
  detail?: string;
}

export interface DoorSnapshot {
  id: DoorId;
  /** 0 = 全开（玻璃在最下），100 = 全关（玻璃升到顶） */
  position: number;
  /** 物理运动方向（含惯性减速段） */
  moving: Direction | null;
  /** 当前输入给定方向（用于按键高亮，不包含惯性） */
  drive: Direction | null;
  auto: boolean;
}

export interface BenchSnapshot {
  doors: DoorSnapshot[];
  events: BenchEvent[];
}
