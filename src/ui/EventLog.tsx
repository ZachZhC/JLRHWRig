import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { BenchEvent } from '../domain/types';
import { getLdfStore } from '../domain/ldfStore';
import { TraceFileBar } from './TraceFileBar';

/** Windows 页的 LIN Trace 用的 LDF（目前没有随包默认，导入后记住） */
const ldf = getLdfStore('window');

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

export function EventLog({ events, onClear }: { events: BenchEvent[]; onClear: () => void }) {
  const ldfSnap = useSyncExternalStore(ldf.subscribe, ldf.getSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ldf.init();
  }, []);

  return (
    <section className="card log">
      <div className="card-head">
        <h2>LIN Trace</h2>
        <div className="can-ctl">
          <button
            type="button"
            className="ghost"
            title={ldfSnap.status === 'ready' ? `Loaded: ${ldfSnap.fileName}` : 'Load an LDF for this page'}
            onClick={() => fileRef.current?.click()}
          >
            Input LDF
          </button>
          <button type="button" className="ghost" onClick={onClear} disabled={events.length === 0}>
            Clear
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".ldf,text/plain"
          className="trc-input"
          onChange={(e) => {
            const el = e.currentTarget;
            const f = el.files?.[0];
            if (f) ldf.loadFile(f);
            el.value = '';
          }}
        />
      </div>

      <TraceFileBar
        snap={ldfSnap}
        hint="Input LDF to decode frames"
        emptyLabel="No LDF"
        compact
      />

      <ul className="log-list">
        {events.length === 0 && <li className="log-empty">Waiting for switch input…</li>}
        {events.map((event) => (
          <li key={event.id} className={`log-item is-${event.tone}`}>
            <span className="log-time">{formatTime(event.ts)}</span>
            <span className="log-door">{event.door ?? 'SYS'}</span>
            <span className="log-body">
              <span className="log-title">{event.title}</span>
              {event.detail && <span className="log-detail">{event.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}