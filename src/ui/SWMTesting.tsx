import { useRef, useState, useSyncExternalStore } from 'react';
import { SWMController, type SWMSnapshot } from '../domain/swm';
import swsImage from '../assets/sws_switch.png';
import { CanTrace } from './CanTrace';

const swm = new SWMController();

/** 热点位置（百分比，相对于图片容器） */
interface Hotspot {
  id: string;
  label: string;
  /** x 百分比 */
  x: number;
  /** y 百分比 */
  y: number;
  /** 尺寸（px） */
  size?: number;
}

/** 所有热点 */
const HOTSPOTS: Hotspot[] = [
  // ===== 右侧怀挡（整体右移）=====
  { id: 'gear-up1',   label: 'Up 1 (N)',   x: 88, y: 32, size: 56 },
  { id: 'gear-up2',   label: 'Up 2 (R)',   x: 88, y: 20, size: 56 },
  { id: 'gear-down1', label: 'Down 1 (N)', x: 88, y: 62, size: 56 },
  { id: 'gear-down2', label: 'Down 2 (D)', x: 88, y: 74, size: 56 },
  { id: 'p-btn',      label: 'P Button',   x: 96, y: 50, size: 52 },

  // ===== 左侧组合开关 =====
  // 管柱上方：转向灯·上(右)、远光灯
  { id: 'turn-up',    label: 'Turn Right',        x: 25, y: 18, size: 44 },
  { id: 'high-beam',  label: 'High Beam (push)',  x: 18, y: 18, size: 40 },

  // 管柱下方：转向灯·下(左)、超车灯 —— 跟上方"隔岸管柱"而立
  { id: 'turn-down',  label: 'Turn Left',         x: 25, y: 82, size: 44 },
  { id: 'flash',      label: 'Flash (pull)',      x: 18, y: 88, size: 40 },

  // 雾灯
  { id: 'fog',        label: 'Fog Light',   x: 15, y: 35, size: 42 },

  // 后雨刮 → 两个档位（上：点刮，下：洗涤）
  { id: 'rear-wp-light',  label: 'Rear Wiper · Mist', x: 6, y: 40, size: 38 },
  { id: 'rear-wp-hard',   label: 'Rear Wiper · Wash', x: 6, y: 52, size: 38 },

  // 前雨刮 → 两个档位（上：点刮，下：洗涤）
  { id: 'front-wp-light', label: 'Front Wiper · Mist', x: 1, y: 70, size: 38 },
  { id: 'front-wp-hard',  label: 'Front Wiper · Wash', x: 1, y: 82, size: 38 },
];

/**
 * MOMENTARY 事件绑定：mousedown → press, mouseup/mouseleave → release
 * LATCHED 型直接 click 触发 toggle
 */
function usePressRelease(
  press: () => void,
  release: () => void,
): { onMouseDown: () => void; onMouseUp: () => void; onMouseLeave: () => void; onTouchStart: (e: React.TouchEvent) => void; onTouchEnd: () => void } {
  return {
    onMouseDown: press,
    onMouseUp: release,
    onMouseLeave: release,
    onTouchStart: (e) => { e.preventDefault(); press(); },
    onTouchEnd: release,
  };
}

/** 这个热点对应的状态是否"亮"（需要显示光晕） */
function isHotspotActive(id: string, s: SWMSnapshot, pFlash: boolean): boolean {
  switch (id) {
    case 'gear-up1':       return s.leverGear === 'up1';
    case 'gear-up2':       return s.leverGear === 'up2';
    case 'gear-down1':     return s.leverGear === 'down1';
    case 'gear-down2':     return s.leverGear === 'down2';
    case 'p-btn':          return pFlash;
    case 'turn-up':        return s.turn === 'right';
    case 'turn-down':      return s.turn === 'left';
    case 'flash':          return s.beam === 'flash';
    case 'high-beam':      return s.beam === 'high';
    case 'front-wp-light': return s.frontWiper === 'intermittent';
    case 'front-wp-hard':  return s.frontWiper === 'wash';
    case 'rear-wp-light':  return s.rearWiper === 'intermittent';
    case 'rear-wp-hard':   return s.rearWiper === 'wash';
    case 'fog':            return s.fog;
    default: return false;
  }
}

