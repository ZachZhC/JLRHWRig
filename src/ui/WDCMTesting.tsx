/**
 * WDCM Testing —— 无线充电模块
 * 实物图为透视校正后的正俯视图（src/assets/wdcm.png，1362×697）。
 *
 * NFC 动画：检测到 NFC 时，一张卡片落到线圈圆盘中央并停留，配循环扩散的青色涟漪。
 * FOD 动画（异物检测）：检测到异物时，一枚金属币落到线圈上并停留，配琥珀色告警涟漪；
 * 与 NFC 图层可同时出现（手机在充、硬币/钥匙落在上面），两套触发目前都用按钮 + 快捷键模拟，
 * CAN 信号到位后把 setNfc / setFod 换成信号驱动即可，动画本身不用改。
 *
 * 充电档位与 Phone As Key 目前只做前端：档位由测试人员手动选，
 * 握手状态判定逻辑都等信号定义到位，届时把这里的 useState 换成状态机快照。
 */
import { useEffect, useState } from 'react';
import wdcmImg from '../assets/wdcm.png';
import coinImg from '../assets/uk-one-pound.png';

const ACCENT = '#2fd5c3';

/**
 * 线圈圆盘（NFC 感应区）在实物图上的位置，相对原图百分比。
 * 中心 = 沿上下左右走查暗槽取中点，直径 = 左右暗槽间距 532px / 图宽 1362px。
 */
const COIL = { left: 41.5, top: 58.8, width: 39.06 };

/** 充电功率档位，0 = 关闭 */
const GEARS = [25, 15, 5, 0] as const;
type Gear = (typeof GEARS)[number];

/** Phone As Key 握手状态 */
type Handshake = 'pending' | 'ok' | 'fail';
const HANDSHAKE_TEXT: Record<Handshake, string> = {
  pending: 'PENDING',
  ok: 'SUCCEEDED',
  fail: 'FAILED',
};
/** 逻辑未定，先让点击在三种状态间循环，方便演示 */
const HANDSHAKE_NEXT: Record<Handshake, Handshake> = {
  pending: 'ok',
  ok: 'fail',
  fail: 'pending',
};

export function WDCMTesting() {
  const [nfc, setNfc] = useState(false);
  const [fod, setFod] = useState(false);
  const [gear, setGear] = useState<Gear>(0);
  const [handshake, setHandshake] = useState<Handshake>('pending');

  // 本组件只在 WDCM Tab 挂载，监听随卸载一起销毁，不会串到别的页面
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        setNfc((v) => !v);
      } else if (key === 'f') {
        event.preventDefault();
        setFod((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="swm-page">
      {/* ===== 上半：实物图片舞台 ===== */}
      <section className="swm-stage wdcm-stage" aria-label="WDCM wireless charging module view">
        <div className="wdcm-head">
          <span className="wdcm-module-name">WDCM - Wireless Charging Module</span>
          <button
            type="button"
            className={`wdcm-enable ${nfc ? 'is-on' : ''}`}
            onClick={() => setNfc((v) => !v)}
            aria-pressed={nfc}
            title="Simulate NFC detection (hotkey N)"
          >
            <span className="wdcm-enable-dot" />
            <span className="wdcm-enable-label">NFC Detect</span>
            <strong className="wdcm-enable-state">{nfc ? 'DETECTED' : 'IDLE'}</strong>
          </button>
          <button
            type="button"
            className={`wdcm-enable wdcm-fod-enable ${fod ? 'is-on' : ''}`}
            onClick={() => setFod((v) => !v)}
            aria-pressed={fod}
            title="Simulate FOD detection (hotkey F)"
          >
            <span className="wdcm-enable-dot" />
            <span className="wdcm-enable-label">FOD Detect</span>
            <strong className="wdcm-enable-state">{fod ? 'DETECTED' : 'IDLE'}</strong>
          </button>
        </div>

        <div className="wdcm-img-wrap">
          <img className="wdcm-img" src={wdcmImg} alt="WDCM wireless charging module" />
          <div className="swm-overlay">
            <div
              className={`wdcm-coil ${nfc ? 'is-on' : ''} ${fod ? 'is-fod' : ''}`}
              style={{
                left: `${COIL.left}%`,
                top: `${COIL.top}%`,
                width: `${COIL.width}%`,
              }}
              aria-hidden={!nfc && !fod}
            >
              <span className="nfc-halo" />
              <span className="nfc-ripple" />
              <span className="nfc-ripple nfc-ripple-2" />
              <span className="nfc-ripple nfc-ripple-3" />
              <div className="nfc-card">
                <span className="nfc-chip" />
                <svg className="nfc-waves" viewBox="0 0 32 32" aria-hidden="true">
                  <path d="M8 10v12" />
                  <path d="M13.5 11a8 8 0 0 1 0 10" />
                  <path d="M18 8a13 13 0 0 1 0 16" />
                  <path d="M22.5 5a18 18 0 0 1 0 22" />
                </svg>
              </div>
              <span className="nfc-flag">NFC detected</span>
              {/* FOD 图层：金属异物 + 琥珀告警涟漪，DOM 在卡片之后，同开时压在手机上 */}
              <span className="fod-halo" />
              <span className="fod-ripple" />
              <span className="fod-ripple fod-ripple-2" />
              <span className="fod-ripple fod-ripple-3" />
              <div className="fod-object">
                <img className="fod-coin-img" src={coinImg} alt="" aria-hidden="true" />
              </div>
              <span className="fod-flag">Foreign object · FOD</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 下半：控制台下发 + 状态监控 ===== */}
      <section
        className="swm-monitors"
        aria-label="WDCM input state"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
      >
        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">Charging</span>
          </div>
          <div className="monitor-body">
            <div className="wdcm-gears" role="radiogroup" aria-label="Charging power level">
              {GEARS.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={gear === g}
                  className={`wdcm-gear ${gear === g ? 'is-sel' : ''} ${g === 0 ? 'is-off' : ''}`}
                  onClick={() => setGear(g)}
                  title="Selected manually by the tester; live signal pending"
                >
                  {g === 0 ? 'OFF' : `${g}W`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">Phone As Key</span>
          </div>
          <div className="monitor-body">
            <div className="wdcm-pak">
              <span className="pw-label">Handshake</span>
              <button
                type="button"
                className={`wdcm-pak-state is-${handshake}`}
                onClick={() => setHandshake(HANDSHAKE_NEXT[handshake])}
                title="Decision logic pending signal; click to cycle the state"
              >
                {HANDSHAKE_TEXT[handshake]}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CAN Trace */}
      <div className="sws-trace">
        <div className="sws-trace-head">
          <span className="sws-trace-dot" />
          <span className="sws-trace-title">CAN Trace</span>
          <span className="sws-trace-sub">· frame monitor (signals pending)</span>
        </div>
        <div className="sws-trace-body">
          <div className="sws-trace-empty">Waiting for CAN signals…</div>
        </div>
      </div>
    </div>
  );
}
