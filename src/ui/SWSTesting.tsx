import { useState, useSyncExternalStore } from 'react';
import { SWSController, LED_COLORS, type LedColor, type SWSSnapshot } from '../domain/sws';
import swsLeft from '../assets/sws_left.png';
import swsRight from '../assets/sws_right.png';
import { CanTrace } from './CanTrace';

const sws = new SWSController();

interface Hotspot {
  id: string;
  label: string;
  x: number;
  y: number;
  size?: number;
}

/** SWSL 左侧热点（基于图标连通域中心精确定位） */
const SWSL_HOTSPOTS: Hotspot[] = [
  // 方向键
  { id: 'sl-up',     label: 'Up',      x: 45.6, y: 41.8, size: 36 },
  { id: 'sl-down',   label: 'Down',    x: 46.0, y: 71.9, size: 36 },
  { id: 'sl-left',   label: 'Left',    x: 31.9, y: 57.0, size: 36 },
  { id: 'sl-right',  label: 'Right',   x: 59.5, y: 56.4, size: 36 },
  { id: 'sl-center', label: 'Confirm', x: 46.4, y: 57.0, size: 40 },
  // 右侧三键
  { id: 'sl-voice',     label: 'Voice',     x: 74.6, y: 38.3, size: 38 },
  { id: 'sl-favourite', label: 'Favourite', x: 74.6, y: 56.5, size: 38 },
  { id: 'sl-phone',     label: 'Phone',     x: 75.0, y: 73.5, size: 38 },
];

/** SWSR 右侧热点（基于图标连通域中心精确定位） */
const SWSR_HOTSPOTS: Hotspot[] = [
  // 中间五键
  { id: 'sr-setplus',  label: 'SET+',    x: 54.3, y: 45.1, size: 36 },
  { id: 'sr-setminus', label: 'SET-',    x: 54.6, y: 77.0, size: 36 },
  { id: 'sr-res',      label: 'RES',     x: 41.8, y: 61.8, size: 36 },
  { id: 'sr-can',      label: 'CAN',     x: 68.1, y: 61.0, size: 36 },
  { id: 'sr-headway',  label: 'Headway', x: 55.0, y: 61.4, size: 40 },
  // 左侧三模式键
  { id: 'sr-da',     label: 'Driver Assist', x: 28.4, y: 43.0, size: 38 },
  { id: 'sr-l3',     label: 'L3 Mode',       x: 28.7, y: 60.7, size: 38 },
  { id: 'sr-cruise', label: 'Cruise Mode',   x: 28.6, y: 76.8, size: 38 },
  { id: 'sr-l2plus', label: 'L2+',           x: 67.7, y: 77.2, size: 36 },
];

/** Light Bar 灯条位置（基于图像分析：绿色像素实际位置） */
const SWSL_LED = { x: 22.4, y: 57.8, w: 3.1, h: 36.5 };
const SWSR_LED = { x: 78.3, y: 62.7, w: 3.2, h: 35.4 };

function pressRelease(press: () => void, release: () => void) {
  return {
    onMouseDown: press,
    onMouseUp: release,
    onMouseLeave: release,
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); press(); },
    onTouchEnd: release,
  };
}

function isActive(id: string, s: SWSSnapshot): boolean {
  switch (id) {
    case 'sl-up':      return s.swslDpad === 'up';
    case 'sl-down':    return s.swslDpad === 'down';
    case 'sl-left':    return s.swslDpad === 'left';
    case 'sl-right':   return s.swslDpad === 'right';
    case 'sl-center':  return s.swslDpad === 'center';
    case 'sl-voice':   return s.swslVoice;
    case 'sl-favourite': return s.swslFavourite;
    case 'sl-phone':   return s.swslPhone;
    case 'sr-setplus': return s.swsrSetPlus;
    case 'sr-setminus':return s.swsrSetMinus;
    case 'sr-res':     return s.swsrRes;
    case 'sr-can':     return s.swsrCan;
    case 'sr-headway': return s.swsrHeadway;
    case 'sr-da':      return s.swsrDriverAssist;
    case 'sr-l3':      return s.swsrL3;
    case 'sr-cruise':  return s.swsrCruise;
    case 'sr-l2plus':  return s.swsrL2Plus;
    default: return false;
  }
}

function bindSwsl(id: string) {
  switch (id) {
    case 'sl-up':      return pressRelease(() => sws.swslUpPress(), () => sws.swslUpRelease());
    case 'sl-down':    return pressRelease(() => sws.swslDownPress(), () => sws.swslDownRelease());
    case 'sl-left':    return pressRelease(() => sws.swslLeftPress(), () => sws.swslLeftRelease());
    case 'sl-right':   return pressRelease(() => sws.swslRightPress(), () => sws.swslRightRelease());
    case 'sl-center':  return pressRelease(() => sws.swslCenterPress(), () => sws.swslCenterRelease());
    case 'sl-voice':   return pressRelease(() => sws.swslVoicePress(), () => sws.swslVoiceRelease());
    case 'sl-favourite': return pressRelease(() => sws.swslFavouritePress(), () => sws.swslFavouriteRelease());
    case 'sl-phone':   return pressRelease(() => sws.swslPhonePress(), () => sws.swslPhoneRelease());
    default: return { onMouseDown:()=>{}, onMouseUp:()=>{}, onMouseLeave:()=>{}, onTouchStart:()=>{}, onTouchEnd:()=>{} };
  }
}

