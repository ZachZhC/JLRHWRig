/**
 * WCCM-BT Testing —— 蓝牙耳机音频
 *
 * ① 扫描 / 发现 / 配对：全部是真模块上报
 * ② 4 个 Zone：模块上报的挂载 + 浏览器真实出声（每路自己的文件 / 声卡 / 播放头）
 * ③ CDC Trace：真实串口收发
 *
 * 这一页没有模拟：没连模块时所有开关都是灰的，连上之后模块报什么就显示什么。
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { audioOut, groupSinks } from '../domain/audioout';
import {
  bta,
  DEVICE_TYPE,
  DISCOVERY_STATE_TEXT,
  VOLUME_MAX,
  ZONES,
  type AncState,
  type DevState,
  type LimiterState,
} from '../domain/btaudio';
import { CDC } from '../domain/cdc';
import { serialLink } from '../domain/serial';

/** EnumBTDeviceState 的 11 个状态 */
const STATE_TEXT: Record<DevState, string> = {
  NULL: '—',
  NOTPAIRED: 'Not paired',
  DISCOVERING: 'Discovering',
  PAIRING: 'Pairing',
  PAIRED: 'Paired',
  CONNECTING: 'Connecting',
  CONNECTED: 'Connected',
  DISCONNECTING: 'Disconnecting',
  DISCONNECTED: 'Disconnected',
  UNPAIRING: 'Unpairing',
  UNPAIRED: 'Unpaired',
  FAULT: 'Fault',
};

const STATE_TONE: Record<DevState, 'idle' | 'busy' | 'ok' | 'live' | 'bad'> = {
  NULL: 'idle',
  NOTPAIRED: 'idle',
  DISCOVERING: 'busy',
  PAIRING: 'busy',
  PAIRED: 'ok',
  CONNECTING: 'busy',
  CONNECTED: 'ok',
  DISCONNECTING: 'busy',
  DISCONNECTED: 'idle',
  UNPAIRING: 'busy',
  UNPAIRED: 'idle',
  FAULT: 'bad',
};

const ANC_OPTIONS: AncState[] = ['OFF', 'ON', 'AMBIENT'];
const LIMITER_OPTIONS: LimiterState[] = ['OFF', 'ON'];

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

function hex(v: number, digits = 4) {
  return `0x${v.toString(16).toUpperCase().padStart(digits, '0')}`;
}

