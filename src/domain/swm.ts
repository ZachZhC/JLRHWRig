/**
 * SWM (Steering Wheel Module) 状态机
 *
 * 两个物理分区：
 *   ┌───────────────┐                     ┌───────────────┐
 *   │  左侧组合开关  │                     │  右侧换挡怀挡  │
 *   └───────────────┘                     └───────────────┘
 *
 * 所有事件分 "按下 press" / "松开 release" 两阶段，MOMENTARY 型
 * 开关松开即回位；LATCHED 型按下则切换锁存状态。
 */

export type Gear = 'P' | 'R' | 'N' | 'D';
export type TurnLever = 'off' | 'left' | 'right';
export type BeamLever = 'off' | 'flash' | 'high';
export type WiperState = 'off' | 'intermittent' | 'wash';

export interface SWMSnapshot {
  /** 锁存档位（右侧怀挡） */
  gear: Gear;
  /** 怀挡当前瞬时位置（可视化用，松手回 center） */
  leverGear: 'center' | 'up1' | 'up2' | 'down1' | 'down2';

  /** 转向灯开关 —— LATCHED */
  turn: TurnLever;

  /** 远光/超车灯 —— Flash MOMENTARY, High LATCHED */
  beam: BeamLever;

  /** 前雨刮按钮 —— 每次 press 触发动作后回 off */
  frontWiper: WiperState;
  /** 后雨刮按钮 —— 每次 press 触发动作后回 off */
  rearWiper: WiperState;

  /** 雾灯 —— LATCHED toggle */
  fog: boolean;
}

type Listener = () => void;

const INITIAL: SWMSnapshot = {
  gear: 'P',
  leverGear: 'center',
  turn: 'off',
  beam: 'off',
  frontWiper: 'off',
  rearWiper: 'off',
  fog: false,
};

export class SWMController {
  private snap: SWMSnapshot = { ...INITIAL };
  private listeners = new Set<Listener>();
  /** 按钮 press 时记录一下，稍后 release 时据此回 off */
  private wiperPressActive: { front: boolean; rear: boolean } = { front: false, rear: false };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SWMSnapshot => {
    return this.snap;
  };

  /** 每次 emit 前浅拷贝 snap，保证 useSyncExternalStore 能检测到变化 */
  private emit() {
    this.snap = { ...this.snap };
    this.listeners.forEach((l) => l());
  }

  /** 模拟完整快照重置（Debug 用） */
  reset() {
    this.snap = { ...INITIAL };
    this.emit();
  }

  // ========== 右侧换挡怀挡（全部 MOMENTARY，档位锁存） ==========

  /** 向上拨入第 1 档（轻拨）→ 档位锁为 N，lever 显示 up1 */
  leverUp1Press() {
    this.snap.leverGear = 'up1';
    this.snap.gear = 'N';
    this.emit();
  }
  leverUp1Release() {
    this.snap.leverGear = 'center';
    this.emit();
  }

  /** 向上拨入第 2 档（重拨）→ 档位锁为 R，lever 显示 up2 */
  leverUp2Press() {
    this.snap.leverGear = 'up2';
    this.snap.gear = 'R';
    this.emit();
  }
  leverUp2Release() {
    this.snap.leverGear = 'center';
    this.emit();
  }

  /** 向下拨入第 1 档（轻拨）→ 档位锁为 N，lever 显示 down1 */
  leverDown1Press() {
    this.snap.leverGear = 'down1';
    this.snap.gear = 'N';
    this.emit();
  }
  leverDown1Release() {
    this.snap.leverGear = 'center';
    this.emit();
  }

  /** 向下拨入第 2 档（重拨）→ 档位锁为 D，lever 显示 down2 */
  leverDown2Press() {
    this.snap.leverGear = 'down2';
    this.snap.gear = 'D';
    this.emit();
  }
  leverDown2Release() {
    this.snap.leverGear = 'center';
    this.emit();
  }

  /** P 按钮按下 */
  pButtonPress() {
    this.snap.gear = 'P';
    this.emit();
  }

  // ========== 左侧组合开关 ==========

  // --- 转向灯（Vertical axis, LATCHED）---
  /** 向上拨 = 右转向灯 */
  turnUpPress() {
    this.snap.turn = this.snap.turn === 'right' ? 'off' : 'right';
    this.emit();
  }
  /** 向下拨 = 左转向灯 */
  turnDownPress() {
    this.snap.turn = this.snap.turn === 'left' ? 'off' : 'left';
    this.emit();
  }

  // --- 远光 / 超车灯（Push/Pull axis）---
  /** 向驾驶员方向拉 = Flash 超车灯（MOMENTARY） */
  flashPress() {
    if (this.snap.beam !== 'high') {
      this.snap.beam = 'flash';
      this.emit();
    }
  }
  flashRelease() {
    if (this.snap.beam === 'flash') {
      this.snap.beam = 'off';
      this.emit();
    }
  }

  /** 向外推 = 远光灯（LATCHED toggle） */
  highBeamPress() {
    this.snap.beam = this.snap.beam === 'high' ? 'off' : 'high';
    this.emit();
  }

  // --- 前雨刮按钮 ---
  /** 轻按 = 点刮 */
  frontWiperLightPress() {
    this.snap.frontWiper = 'intermittent';
    this.wiperPressActive.front = true;
    this.emit();
  }
  frontWiperLightRelease() {
    if (this.wiperPressActive.front) {
      this.wiperPressActive.front = false;
      this.snap.frontWiper = 'off';
      this.emit();
    }
  }
  /** 重按 = 洗涤（按住即洗涤，松开回 off） */
  frontWiperHardPress() {
    this.snap.frontWiper = 'wash';
    this.wiperPressActive.front = true;
    this.emit();
  }
  frontWiperHardRelease() {
    if (this.wiperPressActive.front) {
      this.wiperPressActive.front = false;
      this.snap.frontWiper = 'off';
      this.emit();
    }
  }

  // --- 后雨刮按钮 ---
  rearWiperLightPress() {
    this.snap.rearWiper = 'intermittent';
    this.wiperPressActive.rear = true;
    this.emit();
  }
  rearWiperLightRelease() {
    if (this.wiperPressActive.rear) {
      this.wiperPressActive.rear = false;
      this.snap.rearWiper = 'off';
      this.emit();
    }
  }
  rearWiperHardPress() {
    this.snap.rearWiper = 'wash';
    this.wiperPressActive.rear = true;
    this.emit();
  }
  rearWiperHardRelease() {
    if (this.wiperPressActive.rear) {
      this.wiperPressActive.rear = false;
      this.snap.rearWiper = 'off';
      this.emit();
    }
  }

  // --- 雾灯按钮（toggle）---
  fogPress() {
    this.snap.fog = !this.snap.fog;
    this.emit();
  }
}