function bindSwsr(id: string) {
  switch (id) {
    case 'sr-setplus': return pressRelease(() => sws.swsrSetPlusPress(), () => sws.swsrSetPlusRelease());
    case 'sr-setminus':return pressRelease(() => sws.swsrSetMinusPress(), () => sws.swsrSetMinusRelease());
    case 'sr-res':     return pressRelease(() => sws.swsrResPress(), () => sws.swsrResRelease());
    case 'sr-can':     return pressRelease(() => sws.swsrCanPress(), () => sws.swsrCanRelease());
    case 'sr-headway': return pressRelease(() => sws.swsrHeadwayPress(), () => sws.swsrHeadwayRelease());
    case 'sr-da':      return pressRelease(() => sws.swsrDriverAssistPress(), () => sws.swsrDriverAssistRelease());
    case 'sr-l3':      return pressRelease(() => sws.swsrL3Press(), () => sws.swsrL3Release());
    case 'sr-cruise':  return pressRelease(() => sws.swsrCruisePress(), () => sws.swsrCruiseRelease());
    case 'sr-l2plus':  return pressRelease(() => sws.swsrL2PlusPress(), () => sws.swsrL2PlusRelease());
    default: return { onMouseDown:()=>{}, onMouseUp:()=>{}, onMouseLeave:()=>{}, onTouchStart:()=>{}, onTouchEnd:()=>{} };
  }
}

