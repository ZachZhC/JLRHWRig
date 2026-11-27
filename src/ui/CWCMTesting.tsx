/**
 * CWCM Testing —— USB 充电模块（LIN15 真实链路）
 *
 * 台架上 XL2 作为 LIN 主节点，WCCM 是从节点（NAD 0x02）：
 *   - 充电中 = 持续 0x26 下发 + 0x27 回读（= LIN 通讯正常）
 *   - 充电结束 = 0x3C 休眠指令
 *   - 背光 / ElPowerStatus / LimitedPowerMode 走 0x26
 *   - 零件号 / 序列号来自 0x27 分块回传
 *
 * 页面没有任何模拟数据：通道未开就显示未连接，模块没报就显示 —。
 */
import { useSyncExternalStore } from 'react';
import cwcmImg from '../assets/cwcm.png';
import { EL_POWER_OPTIONS, WCCM_CHANNEL, cwcmLink } from '../domain/cwcmLink';
import { BACKLIGHT_FAULT } from '../domain/cwcm';

const ACCENT = '#2fd5c3';

/** 四个 USB 输出口的接插件外框（相对原图百分比，按像素标定） */
const USB_PORTS = [
  { id: 'p1', left: 45.08, top: 85.49, w: 6.83, h: 7.96 },
  { id: 'p2', left: 53.96, top: 85.49, w: 6.39, h: 7.96 },
  { id: 'p3', left: 61.31, top: 85.49, w: 6.75, h: 7.96 },
  { id: 'p4', left: 76.65, top: 85.49, w: 6.46, h: 7.96 },
];

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

