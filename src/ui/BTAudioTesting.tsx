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
  NOTPAIRED: '未配对',
  DISCOVERING: '扫描中',
  PAIRING: '配对中',
  PAIRED: '已配对',
  CONNECTING: '连接中',
  CONNECTED: '已连接',
  DISCONNECTING: '断开中',
  DISCONNECTED: '已断开',
  UNPAIRING: '解除中',
  UNPAIRED: '已解除',
  FAULT: '故障',
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
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
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
      <section className="swm-stage bta-radio" aria-label="蓝牙扫描与配对">
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
                aria-label="全局 ANC"
                onChange={(e) => {
                  const v = e.target.value as AncState;
                  if (v) bta.setAnc(v);
                }}
              >
                <option value="">{live ? '— 未报' : '—'}</option>
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
                aria-label="全局限幅器"
                onChange={(e) => {
                  const v = e.target.value as LimiterState;
                  if (v) bta.setLimiter(v);
                }}
              >
                <option value="">{live ? '— 未报' : '—'}</option>
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
                title="向模块发当前时间（0x2051）"
                onClick={() => bta.syncTime()}
              >
                对时
              </button>
              <button
                type="button"
                className="bta-btn is-mini"
                disabled={!live}
                title="读蓝牙状态 + 已配对列表（0x2003 / 0x3017）"
                onClick={() => bta.readAll()}
              >
                读状态
              </button>
            </div>
            <button
              type="button"
              className={`cwcm-enable ${snap.enabled ? 'is-on' : ''}`}
              disabled={!live}
              onClick={() => bta.setEnabled(!snap.enabled)}
              aria-pressed={snap.enabled === true}
              title="下发 0x2001；开关状态以模块上报为准"
            >
              <span className="cwcm-enable-dot" />
              <span className="cwcm-enable-label">蓝牙使能</span>
              <strong className="cwcm-enable-state">
                {snap.enabled === null ? '—' : snap.enabled ? 'ON' : 'OFF'}
              </strong>
            </button>
          </div>

          <div className="bta-head-route">
            <span className="pw-label">输出</span>
            <span className={`bta-out-count ${aud.canRoute ? 'is-on' : ''}`}>
              {aud.devices.length} 路{aud.canRoute ? '' : '（未授权）'}
            </span>
            {!aud.canRoute && (
              <button
                type="button"
                className="bta-btn is-mini is-primary"
                title="允许一次麦克风权限，系统才会给出声卡名字"
                onClick={() => void audioOut.grant()}
              >
                授权
              </button>
            )}
            <button
              type="button"
              className="bta-btn is-mini"
              title="重新枚举一次输出设备"
              onClick={() => void audioOut.refresh()}
            >
              刷新
            </button>
            <span className={`bta-audio-state is-${aud.tone}`} title={aud.status}>
              {aud.status}
            </span>
            <span className="bta-strip-sep" />
            <span className="pw-label">模块</span>
            {live ? (
              <>
                <b className="bta-link is-ok" title={`TX ${link.tx} 帧 / RX ${link.rx} 帧`}>
                  COM 已连
                </b>
                <button
                  type="button"
                  className="bta-btn is-mini"
                  onClick={() => void serialLink.disconnect()}
                >
                  断开
                </button>
              </>
            ) : (
              <>
                <b
                  className={`bta-link is-${link.state === 'error' ? 'bad' : link.state === 'opening' ? 'busy' : 'idle'}`}
                  title={link.note || '串口是独占的：连之前先关掉供应商上位机'}
                >
                  {link.note || (link.state === 'unsupported' ? '浏览器不支持' : '未连接')}
                </b>
                <button
                  type="button"
                  className="bta-btn is-mini is-primary"
                  disabled={link.state === 'opening'}
                  onClick={() => void connectLink()}
                  title="打开 WCCM 的 COM 口（先关掉供应商上位机，串口不能被两边同时占）"
                >
                  连接
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
                  ? '模块上报蓝牙是关闭的，扫描会被拒 —— 先点右上角「蓝牙使能」'
                  : '向模块发 SetBTRadioDiscoveryRequest（0x0011）'
              }
              onClick={() => bta.startDiscovery()}
            >
              开始扫描
            </button>
            <button
              type="button"
              className="bta-btn"
              disabled={!live || snap.discovery !== 'DISCOVERING'}
              onClick={() => bta.cancelDiscovery()}
            >
              取消扫描
            </button>
            <div className="bta-scan-state">
              <span>Discovery</span>
              <b className={`bta-chip is-${snap.discovery === 'DISCOVERING' ? 'busy' : 'idle'}`}>
                {live ? DISCOVERY_STATE_TEXT[snap.discovery] : '未连接'}
              </b>
            </div>
            <p className="bta-hint" title={snap.note}>
              {snap.note ||
                (live
                  ? snap.enabled === false
                    ? '蓝牙是关的：先点「蓝牙使能」，等显示 ON 再扫描'
                    : '设备与 btdevice_id 由模块上报'
                  : '未连接模块，下面的操作全部不可用')}
            </p>
          </div>

          <div className="bta-list is-found">
            <div className="bta-list-head">
              发现的设备 <em>NotifyBTDiscoveredDevice {hex(CDC.discDevice.msgId)}</em>
            </div>
            <ul className="bta-rows">
              {found.length === 0 && (
                <li className="bta-list-empty">
                  {!live
                    ? '未连接模块'
                    : snap.discovery === 'DISCOVERING'
                      ? '扫描中，等模块上报…'
                      : '暂无新设备 —— 点「开始扫描」'}
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
                    配对
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="bta-list is-paired">
            <div className="bta-list-head">
              已配对设备{' '}
              <em>
                Connect {hex(CDC.connect.msgId)} · Attach {hex(CDC.attach.msgId)}
              </em>
            </div>
            <ul className="bta-rows">
              {paired.length === 0 && (
                <li className="bta-list-empty">
                  {live ? '模块还没上报已配对设备' : '未连接模块'}
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
                      {connected ? '断开' : '连接'}
                    </button>
                    <select
                      className="bta-zone-select"
                      value={d.ch ?? ''}
                      disabled={!live || !connected}
                      aria-label={`id=${d.id} 挂载 Zone`}
                      onChange={(e) => bta.attach(d.id, Number(e.target.value))}
                    >
                      <option value="" disabled>
                        {connected ? '挂载到…' : '需先连接'}
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
                      取消配对
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== ② 4 个 Zone 的挂载视图 ===== */}
      <section className="bta-zones" aria-label="Zone 挂载状态">
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
                  {d ? (d.playing ? '播放中' : '已挂载') : '未挂载'}
                </span>
              </div>

              <div className={`bta-ch-dev ${d ? '' : 'is-none'}`}>
                {d ? `id=${d.id} · ${d.name}` : '— 模块没报挂载 —'}
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
                    aria-label={`Ch${z.ch} 音量`}
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
                  aria-label={`Ch${z.ch} 绑定的声卡`}
                  onChange={(e) => audioOut.bindZone(z.ch, e.target.value)}
                >
                  <option value="">{aud.canRoute ? '未绑声卡' : '先授权'}</option>
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
                        {`已绑：${aud.devices.find((d) => d.id === aud.zoneSink[z.ch])?.label ?? '设备不在了'}`}
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
                  title={lane.hasFile ? `Ch${z.ch}：${lane.fileName}` : '给这一路单独选一个音频文件'}
                  onClick={() => fileRefs.current[z.ch]?.click()}
                >
                  {lane.hasFile ? lane.fileName : '选文件'}
                </button>
                <button
                  type="button"
                  className={`bta-btn is-mini ${d?.muted ? 'is-warn' : ''}`}
                  disabled={!live || !d}
                  title="发 0x2021 静音/取消静音；静音状态以模块上报为准"
                  onClick={() => d && bta.setMuted(d.id, !d.muted)}
                >
                  {d?.muted ? '取消静音' : '静音'}
                </button>
              </div>

              {/* 四条音轨各自独立放，互不影响 */}
              <div className="bta-ch-play">
                <button
                  type="button"
                  className={`bta-btn is-mini ${lane.playing ? '' : 'is-primary'}`}
                  disabled={!lane.hasFile || !aud.zoneSink[z.ch]}
                  title={aud.zoneSink[z.ch] ? '只放/停这一路' : '先把这一路绑到某一路声卡，免得从电脑默认输出跑出声'}
                  onClick={() => audioOut.toggle(z.ch)}
                >
                  {lane.playing ? '暂停' : '播放'}
                </button>
                <button
                  type="button"
                  className="bta-btn is-mini"
                  disabled={!lane.hasFile}
                  onClick={() => audioOut.stop(z.ch)}
                >
                  停止
                </button>
                <input
                  className="bl-range bta-ch-seek"
                  type="range"
                  min={0}
                  max={Math.max(1, Math.round(lane.duration))}
                  step={1}
                  value={Math.round(lane.position)}
                  disabled={!lane.hasFile}
                  aria-label={`Ch${z.ch} 播放进度`}
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
            TX＝下发 · RX＝模块上报 · TX {link.tx} / RX {link.rx}
            {link.bad ? ` · 丢弃 ${link.bad} 字节` : ''}
          </span>
          <button
            type="button"
            className="ghost bta-clear"
            onClick={() => bta.clearFrames()}
            disabled={snap.frames.length === 0}
          >
            清空
          </button>
        </div>
        <div className="sws-trace-body">
          {snap.frames.length === 0 ? (
            <div className="sws-trace-empty">
              {live
                ? '已连模块，等它上报…（连上时已自动发对时 / 读蓝牙状态 / 读配对列表）'
                : '未连接模块 —— 头栏第二行「模块 · 连接」，连之前先关掉供应商上位机'}
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