export function SWSTesting() {
  const snap = useSyncExternalStore(sws.subscribe, sws.getSnapshot);
  const [hoverL, setHoverL] = useState<string | null>(null);
  const [hoverR, setHoverR] = useState<string | null>(null);

  const ledHex = (c: LedColor) => LED_COLORS.find((x) => x.name === c)?.hex ?? '#1a2330';

  return (
    <div className="sws-page">
      {/* 左半：SWSL */}
      <section className="sws-col" aria-label="SWSL left switch">
        <div className="sws-switch">
          <div className="sws-switch-head"><span className="sws-dot" style={{ background: '#2fd5c3' }} /> SWSL · Left</div>
          <div className="sws-img-wrap">
            <img src={swsLeft} alt="SWSL" className="sws-img" draggable={false} />
            <div
              className="sws-led"
              style={{
                left: `${SWSL_LED.x}%`, top: `${SWSL_LED.y}%`,
                width: `${SWSL_LED.w}%`, height: `${SWSL_LED.h}%`,
                background: snap.swslLed === 'off' ? 'transparent' : ledHex(snap.swslLed),
                boxShadow: snap.swslLed === 'off' ? 'none' : `0 0 14px 4px ${ledHex(snap.swslLed)}aa`,
              }}
            />
            <div className="sws-overlay">
              {SWSL_HOTSPOTS.map((h) => {
                const active = isActive(h.id, snap);
                const bind = bindSwsl(h.id);
                const { onMouseLeave: bl, ...rest } = bind;
                return (
                  <button
                    key={h.id} type="button"
                    className={`hotspot ${active ? 'is-on' : ''} ${hoverL === h.id ? 'is-hover' : ''}`}
                    style={{ left: `${h.x}%`, top: `${h.y}%`, width: h.size, height: h.size, transform: 'translate(-50%,-50%)' }}
                    title={h.label}
                    onMouseEnter={() => setHoverL(h.id)}
                    onMouseLeave={() => { setHoverL(null); bl(); }}
                    {...rest}
                  >
                    {active && <span className="hotspot-glow" />}
                    {hoverL === h.id && <span className="hotspot-label">{h.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <LedControl label="Light Bar" color={snap.swslLed} onChange={(c) => sws.setSwslLed(c)} />
        </div>

        <div className="sws-col-monitors">
          <MonitorPanel title="Light Bar">
            <LedMonitor color={snap.swslLed} />
          </MonitorPanel>
          <MonitorPanel title="Cluster Menu">
            <DpadMonitor dpad={snap.swslDpad} />
          </MonitorPanel>
          <MonitorPanel title="Infotainment">
            <RowMonitor items={[
              { k: 'Voice', v: snap.swslVoice },
              { k: 'Favourite', v: snap.swslFavourite },
              { k: 'Phone', v: snap.swslPhone },
            ]} />
          </MonitorPanel>
        </div>
      </section>

      {/* 右半：SWSR */}
      <section className="sws-col" aria-label="SWSR right switch">
        <div className="sws-switch">
          <div className="sws-switch-head"><span className="sws-dot" style={{ background: '#f2b24c' }} /> SWSR · Right</div>
          <div className="sws-img-wrap">
            <img src={swsRight} alt="SWSR" className="sws-img" draggable={false} />
            <div
              className="sws-led"
              style={{
                left: `${SWSR_LED.x}%`, top: `${SWSR_LED.y}%`,
                width: `${SWSR_LED.w}%`, height: `${SWSR_LED.h}%`,
                background: snap.swsrLed === 'off' ? 'transparent' : ledHex(snap.swsrLed),
                boxShadow: snap.swsrLed === 'off' ? 'none' : `0 0 14px 4px ${ledHex(snap.swsrLed)}aa`,
              }}
            />
            <div className="sws-overlay">
              {SWSR_HOTSPOTS.map((h) => {
                const active = isActive(h.id, snap);
                const bind = bindSwsr(h.id);
                const { onMouseLeave: bl, ...rest } = bind;
                return (
                  <button
                    key={h.id} type="button"
                    className={`hotspot ${active ? 'is-on' : ''} ${hoverR === h.id ? 'is-hover' : ''}`}
                    style={{ left: `${h.x}%`, top: `${h.y}%`, width: h.size, height: h.size, transform: 'translate(-50%,-50%)' }}
                    title={h.label}
                    onMouseEnter={() => setHoverR(h.id)}
                    onMouseLeave={() => { setHoverR(null); bl(); }}
                    {...rest}
                  >
                    {active && <span className="hotspot-glow" />}
                    {hoverR === h.id && <span className="hotspot-label">{h.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <LedControl label="Light Bar" color={snap.swsrLed} onChange={(c) => sws.setSwsrLed(c)} />
        </div>

        <div className="sws-col-monitors">
          <MonitorPanel title="Light Bar">
            <LedMonitor color={snap.swsrLed} />
          </MonitorPanel>
          <MonitorPanel title="ADAS Mode">
            <RowMonitor items={[
              { k: 'Driver Assist', v: snap.swsrDriverAssist },
              { k: 'L3', v: snap.swsrL3 },
              { k: 'Cruise', v: snap.swsrCruise },
            ]} />
          </MonitorPanel>
          <MonitorPanel title="Cruise Control">
            <RowMonitor items={[
              { k: 'SET+', v: snap.swsrSetPlus },
              { k: 'SET-', v: snap.swsrSetMinus },
              { k: 'RES', v: snap.swsrRes },
              { k: 'CAN', v: snap.swsrCan },
              { k: 'Headway', v: snap.swsrHeadway },
              { k: 'L2+', v: snap.swsrL2Plus },
            ]} />
          </MonitorPanel>
        </div>
      </section>

      {/* ===== CAN Trace 窗口（全宽，底部） ===== */}
      <CanTrace page="sws" />
    </div>
  );
}

// ========== 辅助组件 ==========

function MonitorPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="monitor">
      <div className="monitor-head">
        <span className="monitor-dot" />
        <span className="monitor-title">{title}</span>
      </div>
      <div className="monitor-body">{children}</div>
    </div>
  );
}

function DpadMonitor({ dpad }: { dpad: string }) {
  const map: Record<string, string> = { none: '—', up: 'Up', down: 'Down', left: 'Left', right: 'Right', center: 'Confirm' };
  return <div className="monitor-value" key={dpad} style={{ color: dpad === 'none' ? '#5a6a7b' : '#2fd5c3' }}>{map[dpad]}</div>;
}

function RowMonitor({ items }: { items: { k: string; v: boolean }[] }) {
  return (
    <div className="row-monitor">
      {items.map((it) => (
        <div key={it.k} className={`row-item ${it.v ? 'on' : ''}`}>
          <span className="row-dot" />
          <span>{it.k}</span>
        </div>
      ))}
    </div>
  );
}

function LedMonitor({ color }: { color: LedColor }) {
  const hex = LED_COLORS.find((x) => x.name === color)?.hex ?? '#1a2330';
  return (
    <div className="led-monitor">
      <span className="led-swatch" style={{ background: hex, boxShadow: color === 'off' ? 'none' : `0 0 10px ${hex}` }} />
      <span style={{ color: color === 'off' ? '#5a6a7b' : hex }}>{color.toUpperCase()}</span>
    </div>
  );
}

function LedControl({ label, color, onChange }: { label: string; color: LedColor; onChange: (c: LedColor) => void }) {
  return (
    <div className="led-control">
      <span className="led-ctrl-label">{label}</span>
      <div className="led-palette">
        {LED_COLORS.map((c) => (
          <button
            key={c.name} type="button"
            className={`led-chip ${color === c.name ? 'active' : ''}`}
            style={{ background: c.hex }}
            title={c.label}
            onClick={() => onChange(c.name)}
          />
        ))}
      </div>
    </div>
  );
}
