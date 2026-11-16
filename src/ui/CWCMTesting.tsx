/**
 * CWCM Testing —— USB 充电模块
 * 通过 LIN 信号控制充电开启/关闭、功率、背光。
 * 四个 USB 输出口（下方中间 3 个 + 右下 1 个）不可单独控制，
 * 充电使能时一并点亮提示。
 *
 * 控制台下发（LIN）：
 *   - External Power Limit / EIPowerStatus / LimitedPowerMode
 *   - Backlight Status：0=OFF，1=ON
 *   - Backlight Intensity：0-254 有效，255=Fault Condition Present
 * 模块回传（只读监控）：
 *   - Internal Power Level / Actual Power Level
 *   - WCCM Part Number / Serial Number
 */
import { useEffect, useState } from 'react';
import cwcmImg from '../assets/cwcm.png';

const ACCENT = '#2fd5c3';

/** 四个 USB 输出口的接插件外框（相对原图百分比，按像素标定） */
const USB_PORTS = [
  { id: 'p1', left: 45.08, top: 85.49, w: 6.83, h: 7.96 },
  { id: 'p2', left: 53.96, top: 85.49, w: 6.39, h: 7.96 },
  { id: 'p3', left: 61.31, top: 85.49, w: 6.75, h: 7.96 },
  { id: 'p4', left: 76.65, top: 85.49, w: 6.46, h: 7.96 },
];

/** 功率档位（外部输入限值） */
const POWER_LEVELS = [400, 240, 60, 0] as const;

/** CWCM 上报的内部输出档位（模拟：使能时为额定最大档位） */
const INTERNAL_LEVEL = 400;

const EI_POWER_STATUS = ['Keep Active', 'WarningLowBatteryVolt', 'ShutDown', 'NotUsed'] as const;
const LIMITED_POWER_MODE = ['False', 'True'] as const;

/** WCCM 回传信息占位（预留 24 字符长度，待 LIN 报文填充） */
const WCCM_PART_NUMBER = '';
const WCCM_SERIAL_NUMBER = '';
const EMPTY_24 = '-'.repeat(24);

const FAULT_INTENSITY = 255;

