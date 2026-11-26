/**
 * WDCM Testing —— 无线充电模块
 * 实物图为透视校正后的正俯视图（src/assets/wdcm.png，1362×697）。
 *
 * NFC 动画：检测到 NFC 时，一张卡片落到线圈圆盘中央并停留，配循环扩散的青色涟漪。
 * 触发源目前用页面按钮 + N 键模拟，CAN 信号到位后把 setNfc 换成信号驱动即可，
 * 动画本身不用改。
 *
 * 充电档位与 Phone As Key 目前只做前端：档位由测试人员手动选，
 * 握手状态判定逻辑都等信号定义到位，届时把这里的 useState 换成状态机快照。
 */
import { useEffect, useState } from 'react';
import wdcmImg from '../assets/wdcm.png';

const ACCENT = '#2fd5c3';

/**
 * 线圈圆盘（NFC 感应区）在实物图上的位置，相对原图百分比。
 * 中心 = 沿上下左右走查暗槽取中点，直径 = 左右暗槽间距 532px / 图宽 1362px。
 */
const COIL = { left: 41.5, top: 58.8, width: 39.06 };

/** 充电功率档位，0 = 关闭 */
const GEARS = [25, 10, 0] as const;
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
  const [gear, setGear] = useState<Gear>(0);
  const [handshake, setHandshake] = useState<Handshake>('pending');

  // 本组件只在 WDCM Tab 挂载，监听随卸载一起销毁，不会串到别的页面
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'n') return;
      event.preventDefault();
      setNfc((v) => !v);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="swm-page">
      {/* ===== 上半：实物图片舞台 ===== */}
      <section className="swm-stage wdcm-stage" aria-label="WDCM 无线充电模块视图">
        <div className="wdcm-head">
          <span className="wdcm-module-name">WDCM - Wireless Charging Module</span>
          <button
            type="button"
            className={`wdcm-enable ${nfc ? 'is-on' : ''}`}
            onClick={() => setNfc((v) => !v)}
            aria-pressed={nfc}
            title="模拟 NFC 检测（快捷键 N）"
          >
            <span className="wdcm-enable-dot" />
            <span className="wdcm-enable-label">NFC 检测</span>
            <strong className="wdcm-enable-state">{nfc ? 'DETECTED' : 'IDLE'}</strong>
          </button>
        </div>

        <div className="wdcm-img-wrap">
          <img className="wdcm-img" src={wdcmImg} alt="WDCM 无线充电模块" />
          <div className="swm-overlay">
            <div
              className={`wdcm-coil ${nfc ? 'is-on' : ''}`}
              style={{
                left: `${COIL.left}%`,
                top: `${COIL.top}%`,
                width: `${COIL.width}%`,
              }}
              aria-hidden={!nfc}
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
              <span className="nfc-flag">NFC 感应中</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 下半：控制台下发 + 状态监控 ===== */}
      <section
        className="swm-monitors"
        aria-label="WDCM 输入状态"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
      >
        <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
          <div className="monitor-head">
            <span className="monitor-dot" />
            <span className="monitor-title">充电开关 Charging</span>
          </div>
          <div className="monitor-body">
            <div className="wdcm-gears" role="radiogroup" aria-label="充电功率档位">
              {GEARS.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={gear === g}
                  className={`wdcm-gear ${gear === g ? 'is-sel' : ''} ${g === 0 ? 'is-off' : ''}`}
                  onClick={() => setGear(g)}
                  title="测试人员手动选择；仿真信号待接入"
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
                title="判定逻辑待信号接入；点击可模拟切换状态"
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
          <span className="sws-trace-sub">· 报文监控（待接入信号）</span>
        </div>
        <div className="sws-trace-body">
          <div className="sws-trace-empty">等待 CAN 信号接入…</div>
        </div>
      </div>
    </div>
  );
}
