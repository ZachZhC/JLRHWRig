/**
 * SWS (Steering Wheel Switch) 状态机
 *
 * 左右两个开关模块：
 *   SWSL (左)：LED + 方向键(上下左右+确认) + Voice/Favourite/Phone
 *   SWSR (右)：LED + SET+/SET-/RES/CAN/Headway + Driver Assist/L3/Cruise + L2+
 *
 * 所有按键为 MOMENTARY 瞬时型（按下点亮，松开熄灭），
 * LED 灯条为状态型（设定颜色后保持）。
 */

export type LedColor = 'off' | 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'white';

export interface SWSSnapshot {
  // ===== SWSL 左侧 =====
  swslLed: LedColor;
  swslDpad: 'none' | 'up' | 'down' | 'left' | 'right' | 'center';
  swslVoice: boolean;
  swslFavourite: boolean;
  swslPhone: boolean;

  // ===== SWSR 右侧 =====
  swsrLed: LedColor;
  swsrSetPlus: boolean;
  swsrSetMinus: boolean;
  swsrRes: boolean;
  swsrCan: boolean;
  swsrHeadway: boolean;
  swsrDriverAssist: boolean;
  swsrL3: boolean;
  swsrCruise: boolean;
  swsrL2Plus: boolean;
}

type Listener = () => void;

const INITIAL: SWSSnapshot = {
  swslLed: 'off',
  swslDpad: 'none',
  swslVoice: false,
  swslFavourite: false,
  swslPhone: false,
  swsrLed: 'off',
  swsrSetPlus: false,
  swsrSetMinus: false,
  swsrRes: false,
  swsrCan: false,
  swsrHeadway: false,
  swsrDriverAssist: false,
  swsrL3: false,
  swsrCruise: false,
  swsrL2Plus: false,
};

export class SWSController {
  private snap: SWSSnapshot = { ...INITIAL };
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SWSSnapshot => this.snap;

  private emit() {
    this.snap = { ...this.snap };
    this.listeners.forEach((l) => l());
  }

  reset() {
    this.snap = { ...INITIAL };
    this.emit();
  }

  // ========== LED 灯条（状态型） ==========
  setSwslLed(color: LedColor) { this.snap.swslLed = color; this.emit(); }
  setSwsrLed(color: LedColor) { this.snap.swsrLed = color; this.emit(); }

  // ========== SWSL 方向键（MOMENTARY） ==========
  swslUpPress()    { this.snap.swslDpad = 'up'; this.emit(); }
  swslUpRelease()  { if (this.snap.swslDpad === 'up') { this.snap.swslDpad = 'none'; this.emit(); } }
  swslDownPress()  { this.snap.swslDpad = 'down'; this.emit(); }
  swslDownRelease(){ if (this.snap.swslDpad === 'down') { this.snap.swslDpad = 'none'; this.emit(); } }
  swslLeftPress()  { this.snap.swslDpad = 'left'; this.emit(); }
  swslLeftRelease(){ if (this.snap.swslDpad === 'left') { this.snap.swslDpad = 'none'; this.emit(); } }
  swslRightPress() { this.snap.swslDpad = 'right'; this.emit(); }
  swslRightRelease(){ if (this.snap.swslDpad === 'right') { this.snap.swslDpad = 'none'; this.emit(); } }
  swslCenterPress(){ this.snap.swslDpad = 'center'; this.emit(); }
  swslCenterRelease(){ if (this.snap.swslDpad === 'center') { this.snap.swslDpad = 'none'; this.emit(); } }

  // ========== SWSL 右侧三键（MOMENTARY） ==========
  swslVoicePress()     { this.snap.swslVoice = true; this.emit(); }
  swslVoiceRelease()   { this.snap.swslVoice = false; this.emit(); }
  swslFavouritePress() { this.snap.swslFavourite = true; this.emit(); }
  swslFavouriteRelease(){ this.snap.swslFavourite = false; this.emit(); }
  swslPhonePress()     { this.snap.swslPhone = true; this.emit(); }
  swslPhoneRelease()   { this.snap.swslPhone = false; this.emit(); }

  // ========== SWSR 中间五键（MOMENTARY） ==========
  swsrSetPlusPress()   { this.snap.swsrSetPlus = true; this.emit(); }
  swsrSetPlusRelease() { this.snap.swsrSetPlus = false; this.emit(); }
  swsrSetMinusPress()  { this.snap.swsrSetMinus = true; this.emit(); }
  swsrSetMinusRelease(){ this.snap.swsrSetMinus = false; this.emit(); }
  swsrResPress()       { this.snap.swsrRes = true; this.emit(); }
  swsrResRelease()     { this.snap.swsrRes = false; this.emit(); }
  swsrCanPress()       { this.snap.swsrCan = true; this.emit(); }
  swsrCanRelease()     { this.snap.swsrCan = false; this.emit(); }
  swsrHeadwayPress()   { this.snap.swsrHeadway = true; this.emit(); }
  swsrHeadwayRelease() { this.snap.swsrHeadway = false; this.emit(); }

  // ========== SWSR 左侧三模式键（MOMENTARY） ==========
  swsrDriverAssistPress()  { this.snap.swsrDriverAssist = true; this.emit(); }
  swsrDriverAssistRelease(){ this.snap.swsrDriverAssist = false; this.emit(); }
  swsrL3Press()            { this.snap.swsrL3 = true; this.emit(); }
  swsrL3Release()          { this.snap.swsrL3 = false; this.emit(); }
  swsrCruisePress()        { this.snap.swsrCruise = true; this.emit(); }
  swsrCruiseRelease()      { this.snap.swsrCruise = false; this.emit(); }
  swsrL2PlusPress()        { this.snap.swsrL2Plus = true; this.emit(); }
  swsrL2PlusRelease()      { this.snap.swsrL2Plus = false; this.emit(); }
}

export const LED_COLORS: { name: LedColor; hex: string; label: string }[] = [
  { name: 'off',    hex: '#1a2330', label: 'OFF' },
  { name: 'red',    hex: '#ff4444', label: '红' },
  { name: 'green',  hex: '#2fd5c3', label: '绿' },
  { name: 'blue',   hex: '#4d8bff', label: '蓝' },
  { name: 'yellow', hex: '#f2b24c', label: '黄' },
  { name: 'purple', hex: '#b56bff', label: '紫' },
  { name: 'white',  hex: '#ffffff', label: '白' },
];
