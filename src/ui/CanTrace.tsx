import { useEffect, useSyncExternalStore } from 'react';
import { canLink, type CanChannel, type CanFrame } from '../domain/canLink';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function clock(at: number) {
  const d = new Date(at);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function fmtId(id: number) {
  return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;
}

function fmtData(data: string) {
  return (data.match(/../g) ?? []).join(' ');
}

function channelLabel(c: CanChannel) {
  const rate = c.nominalBps ? ` · ${c.nominalBps / 1000}K` : '';
  return `${c.name}${rate}`;
}

function statusText(status: string) {
  switch (status) {
    case 'open': return 'Connected';
    case 'connecting': return 'Connecting…';
    case 'error': return 'Connection failed';
    default: return 'Not connected';
  }
}

function emptyText(s: ReturnType<typeof canLink.getSnapshot>) {
  if (s.status === 'error') return s.error;
  if (s.status === 'connecting') return 'Connecting…';
  if (s.status === 'open') return 'Connected, waiting for frames…';
  if (s.listError) return s.listError;
  if (s.channels.length === 0) return 'No open CAN channels — open one in BMCLI, then Refresh';
  if (s.selected) return 'Ready — click Connect';
  return 'Select a channel, then Connect';
}

function FrameRow({ f }: { f: CanFrame }) {
  return (
    <li className={`can-frame is-${f.dir}`} title={`${f.kind} · flags=0x${f.flags.toString(16).toUpperCase()}`}>
      <span className="can-t">{clock(f.at)}</span>
      <span className="can-dir">{f.dir.toUpperCase()}</span>
      <span className="can-id">{fmtId(f.id)}</span>
      <span className="can-dlc">{f.dlc}</span>
      <span className="can-data">{fmtData(f.data)}</span>
    </li>
  );
}

export function CanTrace() {
  const s = useSyncExternalStore(canLink.subscribe, canLink.getSnapshot);
  const connected = s.status === 'open' || s.status === 'connecting';

  useEffect(() => {
    if (s.channels.length === 0 && !s.listError) canLink.refreshChannels();
    // 只挂载时拉一次，之后靠「刷新」按钮
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TEMP-VERIFY: 截图用自动连接，验完删除
  useEffect(() => {
    if (s.selected && s.status === 'idle') canLink.connect();
  }, [s.selected, s.status]);

  return (
    <div className="sws-trace">
      <div className="sws-trace-head">
        <span className={`sws-trace-dot can-dot is-${s.status}`} />
        <span className="sws-trace-title">CAN Trace</span>
        <span className="sws-trace-sub" title={s.error || s.listError || undefined}>
          · {statusText(s.status)}
        </span>

        <div className="can-ctl">
          <select
            className="can-select"
            value={s.selected ?? ''}
            disabled={connected}
            onChange={(e) => canLink.select(e.target.value)}
          >
            <option value="">Select channel…</option>
            {s.channels.map((c) => (
              <option key={c.selector} value={c.selector}>{channelLabel(c)}</option>
            ))}
          </select>
          <button
            type="button"
            className="bta-btn is-mini"
            disabled={connected}
            onClick={() => canLink.refreshChannels()}
          >
            Refresh
          </button>
          {connected ? (
            <button type="button" className="bta-btn is-mini is-warn" onClick={() => canLink.disconnect()}>
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="bta-btn is-mini is-primary"
              disabled={!s.selected}
              onClick={() => canLink.connect()}
            >
              Connect
            </button>
          )}
          <span className="can-count">RX {s.rx} / TX {s.tx}{s.gaps ? ` · lost ${s.gaps}` : ''}</span>
          <button type="button" className="bta-btn is-mini" onClick={() => canLink.clearFrames()}>
            Clear
          </button>
        </div>
      </div>

      <div className="sws-trace-body">
        {s.frames.length === 0 ? (
          <div className="sws-trace-empty">{emptyText(s)}</div>
        ) : (
          <ul className="can-frames">
            {s.frames.map((f) => (
              <FrameRow key={f.seq} f={f} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}