export function CWCMTesting() {
  const [charging, setCharging] = useState(false);
  const [extLimit, setExtLimit] = useState<number>(400);
  const [eiPowerStatus, setEiPowerStatus] = useState<string>('Keep Active');
  const [limitedPowerMode, setLimitedPowerMode] = useState<string>('False');

  const [backlightOn, setBacklightOn] = useState(false);
  const [intensity, setIntensity] = useState(128);
  const [actual, setActual] = useState(0);

  // 内部输出档位与外部输入限值相互独立，均由 CWCM 上报 / 控制台下发
  const internal = charging ? INTERNAL_LEVEL : 0;
  const fault = intensity === FAULT_INTENSITY;

  // Actual 上限 = min(External Power Limit, Internal Power Level)
  const upperLimit = Math.min(extLimit, internal);
  // 收到超过上限的 Actual 值即为异常
  const overLimit = charging && internal > 0 && actual > upperLimit;

  // 实际输出功率（CWCM 上报，整数）：在 0 ~ Internal 之间随机游走
  useEffect(() => {
    if (!charging || internal === 0) {
      setActual(0);
      return;
    }
    let v = Math.round(internal * 0.8);
    setActual(v);
    const id = window.setInterval(() => {
      v = Math.max(0, Math.min(internal, v + Math.round((Math.random() - 0.5) * 40)));
      setActual(v);
    }, 1200);
    return () => window.clearInterval(id);
  }, [charging, internal]);

  return (
    <div className="swm-page">
      {/* ===== 上半：CWCM 实物图 + 输出监控 ===== */}
      <section className="swm-stage cwcm-stage" aria-label="CWCM USB 充电模块视图">
        <div className="cwcm-head">
          <span className="cwcm-module-name">CWCM - Central Wired Charging Module</span>
          <button
            type="button"
            className={`cwcm-enable ${charging ? 'is-on' : ''}`}
            onClick={() => setCharging((v) => !v)}
            aria-pressed={charging}
          >
            <span className="cwcm-enable-dot" />
            <span className="cwcm-enable-label">充电使能</span>
            <strong className="cwcm-enable-state">{charging ? 'ON' : 'OFF'}</strong>
          </button>
        </div>

        <div className="cwcm-body">
          <div className="cwcm-img-wrap">
            <img className="cwcm-img" src={cwcmImg} alt="CWCM USB 充电模块" />
            <div className="swm-overlay">
              {USB_PORTS.map((p) => (
                <span
                  key={p.id}
                  className={`usb-port ${charging ? 'is-lit' : ''}`}
                  style={{
                    left: `${p.left}%`,
                    top: `${p.top}%`,
                    width: `${p.w}%`,
                    height: `${p.h}%`,
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          {/* CWCM 输出的功率监控（只读） */}
          <div className="cwcm-readouts" aria-label="CWCM 输出监控">
            <div className="cwcm-readout">
              <span className="cwcm-readout-label">Internal Power Level</span>
              <span className={`cwcm-readout-value ${internal > 0 ? 'is-on' : ''}`}>
                {internal} <em>W</em>
              </span>
            </div>
            <div className={`cwcm-readout ${overLimit ? 'is-warn' : ''}`}>
              <span className="cwcm-readout-label">
                Actual Power Level
                {overLimit && <em className="warn-tag">WARNING</em>}
              </span>
              <span
                className={`cwcm-readout-value ${overLimit ? 'is-warn' : actual > 0 ? 'is-on' : ''}`}
              >
                {actual} <em>W</em>
              </span>
              <span className="cwcm-readout-hint">
                上限 min(Ext, Int) = {upperLimit} W
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 下半：信息 / 控制 ===== */}
      <section className="swm-monitors cwcm-monitors" aria-label="CWCM 信息与控制">
        {/* WCCM 信息回传 */}
        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">WCCM Info Report</span>
          </div>
          <div className="wccm-fields">
            <div className="wccm-field">
              <span className="pw-label">WCCM Part Number</span>
              <span className="wccm-val">{WCCM_PART_NUMBER || EMPTY_24}</span>
            </div>
            <div className="wccm-field">
              <span className="pw-label">WCCM Serial Number</span>
              <span className="wccm-val">{WCCM_SERIAL_NUMBER || EMPTY_24}</span>
            </div>
          </div>
        </div>

        {/* 功率控制 */}
        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">Power Control</span>
          </div>
          <div className="pw-rows">
            <div className="pw-row">
              <span className="pw-label">External Power Limit</span>
              <select
                className="pw-select"
                value={extLimit}
                onChange={(e) => setExtLimit(Number(e.target.value))}
              >
                {POWER_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv} W
                  </option>
                ))}
              </select>
            </div>
            <div className="pw-row">
              <span className="pw-label">EIPowerStatus</span>
              <select
                className="pw-select"
                value={eiPowerStatus}
                onChange={(e) => setEiPowerStatus(e.target.value)}
              >
                {EI_POWER_STATUS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="pw-row">
              <span className="pw-label">LimitedPowerMode</span>
              <select
                className="pw-select"
                value={limitedPowerMode}
                onChange={(e) => setLimitedPowerMode(e.target.value)}
              >
                {LIMITED_POWER_MODE.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* LED 背光 */}
        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">LED Backlight</span>
          </div>
          <div className="bl-rows">
            <div className="pw-row">
              <span className="pw-label">Backlight Status</span>
              <button
                type="button"
                className={`bl-switch ${backlightOn ? 'is-on' : ''}`}
                onClick={() => setBacklightOn((v) => !v)}
                aria-pressed={backlightOn}
              >
                {backlightOn ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="pw-row">
              <span className="pw-label">Backlight Intensity</span>
              <span className={`pw-value ${fault ? 'is-fault' : intensity > 0 ? 'is-on' : ''}`}>
                {intensity}
                {fault && <em className="fault-tag">Fault Condition Present</em>}
              </span>
            </div>
            <input
              className="bl-range"
              type="range"
              min={0}
              max={255}
              step={1}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              aria-label="Backlight Intensity"
            />
          </div>
        </div>
      </section>

      {/* LIN Trace */}
      <div className="sws-trace cwcm-trace">
        <div className="sws-trace-head">
          <span className="sws-trace-dot" />
          <span className="sws-trace-title">LIN Trace</span>
          <span className="sws-trace-sub">· 报文监控（待接入信号）</span>
        </div>
        <div className="sws-trace-body">
          <div className="sws-trace-empty">等待 LIN 信号接入…</div>
        </div>
      </div>
    </div>
  );
}