function fmtSec(s: number) {
  const t = Math.max(0, Math.round(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function BTAudioTesting() {
  const snap = useSyncExternalStore(bta.subscribe, bta.getSnapshot);
  const aud = useSyncExternalStore(audioOut.subscribe, audioOut.getSnapshot);
  const link = useSyncExternalStore(serialLink.subscribe, serialLink.getSnapshot);
  const live = link.state === 'open';
  /** 四条音轨各自的文件选择框，下标即 Ch 号 */
  const fileRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);
  const wasLive = useRef(false);

  useEffect(() => {
    audioOut.init();
  }, []);

  // 真机报文直接进状态机 + Trace
  useEffect(() => {
    serialLink.onFrame = (m, dir) => bta.ingest(m, dir);
    return () => {
      serialLink.onFrame = null;
    };
  }, []);

  // 链路断了，页面上就不能再留着上一次的设备状态
  useEffect(() => {
    if (live) {
      wasLive.current = true;
    } else if (wasLive.current) {
      wasLive.current = false;
      bta.reset();
    }
  }, [live]);

  const connectLink = async () => {
    if (await serialLink.connect()) await serialLink.handshake();
  };

  const onFile = (ch: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) audioOut.loadFile(ch, file);
    e.target.value = '';
  };

  const found = snap.devices.filter((d) => !d.paired);
  const paired = snap.devices.filter((d) => d.paired);
  /** 模块自己的 UAC 端点单独一组，其余收到"其他输出"里 */
  const sinkGroups = groupSinks(aud.devices, link.usb?.text ?? null);

  return (
    <div className="swm-page">
      {/* ===== ① 扫描 / 发现 / 配对 ===== */}
      <section className="swm-stage bta-radio" aria-label="Bluetooth scan and pairing">
        <div className="bta-head">
          <div className="bta-head-main">
            <span className="cwcm-module-name">
              WCCM - Wireless Connectivity Controller Module · BT Audio
            </span>
            <div className="bta-globals">
              <span className="pw-label">ANC</span>
              <select
                className="bta-gsel"
                value={snap.anc ?? ''}
                disabled={!live}
                aria-label="Global ANC"
                onChange={(e) => {
                  const v = e.target.value as AncState;
                  if (v) bta.setAnc(v);
                }}
              >
                <option value="">{live ? '— not reported' : '—'}</option>
                {ANC_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <span className="pw-label">Limiter</span>
              <select
                className="bta-gsel"
                value={snap.limiter ?? ''}
                disabled={!live}
                aria-label="Global limiter"
                onChange={(e) => {
                  const v = e.target.value as LimiterState;
                  if (v) bta.setLimiter(v);
                }}
              >
                <option value="">{live ? '— not reported' : '—'}</option>
                {LIMITER_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="bta-btn is-mini"
                disabled={!live}
                title="Send the current time to the module (0x2051)"
                onClick={() => bta.syncTime()}
              >
                Sync Time
              </button>
              <button
                type="button"
                className="bta-btn is-mini"
                disabled={!live}
                title="Read BT state + paired list (0x2003 / 0x3017)"
                onClick={() => bta.readAll()}
              >
                Read State
              </button>
            </div>
            <button
              type="button"
              className={`cwcm-enable ${snap.enabled ? 'is-on' : ''}`}
              disabled={!live}
              onClick={() => bta.setEnabled(!snap.enabled)}
              aria-pressed={snap.enabled === true}
              title="Send 0x2001; the switch state follows module reports"
            >
              <span className="cwcm-enable-dot" />
              <span className="cwcm-enable-label">BT Enable</span>
              <strong className="cwcm-enable-state">
                {snap.enabled === null ? '—' : snap.enabled ? 'ON' : 'OFF'}
              </strong>
            </button>
          </div>

          <div className="bta-head-route">
            <span className="pw-label">Output</span>
            <span className={`bta-out-count ${aud.canRoute ? 'is-on' : ''}`}>
              {aud.devices.length} routes{aud.canRoute ? '' : ' (not authorized)'}
            </span>
            {!aud.canRoute && (
              <button
                type="button"
                className="bta-btn is-mini is-primary"
                title="Allow microphone access once so the system reveals device names"
                onClick={() => void audioOut.grant()}
              >
                Authorize
              </button>
            )}
            <button
              type="button"
              className="bta-btn is-mini"
              title="Re-enumerate output devices"
              onClick={() => void audioOut.refresh()}
            >
              Refresh
            </button>
            <span className={`bta-audio-state is-${aud.tone}`} title={aud.status}>
              {aud.status}
            </span>
            <span className="bta-strip-sep" />
            <span className="pw-label">Module</span>
            {live ? (
              <>
                <b className="bta-link is-ok" title={`TX ${link.tx} frames / RX ${link.rx} frames`}>
                  COM connected
                </b>
                <button
                  type="button"
                  className="bta-btn is-mini"
                  onClick={() => void serialLink.disconnect()}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <b
                  className={`bta-link is-${link.state === 'error' ? 'bad' : link.state === 'opening' ? 'busy' : 'idle'}`}
                  title={link.note || 'The COM port is exclusive: close the vendor tool before connecting'}
                >
                  {link.note || (link.state === 'unsupported' ? 'Browser unsupported' : 'Not connected')}
                </b>
                <button
                  type="button"
                  className="bta-btn is-mini is-primary"
                  disabled={link.state === 'opening'}
                  onClick={() => void connectLink()}
                  title="Open the WCCM COM port (close the vendor tool first — the port cannot be shared)"
                >
                  Connect
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bta-radio-body">
          <div className="bta-scan">
            <button
              type="button"
              className="bta-btn is-primary"
              disabled={!live || snap.discovery === 'DISCOVERING' || snap.enabled === false}
              title={
                snap.enabled === false
                  ? 'Module reports Bluetooth off — scans will be rejected; press "BT Enable" first'
                  : 'Send SetBTRadioDiscoveryRequest (0x0011) to the module'
              }
              onClick={() => bta.startDiscovery()}
            >
              Start Scan
            </button>
            <button
              type="button"
              className="bta-btn"
              disabled={!live || snap.discovery !== 'DISCOVERING'}
              onClick={() => bta.cancelDiscovery()}
            >
              Cancel Scan
            </button>
            <div className="bta-scan-state">
              <span>Discovery</span>
              <b className={`bta-chip is-${snap.discovery === 'DISCOVERING' ? 'busy' : 'idle'}`}>
                {live ? DISCOVERY_STATE_TEXT[snap.discovery] : 'Not connected'}
              </b>
            </div>
            <p className="bta-hint" title={snap.note}>
              {snap.note ||
                (live
                  ? snap.enabled === false
                    ? 'Bluetooth is off: press "BT Enable", wait for ON, then scan'
                    : 'Devices and btdevice_id are reported by the module'
                  : 'Module not connected — the actions below are unavailable')}
            </p>
          </div>

          <div className="bta-list is-found">
            <div className="bta-list-head">
              Discovered <em>NotifyBTDiscoveredDevice {hex(CDC.discDevice.msgId)}</em>
            </div>
            <ul className="bta-rows">
              {found.length === 0 && (
                <li className="bta-list-empty">
                  {!live
                    ? 'Module not connected'
                    : snap.discovery === 'DISCOVERING'
                      ? 'Scanning, waiting for module…'
                      : 'No new devices — press "Start Scan"'}
                </li>
              )}
              {found.map((d) => (
                <li key={d.id} className="bta-row">
                  <span className="bta-row-id">id {d.id}</span>
                  <span className="bta-row-name">{d.name}</span>
                  <span className="bta-row-type">{DEVICE_TYPE[d.type]}</span>
                  <span className="bta-row-rssi">{d.rssi != null ? `${d.rssi} dBm` : '—'}</span>
                  <button
                    type="button"
                    className="bta-btn is-mini"
                    disabled={!live}
                    onClick={() => bta.pair(d.id)}
                  >
                    Pair
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="bta-list is-paired">
            <div className="bta-list-head">
              Paired devices{' '}
              <em>
                Connect {hex(CDC.connect.msgId)} · Attach {hex(CDC.attach.msgId)}
              </em>
            </div>
            <ul className="bta-rows">
              {paired.length === 0 && (
                <li className="bta-list-empty">
                  {live ? 'Module has not reported paired devices yet' : 'Module not connected'}
                </li>
              )}
              {paired.map((d) => {
                const connected = d.state === 'CONNECTED';
                const busy =
                  d.state === 'CONNECTING' || d.state === 'DISCONNECTING' || d.state === 'PAIRING';
                return (
                  <li key={d.id} className={`bta-row is-${STATE_TONE[d.state]}`}>
                    <span className="bta-row-id">id {d.id}</span>
                    <span className="bta-row-name">{d.name}</span>
                    <span className={`bta-chip is-${STATE_TONE[d.state]}`}>{STATE_TEXT[d.state]}</span>
                    <button
                      type="button"
                      className={`bta-btn is-mini ${connected ? '' : 'is-primary'}`}
                      disabled={!live || busy}
                      onClick={() => (connected ? bta.disconnect(d.id) : bta.connect(d.id))}
                    >
                      {connected ? 'Disconnect' : 'Connect'}
                    </button>
                    <select
                      className="bta-zone-select"
                      value={d.ch ?? ''}
                      disabled={!live || !connected}
                      aria-label={`id=${d.id} attach zone`}
                      onChange={(e) => bta.attach(d.id, Number(e.target.value))}
                    >
                      <option value="" disabled>
                        {connected ? 'Attach to…' : 'Connect first'}
                      </option>
                      {ZONES.map((z) => (
                        <option key={z.ch} value={z.ch}>
                          Ch{z.ch} {z.seat}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="bta-btn is-mini is-warn"
                      disabled={!live || connected || busy}
                      onClick={() => bta.unpair(d.id)}
                    >
                      Unpair
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== ② 4 个 Zone 的挂载视图 ===== */}
      <section className="bta-zones" aria-label="Zone attachment state">
        {ZONES.map((z) => {
          const d = snap.devices.find((x) => x.ch === z.ch);
          const lane = aud.lanes[z.ch];
          return (
            <div key={z.ch} className={`bta-ch is-${d ? (d.playing ? 'live' : 'ok') : 'idle'}`}>
              <div className="bta-ch-head">
                <span className="bta-ch-num">Ch{z.ch}</span>
                <span className="bta-ch-seat">
                  {z.seat} <em>{z.zoneName}</em>
                </span>
                <span className={`bta-chip is-${d ? (d.playing ? 'live' : 'ok') : 'idle'}`}>
                  {d ? (d.playing ? 'Playing' : 'Attached') : 'Not attached'}
                </span>
              </div>

              <div className={`bta-ch-dev ${d ? '' : 'is-none'}`}>
                {d ? `id=${d.id} · ${d.name}` : '— no attachment reported —'}
              </div>

              {d && (
                <div className="bta-vol">
                  <div className="bta-vol-top">
                    <span className="pw-label">Volume</span>
                    <span className={`bta-vol-val ${d.muted ? 'is-mute' : ''}`}>
                      {d.volume ?? '—'}
                      <em>/{VOLUME_MAX}</em>
                      <strong>{d.volume === null ? '—' : `${Math.round((d.volume / VOLUME_MAX) * 100)}%`}</strong>
                    </span>
                  </div>
                  <input
                    className="bl-range"
                    type="range"
                    min={0}
                    max={VOLUME_MAX}
                    step={1}
                    value={d.volume ?? 0}
                    disabled={!live || d.volume === null}
                    aria-label={`Ch${z.ch} volume`}
                    onChange={(e) => bta.setVolume(d.id, Number(e.target.value))}
                  />
                </div>
              )}

              <div className="bta-ch-stats">
                <span>
                  Latency <b>{d?.latency != null ? `${d.latency} ms` : '—'}</b>
                </span>
                <span>
                  Battery <b>{d?.battery != null ? `${d.battery}%` : '—'}</b>
                </span>
                <span>
                  RSSI <b>{d?.rssi != null ? `${d.rssi} dBm` : '—'}</b>
                </span>
              </div>

              <div className="bta-ch-actions">
                <select
                  className="bta-ch-sink"
                  value={aud.zoneSink[z.ch] ?? ''}
                  disabled={!aud.canRoute}
                  aria-label={`Ch${z.ch} output device`}
                  onChange={(e) => audioOut.bindZone(z.ch, e.target.value)}
                >
                  <option value="">{aud.canRoute ? 'Unbound' : 'Authorize'}</option>
                  {sinkGroups.map((g) => (
                    <optgroup key={g.key} label={g.title}>
                      {g.items.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {aud.zoneSink[z.ch] &&
                    !sinkGroups.some((g) => g.items.some((s) => s.id === aud.zoneSink[z.ch])) && (
                      <option value={aud.zoneSink[z.ch]}>
                        {`Bound: ${aud.devices.find((d) => d.id === aud.zoneSink[z.ch])?.label ?? 'device gone'}`}
                      </option>
                    )}
                </select>
                <input
                  ref={(el) => {
                    fileRefs.current[z.ch] = el;
                  }}
                  type="file"
                  accept="audio/*"
                  className="bta-file"
                  onChange={(e) => onFile(z.ch, e)}
                />
                <button
                  type="button"
                  className={`bta-btn is-mini is-file ${lane.hasFile ? 'is-on' : ''}`}
                  title={lane.hasFile ? `Ch${z.ch}: ${lane.fileName}` : 'Choose an audio file for this channel only'}
                  onClick={() => fileRefs.current[z.ch]?.click()}
                >
                  {lane.hasFile ? lane.fileName : 'Choose file'}
                </button>
                <button
                  type="button"
                  className={`bta-btn is-mini ${d?.muted ? 'is-warn' : ''}`}
                  disabled={!live || !d}
                  title="Send 0x2021 mute/unmute; mute state follows module reports"
                  onClick={() => d && bta.setMuted(d.id, !d.muted)}
                >
                  {d?.muted ? 'Unmute' : 'Mute'}
                </button>
              </div>

              {/* 四条音轨各自独立放，互不影响 */}
              <div className="bta-ch-play">
                <button
                  type="button"
                  className={`bta-btn is-mini ${lane.playing ? '' : 'is-primary'}`}
                  disabled={!lane.hasFile || !aud.zoneSink[z.ch]}
                  title={aud.zoneSink[z.ch] ? 'Play/stop this channel only' : 'Bind this channel to an output first so audio does not leak to the default device'}
                  onClick={() => audioOut.toggle(z.ch)}
                >
                  {lane.playing ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  className="bta-btn is-mini"
                  disabled={!lane.hasFile}
                  onClick={() => audioOut.stop(z.ch)}
                >
                  Stop
                </button>
                <input
                  className="bl-range bta-ch-seek"
                  type="range"
                  min={0}
                  max={Math.max(1, Math.round(lane.duration))}
                  step={1}
                  value={Math.round(lane.position)}
                  disabled={!lane.hasFile}
                  aria-label={`Ch${z.ch} playback position`}
                  onChange={(e) => audioOut.seek(z.ch, Number(e.target.value))}
                />
                <span className="bta-ch-time">
                  {fmtSec(lane.position)} / {fmtSec(lane.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {/* ===== ③ CDC Trace（只有真实串口收发） ===== */}
      <div className="sws-trace bta-trace">
        <div className="sws-trace-head">
          <span className="sws-trace-dot" />
          <span className="sws-trace-title">CDC Trace</span>
          <span className="sws-trace-sub">
            TX = request · RX = module report · TX {link.tx} / RX {link.rx}
            {link.bad ? ` · dropped ${link.bad} bytes` : ''}
          </span>
          <button
            type="button"
            className="ghost bta-clear"
            onClick={() => bta.clearFrames()}
            disabled={snap.frames.length === 0}
          >
            Clear
          </button>
        </div>
        <div className="sws-trace-body">
          {snap.frames.length === 0 ? (
            <div className="sws-trace-empty">
              {live
                ? 'Module connected, waiting for reports… (time sync / BT state / paired list were sent on connect)'
                : 'Module not connected — use "Module · Connect" on the second header row; close the vendor tool first'}
            </div>
          ) : (
            <ul className="bta-frames">
              {snap.frames.map((f) => (
                <li key={f.id} className={`bta-frame is-${f.dir === 'TX' ? 'tx' : 'rx'}`}>
                  <span className="bta-t">{fmtTime(f.ts)}</span>
                  <span className="bta-dir">{f.dir}</span>
                  <span className="bta-hex">
                    pt{f.pt} {hex(f.msgId)} mt{f.mt}
                  </span>
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