export function SWMTesting() {
  const snap = useSyncExternalStore(swm.subscribe, swm.getSnapshot);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pFlash, setPFlash] = useState(false);
  const pTimer = useRef<number | null>(null);

  /** P 按钮瞬时闪烁 300ms（不绑定档位） */
  const flashP = () => {
    setPFlash(true);
    if (pTimer.current) window.clearTimeout(pTimer.current);
    pTimer.current = window.setTimeout(() => setPFlash(false), 300);
  };

  // ===== 热点事件处理 =====
  const bindMomentary = (id: string) => {
    switch (id) {
      case 'gear-up1':       return usePressRelease(() => swm.leverUp1Press(),   () => swm.leverUp1Release());
      case 'gear-up2':       return usePressRelease(() => swm.leverUp2Press(),   () => swm.leverUp2Release());
      case 'gear-down1':     return usePressRelease(() => swm.leverDown1Press(), () => swm.leverDown1Release());
      case 'gear-down2':     return usePressRelease(() => swm.leverDown2Press(), () => swm.leverDown2Release());
      // P 档：单击触发 + 瞬时闪烁，不保持
      case 'p-btn':          return { onMouseDown: () => { swm.pButtonPress(); flashP(); }, onMouseUp: () => {}, onMouseLeave: () => {}, onTouchStart: () => { swm.pButtonPress(); flashP(); }, onTouchEnd: () => {} };
      case 'turn-up':        return { onMouseDown: () => swm.turnUpPress(), onMouseUp: () => {}, onMouseLeave: () => {}, onTouchStart: () => swm.turnUpPress(), onTouchEnd: () => {} };
      case 'turn-down':      return { onMouseDown: () => swm.turnDownPress(), onMouseUp: () => {}, onMouseLeave: () => {}, onTouchStart: () => swm.turnDownPress(), onTouchEnd: () => {} };
      case 'flash':          return usePressRelease(() => swm.flashPress(), () => swm.flashRelease());
      case 'high-beam':      return { onMouseDown: () => swm.highBeamPress(), onMouseUp: () => {}, onMouseLeave: () => {}, onTouchStart: () => swm.highBeamPress(), onTouchEnd: () => {} };
      case 'front-wp-light': return usePressRelease(() => swm.frontWiperLightPress(), () => swm.frontWiperLightRelease());
      case 'front-wp-hard':  return usePressRelease(() => swm.frontWiperHardPress(),  () => swm.frontWiperHardRelease());
      case 'rear-wp-light':  return usePressRelease(() => swm.rearWiperLightPress(),  () => swm.rearWiperLightRelease());
      case 'rear-wp-hard':   return usePressRelease(() => swm.rearWiperHardPress(),   () => swm.rearWiperHardRelease());
      case 'fog':            return { onMouseDown: () => swm.fogPress(), onMouseUp: () => {}, onMouseLeave: () => {}, onTouchStart: () => swm.fogPress(), onTouchEnd: () => {} };
      default:               return { onMouseDown: () => {}, onMouseUp: () => {}, onMouseLeave: () => {}, onTouchStart: () => {}, onTouchEnd: () => {} };
    }
  };

  return (
    <div className="swm-page">
      {/* ===== 上半：图片 + 交互热点 ===== */}
      <section className="swm-stage" aria-label="SWM combination switch view">
        <div className="swm-img-wrap">
          <img src={swsImage} alt="Steering Wheel Module Switch" className="swm-img" draggable={false} />

          {/* 交互层 */}
          <div className="swm-overlay">
            {HOTSPOTS.map((h) => {
              const active = isHotspotActive(h.id, snap, pFlash);
              const bind = bindMomentary(h.id);
              const { onMouseLeave: bindLeave, ...restBind } = bind;
              return (
                <button
                  key={h.id}
                  type="button"
                  className={`hotspot ${active ? 'is-on' : ''} ${hoverId === h.id ? 'is-hover' : ''}`}
                  style={{
                    left: `${h.x}%`,
                    top: `${h.y}%`,
                    width: h.size ? `${h.size}px` : '44px',
                    height: h.size ? `${h.size}px` : '44px',
                    transform: 'translate(-50%, -50%)',
                  }}
                  title={h.label}
                  onMouseEnter={() => setHoverId(h.id)}
                  onMouseLeave={() => { setHoverId(null); bindLeave(); }}
                  {...restBind}
                >
                  {active && <span className="hotspot-glow" />}
                  {hoverId === h.id && <span className="hotspot-label">{h.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== 下半：状态监控面板 ===== */}
      <section className="swm-monitors" aria-label="SWM input state">
        <MonitorPanel title="Gear" accent="#2fd5c3">
          <GearMonitor gear={snap.gear} lever={snap.leverGear} />
        </MonitorPanel>

        <MonitorPanel title="Turn Signal" accent="#2fd5c3">
          <SimpleMonitor value={snap.turn} />
        </MonitorPanel>

        <MonitorPanel title="High Beam / Flash" accent="#2fd5c3">
          <SimpleMonitor value={snap.beam} />
        </MonitorPanel>

        <MonitorPanel title="Front Wiper" accent="#2fd5c3">
          <SimpleMonitor value={snap.frontWiper} />
        </MonitorPanel>

        <MonitorPanel title="Rear Wiper" accent="#2fd5c3">
          <SimpleMonitor value={snap.rearWiper} />
        </MonitorPanel>

        <MonitorPanel title="Fog Light" accent="#2fd5c3">
          <SimpleMonitor value={snap.fog ? 'on' : 'off'} />
        </MonitorPanel>
      </section>

      {/* CAN Trace 窗口 */}
      <CanTrace />
    </div>
  );
}

// ========== 辅助组件 ==========

function MonitorPanel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="monitor" style={{ ['--accent' as any]: accent }}>
      <div className="monitor-head">
        <span className="monitor-dot" />
        <span className="monitor-title">{title}</span>
      </div>
      <div className="monitor-body">{children}</div>
    </div>
  );
}

function SimpleMonitor({ value }: { value: string }) {
  const colorMap: Record<string, string> = {
    P: '#f2b24c', R: '#ff6b6b', N: '#9fe9e0', D: '#7aa2ff',
    off: '#5a6a7b', on: '#e8d96a',
    flash: '#7aa2ff', high: '#b5c6ff',
    left: '#ff8c42', right: '#ff8c42',
    intermittent: '#9fe9e0', wash: '#f2b24c',
  };
  const c = colorMap[value] ?? '#9fe9e0';
  return (
    <div
      key={value}
      className="monitor-value flash"
      style={{ color: c, textShadow: `0 0 12px ${c}55` }}
    >
      {value.toUpperCase()}
    </div>
  );
}

function GearMonitor({ gear, lever }: { gear: string; lever: string }) {
  const gearColors: Record<string, string> = {
    P: '#f2b24c', R: '#ff6b6b', N: '#9fe9e0', D: '#7aa2ff',
  };
  const leverMap: Record<string, string> = {
    center: '—', up1: '↗ 1 detent', up2: '⇧ 2 detents', down1: '↘ 1 detent', down2: '⇩ 2 detents',
  };
  const c = gearColors[gear] ?? '#fff';
  return (
    <div className="gear-monitor">
      <div key={gear} className="gear-big flash" style={{ color: c, textShadow: `0 0 20px ${c}77` }}>
        {gear}
      </div>
      <div key={lever} className="gear-lever flash">Lever: {leverMap[lever]}</div>
    </div>
  );
}

