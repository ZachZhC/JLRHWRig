/**
 * WDCM Testing —— 无线充电模块
 * 通过 CAN 信号控制充电开启/关闭。
 * 当前为骨架页面：实物图片与交互待后续补充。
 */

const ACCENT = '#2fd5c3';

export function WDCMTesting() {
  return (
    <div className="swm-page">
      {/* ===== 上半：实物图片舞台（待补给素材） ===== */}
      <section className="swm-stage" aria-label="WDCM 无线充电模块视图">
        <div className="module-placeholder">
          <span className="module-placeholder-ico">WDCM · WIRELESS</span>
          <p>待上传模块图片</p>
        </div>
      </section>

      {/* ===== 下半：状态监控面板（待开发） ===== */}
      <section
        className="swm-monitors"
        aria-label="WDCM 输入状态"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
      >
        <Monitor title="充电开关 Charging" />
        <Monitor title="CAN 通信 Link" />
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

function Monitor({ title }: { title: string }) {
  return (
    <div className="monitor" style={{ ['--accent' as any]: ACCENT }}>
      <div className="monitor-head">
        <span className="monitor-dot" />
        <span className="monitor-title">{title}</span>
      </div>
      <div className="monitor-body">
        <span className="todo-state">待开发</span>
      </div>
    </div>
  );
}