export function CWCMTesting() {
  const snap = useSyncExternalStore(cwcmLink.subscribe, cwcmLink.getSnapshot);
  const live = snap.link === 'open';
  const ready = live && snap.running;
  const fault = snap.req.backlightIntensity === BACKLIGHT_FAULT;

  // 端口 LED = 主节点按 0x26 指令出来的状态（供应商 LED 背光逻辑图）：
  // 休眠 / LimitedPowerMode=1 / ElPowerStatus=ShutDown → 模块强制 0%；
  // BacklightStatus=0 → 0%；255 = Error Status，模块不下发 PWM，LED 停在上一档有效亮度。
  const portsEnabled = snap.req.limitedPowerMode === 0 && snap.req.elPowerStatus !== 'ShutDown';
  const pwmIntensity = fault ? snap.lastPwmIntensity : snap.req.backlightIntensity;
  const ledLevel =
    snap.running && portsEnabled && snap.req.backlightStatus === 1
      ? Math.min(1, pwmIntensity / 254)
      : 0;

  const linkText =
    snap.link === 'open'
      ? 'LIN 已连接'
      : snap.link === 'connecting'
        ? '连接中…'
        : snap.link === 'error'
          ? '连接失败'
          : 'LIN 未连接';

  return (
    <div className="swm-page">
      {/* ===== 上半：CWCM 实物图 + 链路状态 ===== */}
      <section className="swm-stage cwcm-stage" aria-label="CWCM USB 充电模块视图">
        <div className="cwcm-head">
          <span className="cwcm-module-name">CWCM - Central Wired Charging Module</span>
          <div className="cwcm-head-actions">
            <span
              className={`cwcm-link-state ${live ? 'is-open' : snap.link === 'error' ? 'is-err' : ''}`}
              title={snap.linkError ?? `通道 ${WCCM_CHANNEL} · 19.2 kbps · 主节点`}
            >
              {linkText}
            </span>
            <button
              type="button"
              className={`cwcm-enable ${live ? 'is-on' : ''}`}
              onClick={() => (live ? cwcmLink.disconnect() : cwcmLink.connect())}
              disabled={snap.link === 'connecting'}
            >
              <span className="cwcm-enable-dot" />
              <span className="cwcm-enable-label">{live ? '断开' : '连接'}</span>
            </button>
            <button
              type="button"
              role="switch"
              className={`cwcm-power ${snap.running ? 'is-on' : ''}`}
              onClick={() => cwcmLink.setCharging(!snap.running)}
              disabled={!live}
              aria-checked={snap.running}
              title={
                !live
                  ? '先连接 LIN 通道'
                  : snap.running
                    ? '充电中：主节点按 70 ms 调度 0x26 / 0x27，端口按信号开关'
                    : '关闭充电：发送 0x3C 休眠（充电停 · LED 灭）'
              }
            >
              <span className="cwcm-power-label">充电</span>
              <span className="cwcm-power-track" aria-hidden="true">
                <span className="cwcm-power-knob" />
              </span>
              <strong className="cwcm-power-state">{snap.running ? 'ON' : 'OFF'}</strong>
            </button>
          </div>
        </div>

        <div className="cwcm-body">
          <div className="cwcm-img-wrap">
            <img className="cwcm-img" src={cwcmImg} alt="CWCM USB 充电模块" />
            <div className="swm-overlay">
              {USB_PORTS.map((p) => (
                <span
                  key={p.id}
                  className="usb-port"
                  style={{
                    left: `${p.left}%`,
                    top: `${p.top}%`,
                    width: `${p.w}%`,
                    height: `${p.h}%`,
                    opacity: ledLevel,
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          {/* 链路与模块回读（全部来自 LIN 实际收发） */}
          <div className="cwcm-readouts" aria-label="CWCM 链路状态">
            <div className="cwcm-readout">
              <span className="cwcm-readout-label">LIN Charging</span>
              <span className={`cwcm-readout-value ${snap.running ? 'is-on' : ''}`}>
                {snap.running ? 'ACTIVE' : snap.sleeping ? 'SLEEP' : 'OFF'}
              </span>
              <span className="cwcm-readout-hint">
                {snap.running
                  ? '0x26 / 0x27 · 70 ms 调度'
                  : snap.sleeping
                    ? '0x3C 休眠 · 充电停'
                    : '开关 OFF · 未调度'}
              </span>
            </div>
            <div className={`cwcm-readout ${snap.misses > 0 && snap.running ? 'is-warn' : ''}`}>
              <span className="cwcm-readout-label">Module Reply</span>
              <span className={`cwcm-readout-value ${snap.rx > 0 ? 'is-on' : ''}`}>
                {snap.rx} <em>帧</em>
              </span>
              <span className={`cwcm-readout-hint ${snap.misses > 0 ? 'is-err' : ''}`}>
                {snap.misses > 0
                  ? `未应答 ${snap.misses}`
                  : snap.lastResHex
                    ? snap.lastResHex
                    : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 下半：信息 / 控制 ===== */}
      <section className="swm-monitors cwcm-monitors" aria-label="CWCM 信息与控制">
        {/* WCCM 信息回传（0x27） */}
        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">WCCM Info Report</span>
          </div>
          <div className="wccm-fields">
            <div className="wccm-field">
              <span className="pw-label">WCCM Part Number</span>
              <span className="wccm-val" title={snap.partNo}>
                {snap.partNo || '—'}
              </span>
            </div>
            <div className="wccm-field">
              <span className="pw-label">WCCM Serial Number</span>
              <span className="wccm-val" title={snap.serialNo}>
                {snap.serialNo || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* 功率控制（LIN 信号） */}
        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">Power Control</span>
          </div>
          <div className="pw-rows">
            <div className="pw-row">
              <span className="pw-label">EIPowerStatus</span>
              <select
                className="pw-select"
                value={snap.req.elPowerStatus}
                onChange={(e) => cwcmLink.setElPowerStatus(e.target.value as (typeof EL_POWER_OPTIONS)[number])}
                disabled={!ready}
              >
                {EL_POWER_OPTIONS.map((o) => (
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
                value={String(snap.req.limitedPowerMode)}
                onChange={(e) => cwcmLink.setLimitedPowerMode(Number(e.target.value) as 0 | 1)}
                disabled={!ready}
              >
                <option value="0">False</option>
                <option value="1">True</option>
              </select>
            </div>
          </div>
        </div>

        {/* LED 背光（LIN 信号） */}
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
                className={`bl-switch ${snap.req.backlightStatus ? 'is-on' : ''}`}
                onClick={() => cwcmLink.setBacklightStatus(snap.req.backlightStatus ? 0 : 1)}
                aria-pressed={snap.req.backlightStatus === 1}
                disabled={!ready}
              >
                {snap.req.backlightStatus ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="pw-row">
              <span className="pw-label">Backlight Intensity</span>
              <span className={`pw-value ${fault ? 'is-fault' : snap.req.backlightIntensity > 0 ? 'is-on' : ''}`}>
                {snap.req.backlightIntensity}
                {fault && <em className="fault-tag">Fault Condition Present</em>}
              </span>
            </div>
            <input
              className="bl-range"
              type="range"
              min={0}
              max={255}
              step={1}
              value={snap.req.backlightIntensity}
              onChange={(e) => cwcmLink.setBacklightIntensity(Number(e.target.value))}
              aria-label="Backlight Intensity"
              disabled={!ready}
            />
          </div>
        </div>
      </section>

      {/* LIN Trace（0x26 / 0x27 / 0x3C 实际收发） */}
      <div className="sws-trace cwcm-trace">
        <div className="sws-trace-head">
          <span className="sws-trace-dot" />
          <span className="sws-trace-title">LIN Trace</span>
          <span className="sws-trace-sub">
            TX＝主节点下发 · RX＝WCCM 应答 · TX {snap.tx} / RX {snap.rx}
            {snap.misses > 0 ? ` · 未应答 ${snap.misses}` : ''}
          </span>
          <button
            type="button"
            className="ghost bta-clear"
            onClick={() => cwcmLink.clearFrames()}
            disabled={snap.frames.length === 0}
          >
            清空
          </button>
        </div>
        <div className="sws-trace-body">
          {snap.frames.length === 0 ? (
            <div className="sws-trace-empty">
              {!live
                ? (snap.link === 'error' && snap.linkError
                    ? snap.linkError
                    : `未连接 —— 先点「连接」打开 ${WCCM_CHANNEL}（XL2 主节点 19.2 kbps）`)
                : snap.running
                  ? 'LIN 通讯中，等待 0x27 应答…'
                  : snap.sleeping
                    ? '模块已休眠（0x3C 已发），把「充电」拨到 ON 恢复'
                    : '已连接，把「充电」拨到 ON 开始调度'}
            </div>
          ) : (
            <ul className="bta-frames">
              {snap.frames.map((f) => (
                <li key={f.key} className={`bta-frame is-${f.tone}`} title={f.detail}>
                  <span className="bta-t">{fmtTime(f.ts)}</span>
                  <span className="bta-dir">{f.dir}</span>
                  <span className="bta-hex">{f.idText}</span>
                  <span className="bta-name">{f.name}</span>
                  <span className="bta-detail">{f.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}